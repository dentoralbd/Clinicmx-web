-- Phase 2 (Supabase Auth + real RLS), stage 1 of 2. See SECURITY-HARDENING.md
-- and the Phase 2 plan for full context. This migration is PURELY ADDITIVE
-- and a behavioral no-op: nothing here changes what the anon key can do.
-- Existing "Allow all" policies are untouched. The real lockdown is
-- 039_rls_lockdown.sql, applied separately once the login rework (which
-- depends on the columns/functions added here) is live and verified.
--
-- Idempotent / safe to re-run.

-- === app_users: link to Supabase Auth ===============================
--
-- auth_user_id (not "user_id" — authorized_ips.user_id already means
-- "app_users.id", and doctor_profiles.user_id already means "auth.users.id".
-- A third meaning for one name is a guaranteed future bug).
--
-- ON DELETE SET NULL, not CASCADE: deleting an auth user must leave a
-- visible, recoverable orphan, not silently vaporize permissions/history.
--
-- password_hash/password_salt go nullable but are NOT dropped — they are
-- the rollback lever. As long as they survive, reverting the frontend
-- instantly restores working staff logins on the old PBKDF2 path.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auth_email text UNIQUE;

ALTER TABLE public.app_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE public.app_users ALTER COLUMN password_salt DROP NOT NULL;

-- The admin gets a real app_users row (role='admin') instead of a separate
-- mechanism, so every RLS policy is one uniform lookup with no special
-- case. The CHECK constraint currently forbids it (021_app_users.sql).
-- Constraint name confirmed via:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.app_users'::regclass;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.app_users'::regclass AND conname = 'app_users_role_check'
  ) THEN
    ALTER TABLE public.app_users DROP CONSTRAINT app_users_role_check;
  END IF;
  ALTER TABLE public.app_users
    ADD CONSTRAINT app_users_role_check CHECK (role IN ('doctor', 'operator', 'admin'));
END $$;

-- === SECURITY DEFINER helper functions for RLS policies =============
--
-- Owned by postgres (the migration-running role), which owns every table
-- and is exempt from RLS on them unless FORCE ROW LEVEL SECURITY is set
-- (it must never be — see the warning at the bottom of this file). So the
-- SELECT inside each function does not re-trigger the app_users policy:
-- no recursion. Belt and braces: the self-row SELECT policy added in 039
-- uses a direct auth_user_id = auth.uid() comparison with no function
-- call, so even a broken helper can't lock someone out of their own row.
--
-- All STABLE (evaluated once per statement) with a pinned search_path
-- (required SECURITY DEFINER hygiene; Supabase's linter flags functions
-- that skip this).

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM public.app_users
   WHERE auth_user_id = auth.uid() AND is_active LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.app_users
   WHERE auth_user_id = auth.uid() AND is_active LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_active_app_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users WHERE auth_user_id = auth.uid() AND is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.app_users
      WHERE auth_user_id = auth.uid() AND is_active LIMIT 1), false)
$$;

-- Permission-flag gate for RLS (e.g. app_can('can_delete')). Admin always
-- passes. A MISSING key evaluates to NULL -> COALESCE false -> DENY.
-- Deliberately the opposite of the client-side hasPageAccess()
-- (src/lib/appSession.ts), which fails OPEN for backward compatibility
-- with pre-existing accounts. That asymmetry is intentional: the client
-- check is a UX convenience, this is the actual gate.
CREATE OR REPLACE FUNCTION public.app_can(flag text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' OR (permissions ->> flag)::boolean
       FROM public.app_users
      WHERE auth_user_id = auth.uid() AND is_active LIMIT 1), false)
$$;

REVOKE EXECUTE ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_app_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_app_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_can(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_app_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can(text) TO authenticated, service_role;

-- === Enable RLS on the 9 tables that never had it ====================
--
-- patient_visits, medication_templates, investigation_templates (002);
-- invoice_templates, payment_methods, payments, payment_plans,
-- invoice_history, invoice_settings (008) were created without RLS at
-- all — wide open at the Postgres grant level, not just "decorative".
--
-- Enabling RLS with no policy means DENY ALL, which would be a real
-- behavior change today. So each gets a temporary allow-all policy here,
-- identical in effect to every other table's current "Allow all on X"
-- policy. 039 replaces all 27 uniformly in one pass. This keeps 038 a
-- true no-op: nothing the anon key could do yesterday, it can't do today,
-- and nothing it could do yesterday stops working today either.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patient_visits', 'medication_templates', 'investigation_templates',
    'invoice_templates', 'payment_methods', 'payments', 'payment_plans',
    'invoice_history', 'invoice_settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t AND policyname = 'Allow all on ' || t
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true)', 'Allow all on ' || t, t);
    END IF;
  END LOOP;
END $$;

-- Sanity check to run after applying — every one of the 9 should show
-- relrowsecurity = true, relforcerowsecurity = false:
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class c
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND relname IN (
--      'patient_visits','medication_templates','investigation_templates',
--      'invoice_templates','payment_methods','payments','payment_plans',
--      'invoice_history','invoice_settings');
--
-- WARNING for whoever edits this file later: never run
-- `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on any table in this schema.
-- It applies RLS to the table owner too, which breaks every SECURITY
-- DEFINER helper above (they'd start recursing into the very policies
-- they're used inside) and can brick admin access from the SQL editor
-- itself if the connecting role isn't the owner.

-- Rollback:
-- ALTER TABLE public.app_users DROP COLUMN IF EXISTS auth_user_id;
-- ALTER TABLE public.app_users DROP COLUMN IF EXISTS auth_email;
-- ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
-- ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check
--   CHECK (role IN ('doctor','operator'));  -- fails if an admin row exists; delete it first
-- DROP FUNCTION IF EXISTS public.app_can(text);
-- DROP FUNCTION IF EXISTS public.is_app_admin();
-- DROP FUNCTION IF EXISTS public.is_active_app_user();
-- DROP FUNCTION IF EXISTS public.current_app_role();
-- DROP FUNCTION IF EXISTS public.current_app_user_id();
-- ALTER TABLE public.patient_visits DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.medication_templates DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.investigation_templates DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_templates DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.payment_methods DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.payment_plans DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_history DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.invoice_settings DISABLE ROW LEVEL SECURITY;
-- (password_hash/password_salt NOT NULL drops are not worth restoring)
