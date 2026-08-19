-- Read-only data-integrity scanner: finds referential orphans, money
-- mismatches, and treatment<->invoice sync drift in the live database
-- without ever writing to clinical data. Built from
-- INTEGRITY-CHECKER.md (user-supplied spec, revised to manual-trigger-only
-- after the 2026-07-20 GitHub Actions retirement made a scheduled job the
-- wrong default here).
--
-- Two tables:
--   integrity_findings   -- one row per (check_name, entity_id), upserted
--                            on every run; never auto-resolved/deleted by
--                            anything but the scan itself.
--   integrity_scan_runs  -- one row per scan invocation. Exists because
--                            v1 has NO scheduler -- without a "last scan: N
--                            ago" timestamp, an empty findings list is
--                            indistinguishable from "nobody has run this
--                            in months." This is the safety net that a
--                            cron-based design wouldn't need.
--
-- All writes (including the upsert/resolve pass) happen inside
-- run_integrity_scan(), a SECURITY DEFINER function granted ONLY to
-- service_role -- same posture as get_storage_usage_stats() (051). The
-- browser never calls it directly; functions/api/integrity-scan.ts and
-- scripts/integrity/scan.mjs both hold the service_role key server-side
-- and call supabase.rpc('run_integrity_scan', ...). Its p_dry_run
-- parameter runs every check for real, then rolls back every write (see
-- the function body for how) -- scan.mjs --dry-run uses this to preview a
-- new/changed check against production before trusting it.
--
-- Admin can read + mark reviewed. Doctor can read only (current_app_role()
-- from 038). Operator sees neither table -- no policy admits that role.
--
-- Deliberately EXCLUDED from both backup lists (scripts/backup/lib.mjs
-- TABLES_IN_DEPENDENCY_ORDER and src/lib/deviceBackup.ts BACKUP_TABLES):
-- this is derived state, fully regenerable by re-running the scan, same
-- reasoning already applied to backup_upload_claims (060) and
-- offline_edit_queue (054). Do not add it to either list.

CREATE TABLE IF NOT EXISTS public.integrity_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  entity_table TEXT NOT NULL,
  -- TEXT, not UUID: edit_history/delete_history use text entity_id, and
  -- table-level findings (e.g. doctor_profiles row count) have no single
  -- row id at all.
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL,
  -- Lets a re-flagged-but-already-reviewed finding reopen when the
  -- underlying values actually changed, per the spec's upsert rule.
  details_hash TEXT NOT NULL,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when a scan run no longer reproduces this finding. The panel hides
  -- resolved rows by default; kept (not deleted) so "this used to be
  -- broken" stays answerable.
  resolved_at TIMESTAMPTZ,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES public.app_users(id),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (check_name, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_integrity_findings_reviewed_severity
  ON public.integrity_findings (reviewed, severity);
CREATE INDEX IF NOT EXISTS idx_integrity_findings_entity
  ON public.integrity_findings (entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_integrity_findings_resolved_at
  ON public.integrity_findings (resolved_at);

CREATE TABLE IF NOT EXISTS public.integrity_scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
  triggered_by TEXT, -- 'admin-panel' | 'local-script'
  counts JSONB,       -- {critical, warning, info, resolved_this_run}
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_integrity_scan_runs_started_at
  ON public.integrity_scan_runs (started_at DESC);

ALTER TABLE public.integrity_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrity_scan_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrity_findings_select" ON public.integrity_findings;
CREATE POLICY "integrity_findings_select" ON public.integrity_findings
  FOR SELECT TO authenticated
  USING (public.is_app_admin() OR public.current_app_role() = 'doctor');

DROP POLICY IF EXISTS "integrity_findings_update" ON public.integrity_findings;
CREATE POLICY "integrity_findings_update" ON public.integrity_findings
  FOR UPDATE TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
-- No INSERT/DELETE policy for authenticated -- rows are only ever written
-- by run_integrity_scan(), which runs as SECURITY DEFINER and bypasses RLS.

DROP POLICY IF EXISTS "integrity_scan_runs_select" ON public.integrity_scan_runs;
CREATE POLICY "integrity_scan_runs_select" ON public.integrity_scan_runs
  FOR SELECT TO authenticated
  USING (public.is_app_admin() OR public.current_app_role() = 'doctor');

-- Easy-to-forget step (per the 040 post-mortem, repeated in every table
-- migration since): default privileges only revoke anon for future
-- tables, they don't grant authenticated. Without this, PostgREST reports
-- "table not found in schema cache" -- looks like a stale-cache bug, is
-- actually a missing GRANT. Deliberately SELECT/UPDATE only, no
-- INSERT/DELETE -- the app never creates or removes findings.
GRANT SELECT, UPDATE ON public.integrity_findings TO authenticated;
GRANT SELECT ON public.integrity_scan_runs TO authenticated;

-- === Money-formula helper ===================================================
-- Mirrors parseCurrency() (src/lib/billing.ts) applied to a JSONB->>text
-- extraction: non-numeric or blank -> 0, otherwise rounded to 2dp. Used
-- only inside run_integrity_scan() below.
CREATE OR REPLACE FUNCTION public.integrity_num(v TEXT)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN v IS NULL OR trim(v) = '' THEN 0
    WHEN v ~ '^-?[0-9]+(\.[0-9]+)?$' THEN round(v::numeric, 2)
    ELSE 0
  END
$$;

REVOKE ALL ON FUNCTION public.integrity_num(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integrity_num(TEXT) TO service_role;

-- === The scan =================================================================
-- SECURITY DEFINER, service_role-only (same posture as
-- get_storage_usage_stats(), 051): the browser never calls this. Every
-- check below is an independent INSERT ... SELECT ... ON CONFLICT so one
-- can be added or removed without touching the others. Every money/sync
-- check excludes invoices.status = 'Merged' -- merged invoices carry
-- summed totals with no tax_rate/discount_type and legitimately fail
-- naive recomputation.
CREATE OR REPLACE FUNCTION public.run_integrity_scan(p_triggered_by TEXT DEFAULT NULL, p_dry_run BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_run_id UUID;
  v_run_started_at TIMESTAMPTZ;
  v_counts JSONB;
  v_critical_count INT;
BEGIN
  IF auth.role() NOT IN ('service_role') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO integrity_scan_runs (triggered_by) VALUES (
    CASE WHEN p_dry_run THEN COALESCE(p_triggered_by, '') || ' (dry-run)' ELSE p_triggered_by END
  )
  RETURNING id, started_at INTO v_run_id, v_run_started_at;

  -- p_dry_run wraps every write below (checks -> _scan_hits is a temp
  -- table, harmless either way; the upsert/resolve pass against
  -- integrity_findings and the app_notifications insert are the real
  -- writes) in a nested block that deliberately raises and catches its
  -- own sentinel exception. In PL/pgSQL a BEGIN...EXCEPTION...END block is
  -- an implicit savepoint: raising inside it and catching that exact
  -- exception rolls back every table write made since the block started,
  -- while plain variable assignments (v_counts) survive because those
  -- aren't transactional. This gives scripts/integrity/scan.mjs --dry-run
  -- a true no-write preview via the same RPC path production uses, not a
  -- second copy of the checks.
  BEGIN

  -- Findings table for this run: every check appends here first, then a
  -- single pass below upserts into integrity_findings and resolves
  -- anything not touched. Using a scratch table (rather than upserting
  -- per-check) makes the "resolve what wasn't found this run" step a
  -- single NOT EXISTS query instead of N per-check ones.
  CREATE TEMP TABLE _scan_hits (
    check_name TEXT NOT NULL,
    severity TEXT NOT NULL,
    entity_table TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB NOT NULL
  ) ON COMMIT DROP;

  -- --- A. Referential orphans --------------------------------------------

  INSERT INTO _scan_hits
  SELECT 'orphan_payment_invoice', 'critical', 'payments', p.id::text,
    jsonb_build_object('invoice_id', p.invoice_id, 'amount', p.amount)
  FROM payments p
  WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = p.invoice_id);

  INSERT INTO _scan_hits
  SELECT 'orphan_patient_visit', 'critical', 'patient_visits', v.id::text,
    jsonb_build_object('patient_id', v.patient_id, 'visit_date', v.visit_date)
  FROM patient_visits v
  WHERE v.patient_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = v.patient_id);

  INSERT INTO _scan_hits
  SELECT 'orphan_treatment_patient', 'critical', 'treatments', t.id::text,
    jsonb_build_object('patient_id', t.patient_id, 'treatment_type', t.treatment_type)
  FROM treatments t
  WHERE t.patient_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = t.patient_id);

  INSERT INTO _scan_hits
  SELECT 'orphan_invoice_patient', 'critical', 'invoices', i.id::text,
    jsonb_build_object('patient_id', i.patient_id, 'invoice_number', i.invoice_number)
  FROM invoices i
  WHERE i.patient_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = i.patient_id);

  INSERT INTO _scan_hits
  SELECT 'orphan_prescription_patient', 'critical', 'prescriptions', pr.id::text,
    jsonb_build_object('patient_id', pr.patient_id)
  FROM prescriptions pr
  WHERE pr.patient_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = pr.patient_id);

  INSERT INTO _scan_hits
  SELECT 'orphan_appointment_patient', 'critical', 'appointments', a.id::text,
    jsonb_build_object('patient_id', a.patient_id, 'date_time', a.date_time)
  FROM appointments a
  WHERE a.patient_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = a.patient_id);

  INSERT INTO _scan_hits
  SELECT 'orphan_treatment_appointment', 'critical', 'treatments', t.id::text,
    jsonb_build_object('appointment_id', t.appointment_id)
  FROM treatments t
  WHERE t.appointment_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = t.appointment_id);

  -- --- B. Money ------------------------------------------------------------

  -- Headline check: recordInvoicePayment() (src/lib/payments.ts) has a
  -- legacy-schema fallback that can update invoices.paid_amount WITHOUT
  -- writing a payments ledger row. Tolerance 0.01 for float noise.
  INSERT INTO _scan_hits
  SELECT 'payments_ledger_mismatch', 'critical', 'invoices', i.id::text,
    jsonb_build_object(
      'invoice_number', i.invoice_number,
      'invoice_paid_amount', i.paid_amount,
      'payments_sum', COALESCE(pay.total, 0)
    )
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS total FROM payments GROUP BY invoice_id
  ) pay ON pay.invoice_id = i.id
  WHERE i.status IS DISTINCT FROM 'Merged'
    AND abs(COALESCE(i.paid_amount, 0) - COALESCE(pay.total, 0)) > 0.01;

  INSERT INTO _scan_hits
  SELECT 'invoice_overpaid', 'warning', 'invoices', i.id::text,
    jsonb_build_object('paid_amount', i.paid_amount, 'total_amount', i.total_amount)
  FROM invoices i
  WHERE i.status IS DISTINCT FROM 'Merged'
    AND COALESCE(i.paid_amount, 0) > COALESCE(i.total_amount, 0) + 0.01;

  INSERT INTO _scan_hits
  SELECT 'invoice_negative_amount', 'critical', 'invoices', i.id::text,
    jsonb_build_object('total_amount', i.total_amount, 'paid_amount', i.paid_amount)
  FROM invoices i
  WHERE COALESCE(i.total_amount, 0) < 0 OR COALESCE(i.paid_amount, 0) < 0;

  INSERT INTO _scan_hits
  SELECT 'treatment_negative_cost', 'critical', 'treatments', t.id::text,
    jsonb_build_object('cost', t.cost)
  FROM treatments t
  WHERE COALESCE(t.cost, 0) < 0;

  INSERT INTO _scan_hits
  SELECT 'treatment_negative_discount', 'info', 'treatments', t.id::text,
    jsonb_build_object('cost', t.cost, 'original_cost', t.original_cost)
  FROM treatments t
  WHERE t.original_cost IS NOT NULL AND t.original_cost < COALESCE(t.cost, 0);

  -- --- C. Invoice total recomputed from items -------------------------------
  -- Mirrors buildInvoiceRecalcPayload() (src/lib/billing.ts:434-486).
  -- late_fee_amount is deliberately NOT part of the formula, matching the
  -- app. has_unit_price means "key present, not null, not empty string" --
  -- the JS test is `${item.unit_price}` !== '' -- so an empty-string
  -- unit_price falls through to line_total, same as here.

  INSERT INTO _scan_hits
  SELECT 'invoice_total_mismatch', 'warning', 'invoices', i.id::text,
    jsonb_build_object(
      'invoice_number', i.invoice_number,
      'stored_total', i.total_amount,
      'recomputed_total', calc.total,
      'recomputed_subtotal', calc.subtotal
    )
  FROM invoices i
  JOIN LATERAL (
    SELECT
      COALESCE(SUM(
        CASE
          WHEN (item->>'unit_price') IS NOT NULL AND trim(item->>'unit_price') <> ''
            THEN round(
              (CASE WHEN integrity_num(item->>'quantity') > 0 THEN integrity_num(item->>'quantity') ELSE 1 END)
              * integrity_num(item->>'unit_price'), 2)
          ELSE integrity_num(COALESCE(item->>'line_total', item->>'amount'))
        END
      ), 0) AS subtotal
    FROM jsonb_array_elements(COALESCE(i.items, '[]'::jsonb)) AS item
  ) lines ON true
  JOIN LATERAL (
    SELECT
      lines.subtotal AS subtotal,
      CASE
        WHEN i.discount_type = 'percentage' AND COALESCE(i.discount_value, 0) > 0
          THEN round(lines.subtotal * i.discount_value / 100, 2)
        WHEN COALESCE(i.discount_value, 0) > 0
          THEN i.discount_value
        ELSE COALESCE(i.discount_amount, 0)
      END AS discount
  ) d ON true
  JOIN LATERAL (
    SELECT
      CASE
        WHEN COALESCE(i.tax_rate, 0) > 0
          THEN round(GREATEST(d.subtotal - d.discount, 0) * i.tax_rate / 100, 2)
        ELSE COALESCE(i.tax_amount, 0)
      END AS tax
  ) tx ON true
  JOIN LATERAL (
    SELECT
      d.subtotal AS subtotal,
      GREATEST(d.subtotal - d.discount + tx.tax - COALESCE(i.credit_amount, 0), 0) AS total
  ) calc ON true
  WHERE i.status IS DISTINCT FROM 'Merged'
    AND abs(COALESCE(i.total_amount, 0) - calc.total) > 0.01;

  -- --- D. Sync drift (treatments <-> invoices) ------------------------------
  -- The link is dual: treatments.invoice_id AND treatment ids embedded in
  -- invoices.items (source_treatment_id / source_treatment_ids). Neither
  -- alone is authoritative -- findLinkedInvoice() (src/lib/invoiceSync.ts)
  -- falls back to the JSONB scan.

  INSERT INTO _scan_hits
  SELECT 'treatment_flagged_invoiced_unlinked', 'warning', 'treatments', t.id::text,
    jsonb_build_object('invoice_id', t.invoice_id)
  FROM treatments t
  WHERE t.is_invoiced = true
    AND (t.invoice_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM invoices i WHERE i.id = t.invoice_id AND i.status IS DISTINCT FROM 'Merged'
    ))
    AND NOT EXISTS (
      SELECT 1 FROM invoices i2, jsonb_array_elements(COALESCE(i2.items, '[]'::jsonb)) item
      WHERE i2.status IS DISTINCT FROM 'Merged'
        AND (
          (item->>'source_treatment_id') = t.id::text
          OR (item->'source_treatment_ids') ? t.id::text
        )
    );

  INSERT INTO _scan_hits
  SELECT 'treatment_referenced_but_unlinked', 'warning', 'treatments', t.id::text,
    jsonb_build_object('invoices_items_says', i.id, 'treatment_invoice_id', t.invoice_id)
  FROM invoices i, jsonb_array_elements(COALESCE(i.items, '[]'::jsonb)) item
  JOIN treatments t ON t.id::text = COALESCE(item->>'source_treatment_id', '')
    OR (item->'source_treatment_ids') ? t.id::text
  WHERE i.status IS DISTINCT FROM 'Merged'
    AND (t.invoice_id IS NULL OR t.invoice_id <> i.id);

  INSERT INTO _scan_hits
  SELECT 'treatment_linked_to_merged_invoice', 'warning', 'treatments', t.id::text,
    jsonb_build_object('invoice_id', t.invoice_id)
  FROM treatments t
  JOIN invoices i ON i.id = t.invoice_id
  WHERE i.status = 'Merged';

  INSERT INTO _scan_hits
  SELECT 'invoice_status_mismatch', 'warning', 'invoices', i.id::text,
    jsonb_build_object(
      'stored_status', i.status,
      'expected_status',
        CASE
          WHEN COALESCE(i.paid_amount, 0) >= COALESCE(i.total_amount, 0) AND COALESCE(i.total_amount, 0) > 0 THEN 'Paid'
          WHEN COALESCE(i.paid_amount, 0) > 0 THEN 'Partial'
          ELSE 'Pending'
        END
    )
  FROM invoices i
  WHERE i.status IS DISTINCT FROM 'Merged'
    AND i.status IS DISTINCT FROM (
      CASE
        WHEN COALESCE(i.paid_amount, 0) >= COALESCE(i.total_amount, 0) AND COALESCE(i.total_amount, 0) > 0 THEN 'Paid'
        WHEN COALESCE(i.paid_amount, 0) > 0 THEN 'Partial'
        ELSE 'Pending'
      END
    );

  -- The 047 trigger stamps/clears completed_at on every status transition
  -- into/out of 'Completed'. A mismatch means a write bypassed it (e.g.
  -- raw SQL, a restore).
  INSERT INTO _scan_hits
  SELECT 'treatment_completed_at_mismatch', 'critical', 'treatments', t.id::text,
    jsonb_build_object('status', t.status, 'completed_at', t.completed_at)
  FROM treatments t
  WHERE (t.status = 'Completed' AND t.completed_at IS NULL)
     OR (t.status IS DISTINCT FROM 'Completed' AND t.completed_at IS NOT NULL);

  -- --- E. Doctor attribution -------------------------------------------------
  -- The 2026-08-02 incident: doctor_name is matched to app_users.full_name
  -- by case-insensitive string, not FK. A mismatch silently zeroes that
  -- doctor's payout analytics.

  INSERT INTO _scan_hits
  SELECT 'treatment_doctor_name_unmatched', 'warning', 'treatments', t.id::text,
    jsonb_build_object('doctor_name', t.doctor_name)
  FROM treatments t
  WHERE t.doctor_name IS NOT NULL AND trim(t.doctor_name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.is_active AND lower(u.full_name) = lower(t.doctor_name)
    );

  -- --- F. Audit-trail gaps -----------------------------------------------
  -- delete_history rows with restored_at IS NULL are EXPECTED orphans
  -- (that's what a successful delete looks like) -- excluded.
  --
  -- edit_history_orphan additionally excludes two EXPECTED cases, found by
  -- running this against production (2026-08-19): an edit_history row
  -- whose target was later deleted -- directly (a matching delete_history
  -- row for that exact entity_id) or via cascade (its owning patient was
  -- deleted, which cascades every child row away via ON DELETE CASCADE
  -- with only ONE delete_history row written, for the patient itself).
  -- Without both exclusions this check is a pure false-positive generator:
  -- of 70 "orphans" found in the first real run, all 70 fell into one of
  -- these two expected cases -- 41 direct, 29 cascade-via-patient, zero
  -- true gaps.

  INSERT INTO _scan_hits
  SELECT 'edit_history_orphan', 'warning', 'edit_history', eh.id::text,
    jsonb_build_object('entity_type', eh.entity_type, 'entity_id', eh.entity_id)
  FROM edit_history eh
  WHERE eh.entity_id ~ '^[0-9a-fA-F-]{36}$'
    AND (
      (eh.entity_type = 'patient' AND NOT EXISTS (SELECT 1 FROM patients x WHERE x.id::text = eh.entity_id)) OR
      (eh.entity_type = 'treatment' AND NOT EXISTS (SELECT 1 FROM treatments x WHERE x.id::text = eh.entity_id)) OR
      (eh.entity_type = 'prescription' AND NOT EXISTS (SELECT 1 FROM prescriptions x WHERE x.id::text = eh.entity_id)) OR
      (eh.entity_type = 'invoice' AND NOT EXISTS (SELECT 1 FROM invoices x WHERE x.id::text = eh.entity_id)) OR
      (eh.entity_type = 'inventory_item' AND NOT EXISTS (SELECT 1 FROM inventory_items x WHERE x.id::text = eh.entity_id)) OR
      (eh.entity_type = 'patient_visit' AND NOT EXISTS (SELECT 1 FROM patient_visits x WHERE x.id::text = eh.entity_id)) OR
      (eh.entity_type = 'lab_work' AND NOT EXISTS (SELECT 1 FROM lab_work x WHERE x.id::text = eh.entity_id)) OR
      (eh.entity_type = 'treatment_catalog_item' AND NOT EXISTS (SELECT 1 FROM treatment_catalog_items x WHERE x.id::text = eh.entity_id)) OR
      (eh.entity_type = 'custom_medication' AND NOT EXISTS (SELECT 1 FROM custom_medications x WHERE x.id::text = eh.entity_id))
    )
    -- Excluded case 1: the target itself was deleted through the normal
    -- app flow (a delete_history row exists for this exact entity_id).
    AND NOT EXISTS (SELECT 1 FROM delete_history dh WHERE dh.entity_id = eh.entity_id)
    -- Excluded case 2: the target's owning patient was deleted, cascading
    -- this row away without its own delete_history entry.
    AND NOT (
      eh.patient_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM delete_history dh
        WHERE dh.entity_id = eh.patient_id AND dh.entity_type = 'patient'
      )
    );

  INSERT INTO _scan_hits
  SELECT 'edit_history_unknown_entity_type', 'warning', 'edit_history', eh.id::text,
    jsonb_build_object('entity_type', eh.entity_type)
  FROM edit_history eh
  WHERE eh.entity_type NOT IN (
    'patient', 'treatment', 'prescription', 'invoice', 'inventory_item',
    'patient_visit', 'lab_work', 'treatment_catalog_item', 'custom_medication'
  );

  INSERT INTO _scan_hits
  SELECT 'delete_history_unknown_entity_type', 'warning', 'delete_history', dh.id::text,
    jsonb_build_object('entity_type', dh.entity_type)
  FROM delete_history dh
  WHERE dh.entity_type NOT IN (
    'patient', 'treatment', 'prescription', 'invoice', 'patient_file', 'inventory_item',
    'patient_visit', 'lab_work', 'treatment_catalog_item', 'custom_medication'
  );

  -- --- G. Structural -------------------------------------------------------

  INSERT INTO _scan_hits
  SELECT 'doctor_profiles_not_singleton', 'info', 'doctor_profiles', 'all',
    jsonb_build_object('row_count', (SELECT count(*) FROM doctor_profiles))
  WHERE (SELECT count(*) FROM doctor_profiles) > 1;

  INSERT INTO _scan_hits
  SELECT 'patient_code_type_mismatch', 'info', 'patients', p.id::text,
    jsonb_build_object('patient_type', p.patient_type, 'patient_code', p.patient_code)
  FROM patients p
  WHERE (p.patient_type = 'consultation' AND p.patient_code ~ '^PT-[0-9]+$')
     OR (p.patient_type = 'full' AND p.patient_code ~ '^CO-[0-9]+$');

  INSERT INTO _scan_hits
  SELECT 'patient_code_missing', 'warning', 'patients', p.id::text,
    jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name)
  FROM patients p
  WHERE p.patient_code IS NULL;

  -- The 2026-07-22 pollution incident (CLAUDE.md hard rule 8, migration
  -- 037): detection only, this never calls setval.
  INSERT INTO _scan_hits
  SELECT 'patient_code_seq_drift', 'info', 'patients', 'sequence',
    jsonb_build_object(
      'seq_last_value', (SELECT last_value FROM patient_code_seq),
      'max_pt_offset', (
        SELECT COALESCE(MAX(SUBSTRING(patient_code FROM 4)::bigint - 100000), 0)
        FROM patients WHERE patient_code ~ '^PT-[0-9]+$'
      )
    )
  WHERE (SELECT last_value FROM patient_code_seq) <> (
    SELECT COALESCE(MAX(SUBSTRING(patient_code FROM 4)::bigint - 100000), 0)
    FROM patients WHERE patient_code ~ '^PT-[0-9]+$'
  );

  -- --- Upsert pass -----------------------------------------------------------
  -- details_hash lets a re-flag with changed values reopen an
  -- already-reviewed finding; an unchanged re-flag leaves reviewed alone.

  INSERT INTO integrity_findings (check_name, severity, entity_table, entity_id, details, details_hash, last_seen_at, resolved_at)
  SELECT h.check_name, h.severity, h.entity_table, h.entity_id, h.details, md5(h.details::text), now(), NULL
  FROM _scan_hits h
  ON CONFLICT (check_name, entity_id) DO UPDATE SET
    severity = EXCLUDED.severity,
    details = EXCLUDED.details,
    last_seen_at = now(),
    resolved_at = NULL,
    reviewed = CASE WHEN integrity_findings.details_hash = EXCLUDED.details_hash THEN integrity_findings.reviewed ELSE false END,
    reviewed_by = CASE WHEN integrity_findings.details_hash = EXCLUDED.details_hash THEN integrity_findings.reviewed_by ELSE NULL END,
    reviewed_at = CASE WHEN integrity_findings.details_hash = EXCLUDED.details_hash THEN integrity_findings.reviewed_at ELSE NULL END,
    details_hash = EXCLUDED.details_hash;

  -- Anything not touched by this run gets resolved -- the panel hides it
  -- by default but the history stays.
  UPDATE integrity_findings f
  SET resolved_at = now()
  WHERE f.resolved_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM _scan_hits h
      WHERE h.check_name = f.check_name AND h.entity_id = f.entity_id
    );

  SELECT jsonb_build_object(
    'critical', (SELECT count(*) FROM integrity_findings WHERE resolved_at IS NULL AND severity = 'critical'),
    'warning', (SELECT count(*) FROM integrity_findings WHERE resolved_at IS NULL AND severity = 'warning'),
    'info', (SELECT count(*) FROM integrity_findings WHERE resolved_at IS NULL AND severity = 'info'),
    'resolved_this_run', (SELECT count(*) FROM integrity_findings WHERE resolved_at >= v_run_started_at)
  ) INTO v_counts;

  -- Notify admins on a critical finding, deduped by title-since-timestamp
  -- the way addNotificationOnce() (src/lib/notifications.ts) does, so
  -- consecutive runs don't stack up entries. NotificationBell already
  -- polls app_notifications -- zero client changes needed. Deliberately
  -- INSIDE the dry-run rollback boundary: a preview run must never notify
  -- anyone.
  v_critical_count := (v_counts->>'critical')::int;
  IF v_critical_count > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM app_notifications
      WHERE title = 'Integrity scan found critical issues'
        AND created_at >= now() - interval '24 hours'
    ) THEN
      INSERT INTO app_notifications (title, message, link_to, audience)
      VALUES (
        'Integrity scan found critical issues',
        v_critical_count || ' critical finding(s) need review.',
        '/admin?tab=integrity',
        'admin'
      );
    END IF;
  END IF;

  -- v_counts is a plain PL/pgSQL variable, not a table row -- it survives
  -- the rollback below intact, so the caller still gets real numbers back
  -- from a dry run even though nothing was written.
  IF p_dry_run THEN
    RAISE EXCEPTION 'clinicmx_dry_run_rollback';
  END IF;

  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'clinicmx_dry_run_rollback' THEN
      NULL; -- swallow: everything since the nested BEGIN above (findings
            -- upsert/resolve, the notification insert) is rolled back to
            -- this block's implicit savepoint; v_counts is unaffected.
    ELSE
      RAISE; -- a real failure -- propagate to the outer handler below,
              -- which marks the run failed and re-raises to the caller.
    END IF;
  END; -- closes the nested dry-run-boundary block opened above

  -- Always runs, dry-run or not, so integrity_scan_runs reflects reality
  -- either way -- this is the "last scan: N ago" data the panel reads.
  UPDATE integrity_scan_runs
  SET finished_at = now(),
      status = 'ok',
      counts = v_counts,
      error = CASE WHEN p_dry_run THEN 'dry-run: findings/notification writes rolled back' ELSE NULL END
  WHERE id = v_run_id;

  RETURN v_counts;
EXCEPTION WHEN OTHERS THEN
  UPDATE integrity_scan_runs
  SET finished_at = now(), status = 'failed', error = SQLERRM
  WHERE id = v_run_id;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.run_integrity_scan(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_integrity_scan(TEXT, BOOLEAN) TO service_role;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.run_integrity_scan(TEXT, BOOLEAN);
-- DROP FUNCTION IF EXISTS public.integrity_num(TEXT);
-- DROP TABLE IF EXISTS public.integrity_findings;
-- DROP TABLE IF EXISTS public.integrity_scan_runs;
