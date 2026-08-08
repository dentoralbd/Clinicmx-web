-- Sitewide VISIBILITY (not execution) for offline-queued mutations. A
-- device's local IndexedDB outbox (src/lib/offlineSync.ts) stays the sole
-- place actual mutation data lives while queued — that never changes,
-- offline writes must keep working with zero connectivity, and no
-- unapproved clinical/financial payload should exist on the server before a
-- human explicitly approves it on the device that made it.
--
-- This table holds METADATA ONLY (who, patient, what kind, when — no
-- payload) so a still-pending edit is visible from any device/account, not
-- just the one that created it (Admin > Offline Edits sitewide view).
-- Approving/syncing an edit still only ever happens on the originating
-- device, which is why there is no payload column here to approve *from*.
--
-- Guarded with existence checks so this is safe to re-run against the live
-- project (matches the style of 045_staff_and_salary.sql / 052_staff_leaves.sql).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'offline_edit_queue' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.offline_edit_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      -- The local outbox mutation's own client-generated id (offlineSync.ts
      -- PendingMutation.id) — lets a device recognize "this staged report
      -- is the one I already have locally" instead of re-reporting
      -- duplicates on every reconnect, and lets it clean this row up the
      -- moment it locally syncs/discards that same mutation.
      client_mutation_id TEXT NOT NULL,
      group_id TEXT,
      seq INTEGER NOT NULL DEFAULT 0,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'update_many', 'delete')),
      -- Display-only summary — NOT the mutation payload. {patientId,
      -- patientName, label, detail}, same shape as PendingMutation.meta on
      -- the client. Deliberately no payload/data column: nothing here is
      -- ever applied to a real table from this row.
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      -- Who actually made the edit, resolved server-side by the BEFORE
      -- INSERT trigger below (never trust a client-supplied value here —
      -- this is what "own rows" RLS is scoped on).
      created_by_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
      -- Display string (e.g. "doctor:Jane Smith"), matching
      -- appSession.ts's getAuditActor() convention used everywhere else —
      -- cosmetic only, created_by_user_id is what RLS actually checks.
      actor TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'blocked', 'failed', 'synced', 'discarded')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      -- Locally-generated per-browser id, diagnostics only (e.g. telling
      -- apart "two of my own devices both have this queued").
      device_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      -- One staged row per (creator, local mutation) — a device re-reporting
      -- the same still-pending item on every reconnect should update, not
      -- duplicate.
      CONSTRAINT offline_edit_queue_creator_mutation_unique UNIQUE (created_by_user_id, client_mutation_id)
    );

    CREATE INDEX offline_edit_queue_status_idx ON public.offline_edit_queue (status);
    CREATE INDEX offline_edit_queue_creator_idx ON public.offline_edit_queue (created_by_user_id);
    CREATE INDEX offline_edit_queue_group_idx ON public.offline_edit_queue (group_id);
    CREATE INDEX offline_edit_queue_patient_idx ON public.offline_edit_queue (((meta ->> 'patientId')));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_offline_edit_queue_updated_at ON public.offline_edit_queue;
CREATE TRIGGER update_offline_edit_queue_updated_at BEFORE UPDATE ON public.offline_edit_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- === Identity-filling trigger ===============================================
--
-- Runs BEFORE the INSERT policy's WITH CHECK. SECURITY DEFINER + pinned
-- search_path, same hygiene as 038_auth_identity.sql / 052's
-- staff_leaves_fill_requester(). created_by_user_id and status are always
-- overwritten server-side — never trust the client for either, since
-- created_by_user_id is the whole basis of "own rows" access below and a
-- forged status could let a client insert something that looks
-- already-handled.
CREATE OR REPLACE FUNCTION public.offline_edit_queue_fill_creator()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.created_by_user_id := public.current_app_user_id();
  NEW.status := 'pending';
  NEW.attempts := 0;
  NEW.last_error := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.offline_edit_queue_fill_creator() FROM PUBLIC;

DROP TRIGGER IF EXISTS offline_edit_queue_fill_creator_trg ON public.offline_edit_queue;
CREATE TRIGGER offline_edit_queue_fill_creator_trg BEFORE INSERT ON public.offline_edit_queue
  FOR EACH ROW EXECUTE FUNCTION public.offline_edit_queue_fill_creator();

-- === RLS =====================================================================
-- Mirrors offlineSync.ts's client-side canActOn(): the account that created
-- an entry, or admin, may see/update/delete it. SELECT is intentionally the
-- only policy anyone besides the creator/admin needs — there is no
-- "approve this row" action here, since approving/syncing an edit always
-- happens against the real table (treatments/invoices/etc, governed by
-- that table's own RLS) from the device that still holds the actual data.

ALTER TABLE public.offline_edit_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offline_edit_queue_select_admin" ON public.offline_edit_queue;
CREATE POLICY "offline_edit_queue_select_admin" ON public.offline_edit_queue
  FOR SELECT TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "offline_edit_queue_select_own" ON public.offline_edit_queue;
CREATE POLICY "offline_edit_queue_select_own" ON public.offline_edit_queue
  FOR SELECT TO authenticated USING (created_by_user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "offline_edit_queue_insert_own" ON public.offline_edit_queue;
CREATE POLICY "offline_edit_queue_insert_own" ON public.offline_edit_queue
  FOR INSERT TO authenticated WITH CHECK (public.is_active_app_user());

DROP POLICY IF EXISTS "offline_edit_queue_update_admin" ON public.offline_edit_queue;
CREATE POLICY "offline_edit_queue_update_admin" ON public.offline_edit_queue
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "offline_edit_queue_update_own" ON public.offline_edit_queue;
CREATE POLICY "offline_edit_queue_update_own" ON public.offline_edit_queue
  FOR UPDATE TO authenticated
  USING (created_by_user_id = public.current_app_user_id())
  WITH CHECK (created_by_user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "offline_edit_queue_delete_admin" ON public.offline_edit_queue;
CREATE POLICY "offline_edit_queue_delete_admin" ON public.offline_edit_queue
  FOR DELETE TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "offline_edit_queue_delete_own" ON public.offline_edit_queue;
CREATE POLICY "offline_edit_queue_delete_own" ON public.offline_edit_queue
  FOR DELETE TO authenticated USING (created_by_user_id = public.current_app_user_id());

-- Easy-to-forget step (per the 040 post-mortem documented in
-- 041_appointment_schedule_windows.sql): default privileges only revoke
-- anon for future tables, they don't grant authenticated. Without this,
-- PostgREST reports "table not found in schema cache", which looks like a
-- stale-cache bug but is actually a missing GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_edit_queue TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS offline_edit_queue_fill_creator_trg ON public.offline_edit_queue;
-- DROP FUNCTION IF EXISTS public.offline_edit_queue_fill_creator();
-- DROP TRIGGER IF EXISTS update_offline_edit_queue_updated_at ON public.offline_edit_queue;
-- DROP TABLE IF EXISTS public.offline_edit_queue;
