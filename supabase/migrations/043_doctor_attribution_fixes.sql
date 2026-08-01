-- Follow-up to 042_add_doctor_treatment_commission.sql — fixes found in the
-- 2026-08-01 security/correctness review of the Doctor Analytics feature
-- (built outside Claude Code, in Anti-Gravity, while Claude Code was rate
-- limited). Two independent fixes bundled into one migration file/run.

-- === 1. Unify the default doctor share to 50% ==========================
--
-- 042 set the column DEFAULT to 30.00, but every application write path
-- (PatientProfile.tsx treatment-plan and edit-treatment saves) has always
-- saved 50 explicitly, and the payout math in doctorAnalytics.ts falls back
-- to `?? 50` when the value is null. Only the DB default and the
-- Treatments.tsx list badge (also fixed, `?? 30` -> `?? 50`) disagreed.
-- Picking 50 (not 30) because that's what every write path has actually
-- been persisting — picking 30 here would silently change nothing for
-- existing rows (they all have an explicit value) but would make future
-- inserts that skip the app layer default to a value nothing else agrees
-- with. This does NOT touch any existing row's stored doctor_share_pct.
--
-- 042 also tried to add a doctor_profiles.default_share_pct column behind
-- an "IF table exists" guard, but the column never actually landed on
-- production (confirmed via information_schema, 2026-08-01) and nothing
-- in the app reads or writes it — dead, unused. Not recreating it here;
-- only the treatments column is real.
ALTER TABLE treatments ALTER COLUMN doctor_share_pct SET DEFAULT 50.00;

-- === 2. Let every active staff member read the doctor/admin roster =====
--
-- The "Procedure done by Dr." dropdown (PatientProfile.tsx fetchDoctorsList)
-- queries app_users for role IN ('doctor','admin') to populate itself. But
-- 039_rls_lockdown.sql's app_users_select policy is
--   auth_user_id = auth.uid() OR is_app_admin()
-- so a doctor or operator gets back only their own row — a newly added
-- doctor who hasn't yet been attributed a treatment is invisible to
-- everyone except the admin, and nobody else can be the first to
-- attribute work to them.
--
-- RLS policies for the same command OR together, so this ADDS visibility
-- without loosening 039's existing policy. It exposes only what the
-- column-level GRANT from 039 §4 already allows (full_name, role, etc —
-- never password_hash/password_salt), scoped to active doctor/admin rows
-- only, gated on the requester being an active app user themselves.
DROP POLICY IF EXISTS "app_users_select_roster" ON public.app_users;
CREATE POLICY "app_users_select_roster" ON public.app_users
  FOR SELECT TO authenticated
  USING (public.is_active_app_user() AND is_active AND role IN ('doctor', 'admin'));

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE treatments ALTER COLUMN doctor_share_pct SET DEFAULT 30.00;
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_profiles') THEN
--     ALTER TABLE doctor_profiles ALTER COLUMN default_share_pct SET DEFAULT 30.00;
--   END IF;
-- END $$;
-- DROP POLICY IF EXISTS "app_users_select_roster" ON public.app_users;
