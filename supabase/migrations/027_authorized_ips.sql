-- Per-user network access gate for doctor/operator logins: each new public IP a
-- user logs in from must be approved by the admin (Admin zone "Network Access"
-- tab). Each user keeps at most their 5 most recent approved IPs (enforced in
-- app code on approval). Admin logins are never gated.
-- Guarded with existence checks so it is safe to re-run against the live project.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'authorized_ips' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.authorized_ips (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
      -- Client public IP as reported at login (best-effort, api.ipify.org).
      ip TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
      -- Audit-actor string of the requester, e.g. "doctor:Jane Smith".
      requested_by TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ,
      UNIQUE (user_id, ip)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_authorized_ips_status'
  ) THEN
    CREATE INDEX idx_authorized_ips_status ON public.authorized_ips (status);
  END IF;
END $$;

ALTER TABLE public.authorized_ips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'authorized_ips' AND policyname = 'Allow all on authorized_ips'
  ) THEN
    CREATE POLICY "Allow all on authorized_ips" ON public.authorized_ips
      FOR ALL USING (true);
  END IF;
END $$;
