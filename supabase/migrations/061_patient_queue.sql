-- Patient Queue System: waiting-room queue management, reception check-in,
-- doctor call/hold/complete workflow, and billing/dispense handoff.
--
-- Ported from a UI-redesign sandbox (Clinicmx-web-redesign, staging project
-- only, never applied to production) with three material differences from
-- that sandbox's design, documented inline below because they are the parts
-- most likely to be "corrected" back toward the sandbox by a future reader:
--   1. No `anon` grant/policy anywhere. The sandbox granted anon SELECT on
--      today's rows so a waiting-room TV could read without login — that
--      directly reverses 039_rls_lockdown.sql, and since the anon key is
--      VITE_-bundled it would make a named patient roster + procedures
--      readable by anyone holding the compiled JS. The patient-facing board
--      lives outside this database entirely (a Cloudflare Function on the
--      DentOral site, reading with service_role and returning a sanitised
--      payload) — see functions/api/queue-board.ts.
--   2. Ordering is NOT check-in order. The queue must follow the appointment
--      schedule, with walk-ins inserted mid-queue and late arrivals pushed
--      down rather than sent to the back — see the sort_key design below.
--   3. updated_at trigger uses update_updated_at_column() (defined in
--      001_initial_schema.sql, used throughout this repo). The sandbox's
--      migration called a function of a different name that does not exist
--      anywhere in this codebase, which would have made CREATE TRIGGER fail
--      at apply time.
--
-- Guarded with existence checks so this is safe to re-run (matches the style
-- of 030_lab_work.sql / 057_catalog.sql).

-- === 1. Enum =================================================================
-- All five values declared up front (not added later via ALTER TYPE ... ADD
-- VALUE, which cannot run inside the same transaction as other DDL that uses
-- the new value on some PG versions).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_status') THEN
    CREATE TYPE queue_status AS ENUM ('waiting', 'serving', 'on_hold', 'completed', 'skipped');
  END IF;
END $$;

-- === 2. Tables ================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'queue_entries' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.queue_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
      appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
      patient_name TEXT NOT NULL,

      -- Fixed daily ticket id, never reused/renumbered. Position on screen
      -- ("3rd in line") is DERIVED from sort_key at read time, never stored
      -- -- see queueOrder.ts / the position-computation note below.
      serial_number INTEGER NOT NULL,

      -- The single ordering axis. A patient pulled from a scheduled
      -- appointment gets sort_key = epoch minutes of the appointment's
      -- date_time, so the queue's base order IS the appointment schedule. A
      -- walk-in gets sort_key = arrival time, which naturally slots them
      -- among appointments whose slots have already passed -- both cases
      -- are the same expression, no special-case branch needed.
      --
      -- Fractional/"between" ordering: to insert or move an entry, the app
      -- writes the midpoint between its new neighbours' sort_keys, so any
      -- insert/reorder/absent-pushdown touches exactly one row -- never a
      -- renumber of the whole queue, and no lost-update race between two
      -- receptionists editing the queue at once.
      sort_key NUMERIC NOT NULL,

      status queue_status NOT NULL DEFAULT 'waiting',
      assigned_doctor UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
      room_number TEXT,
      procedure_name TEXT,
      estimated_duration_mins INTEGER NOT NULL DEFAULT 15,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
      hold_reason TEXT,
      billing_status TEXT NOT NULL DEFAULT 'none'
        CHECK (billing_status IN ('none', 'pending_payment', 'paid_and_dispensed')),

      -- Explicit rather than derived from created_at::date, so the board's
      -- "today" and a UTC-vs-local-midnight window can never disagree (the
      -- project's DB clock is UTC; the clinic is UTC+6).
      queue_date DATE NOT NULL DEFAULT CURRENT_DATE,

      -- "Absent" = pushed down N places, stays in the queue (see
      -- queue_settings.absent_pushdown_places). Distinct from 'skipped',
      -- which is a genuine removal/reschedule.
      absent_marks INTEGER NOT NULL DEFAULT 0,
      last_absent_at TIMESTAMPTZ,

      -- Stamped on transition into 'serving' so ETA math (queueEstimation.ts)
      -- uses call time, not check-in time.
      called_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT queue_entries_queue_date_serial_key UNIQUE (queue_date, serial_number)
    );

    CREATE INDEX queue_entries_date_sort_idx ON public.queue_entries (queue_date, sort_key);
    CREATE INDEX queue_entries_date_status_idx ON public.queue_entries (queue_date, status);
    CREATE INDEX queue_entries_date_billing_idx ON public.queue_entries (queue_date, billing_status);
    CREATE INDEX queue_entries_appointment_idx ON public.queue_entries (appointment_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'queue_settings' AND n.nspname = 'public'
  ) THEN
    -- Singleton (one row, id fixed) so the board's privacy mode and
    -- infotainment toggle are real server-persisted settings, not
    -- unpersisted component state that resets to defaults on every TV
    -- reboot and can be changed by anyone loading the public page.
    CREATE TABLE public.queue_settings (
      id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
      privacy_mode TEXT NOT NULL DEFAULT 'full'
        CHECK (privacy_mode IN ('full', 'masked', 'token_only')),
      infotainment_enabled BOOLEAN NOT NULL DEFAULT true,
      infotainment_interval_secs INTEGER NOT NULL DEFAULT 12,
      absent_pushdown_places INTEGER NOT NULL DEFAULT 3,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO public.queue_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_queue_entries_updated_at ON public.queue_entries;
CREATE TRIGGER update_queue_entries_updated_at BEFORE UPDATE ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_queue_settings_updated_at ON public.queue_settings;
CREATE TRIGGER update_queue_settings_updated_at BEFORE UPDATE ON public.queue_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- === 3. Concurrency-safe daily serial allocation ==============================
-- Read-max-then-insert from the client would let two receptionists checking
-- in at the same moment land on the same serial_number (this is exactly what
-- the sandbox did). SECURITY DEFINER + the UNIQUE(queue_date, serial_number)
-- constraint above make allocation atomic: concurrent callers serialise on
-- the aggregate lock rather than racing in application code.

CREATE OR REPLACE FUNCTION public.next_queue_serial(p_queue_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(serial_number), 0) + 1 INTO v_next
    FROM public.queue_entries WHERE queue_date = p_queue_date;
  RETURN v_next;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_queue_serial(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_queue_serial(DATE) TO authenticated;

-- === 4. RLS ====================================================================
-- Base pattern from 057_catalog.sql. DELETE uses app_can('can_delete') (not
-- is_app_admin()) to match the client-side canDelete() gate in appSession.ts
-- -- a policy stricter than the button that triggers it makes the delete
-- silently no-op (RLS filters rather than errors) and the row reappears with
-- no error shown, which is exactly the sandbox's defect this avoids.

ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['queue_entries']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_active_app_user())',
      t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_active_app_user())',
      t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_active_app_user()) WITH CHECK (public.is_active_app_user())',
      t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.app_can(''can_delete''))',
      t || '_delete', t);
  END LOOP;
END $$;

-- queue_settings: any active app_user reads; only admin writes (mirrors the
-- admin-only pattern in 059_clinic_expenses.sql).
DROP POLICY IF EXISTS queue_settings_select ON public.queue_settings;
CREATE POLICY queue_settings_select ON public.queue_settings
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS queue_settings_update ON public.queue_settings;
CREATE POLICY queue_settings_update ON public.queue_settings
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- No anon grant, no anon policy on either table -- see header note #1.
-- 039_rls_lockdown.sql's global REVOKE ALL FROM anon already covers this;
-- the only step needed here is the explicit authenticated GRANT below (the
-- single most-forgotten step in this repo -- see 041's post-mortem comment).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_entries TO authenticated;
GRANT SELECT, UPDATE ON public.queue_settings TO authenticated;

-- === 5. Realtime ================================================================
-- First use of Supabase Realtime anywhere in this codebase. Also requires
-- enabling Realtime for the project in the Supabase dashboard.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'queue_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
  END IF;
END $$;

-- === 6. Reuse the existing treatment catalog for procedure durations ==========
-- Fixes the sandbox's per-browser localStorage procedure catalog (a
-- procedure added at reception was invisible on the doctor's device, which
-- silently fell back to a 15-minute default, so the same queue showed
-- different ETAs on different screens). Production already has a catalog
-- table (057_catalog.sql) -- this adds one column rather than duplicating it,
-- and durations become editable on the existing /catalog page.
--
-- Guarded on the table's existence, not just IF NOT EXISTS on the column:
-- an environment at an older migration level than 057 (e.g. a staging
-- project rebuilt before the Catalog feature existed) won't have
-- treatment_catalog_items at all, and a bare ALTER TABLE would hard-fail
-- the whole script there. queueEstimation.ts's fetchProcedureDurations()
-- already treats "no rows / column missing data" as "fall back to the
-- 15-minute default" per procedure, so skipping this step on such an
-- environment degrades gracefully rather than breaking the rest of the
-- migration (queue_entries/queue_settings/realtime still apply).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'treatment_catalog_items' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.treatment_catalog_items
      ADD COLUMN IF NOT EXISTS default_duration_mins INTEGER;
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE public.treatment_catalog_items DROP COLUMN IF EXISTS default_duration_mins;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.queue_entries;
-- DROP FUNCTION IF EXISTS public.next_queue_serial(DATE);
-- DROP TABLE IF EXISTS public.queue_settings;
-- DROP TABLE IF EXISTS public.queue_entries;
-- DROP TYPE IF EXISTS queue_status;
