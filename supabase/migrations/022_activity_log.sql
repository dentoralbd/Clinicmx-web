-- Unified activity ledger: every create/edit/delete/restore/revert/login with the
-- responsible actor's name. Shown in the Admin zone "Activity Log" tab.
-- Guarded with existence checks so it is safe to re-run against the live project.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'activity_log' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.activity_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      action TEXT NOT NULL CHECK (action IN ('create','edit','delete','restore','revert','login')),
      -- Intentionally NO CHECK: new entity types (appointment, payment, patient_file,
      -- doctor_profile, app_user, session, ...) must not require a schema change.
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      entity_label TEXT,
      -- No FK: log rows must survive patient deletion.
      patient_id UUID,
      patient_name TEXT,
      details TEXT,
      -- Client public IP, best-effort (login events).
      ip TEXT,
      actor TEXT NOT NULL
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_activity_log_occurred_at'
  ) THEN
    CREATE INDEX idx_activity_log_occurred_at ON public.activity_log (occurred_at DESC);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_activity_log_entity_type'
  ) THEN
    CREATE INDEX idx_activity_log_entity_type ON public.activity_log (entity_type);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_activity_log_action'
  ) THEN
    CREATE INDEX idx_activity_log_action ON public.activity_log (action);
  END IF;
END $$;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_log' AND policyname = 'Allow all on activity_log'
  ) THEN
    CREATE POLICY "Allow all on activity_log" ON public.activity_log
      FOR ALL USING (true);
  END IF;
END $$;
