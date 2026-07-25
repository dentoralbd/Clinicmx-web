-- Phase 2 (Supabase Auth + real RLS), stage 2 of 2 — THE LOCKDOWN.
-- Depends on 038_auth_identity.sql (columns, helper functions) already
-- being applied AND on the Login.tsx rework already being live and
-- verified in production (every real user must be able to establish a
-- genuine Supabase Auth session before this runs, or they lose all access
-- the moment it commits). See the Phase 2 plan, Stage 6 vs Stage 7.
--
-- Confirmed via live read-only diagnostics run against production on
-- 2026-07-25 (SECURITY-HARDENING.md Phase 2, Stage 0):
--   - Migration 025 WAS applied — doctor_profiles already carries
--     "Allow all on doctor_profiles", not the old auth.uid()=user_id
--     policy. Resolved the open question from the Phase 2 design doc.
--   - All 27 tables ALREADY have RLS enabled with an "Allow all on X"
--     policy — INCLUDING the 9 tables this migrations folder never
--     explicitly enabled RLS on (patient_visits, medication_templates,
--     investigation_templates, invoice_templates, payment_methods,
--     payments, payment_plans, invoice_history, invoice_settings). This is
--     real drift between the migrations folder and the live database:
--     someone applied that directly to production, outside of a migration
--     file, and it was never captured here. Harmless for this migration
--     (038's "enable RLS on the 9" block is guarded and becomes a no-op on
--     production) but means 038 is NOT optional for a from-scratch
--     restore of this migrations folder onto a bare project (disaster
--     recovery / fresh staging) — there, those 9 tables really would have
--     no RLS until 038 runs.
--   - No function in `public` is SECURITY DEFINER yet (confirmed) and none
--     have a pinned search_path — matches what this migration assumes.
--   - Default privileges for tables/sequences/functions are owned by role
--     `postgres` (confirmed via pg_default_acl) and include anon grants —
--     so the `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` statements below
--     target real entries, not a silent no-op.
--
-- RUN AS ONE PASTE, START TO FINISH, AFTER FULL REVIEW AND A STAGING
-- REHEARSAL. Supabase's SQL editor may pool connections between separate
-- "Run" clicks, so a BEGIN in one click and a COMMIT in a later click is
-- NOT reliably the same transaction — don't try to split this into a
-- "run, inspect, then decide" flow via the dashboard. The BEGIN/COMMIT
-- wrapper below protects against a mid-script error leaving a
-- half-applied lockdown (any error aborts the whole transaction, nothing
-- commits); it is not a substitute for reviewing this file and rehearsing
-- it on staging first. Take a fresh manual backup immediately before
-- running this on production, and keep 039_rollback.sql (see bottom of
-- this file) open in a second tab.
--
-- Before running on production, confirm zero NULLs:
--   SELECT full_name, auth_user_id IS NOT NULL AS linked FROM public.app_users;

BEGIN;

-- === 1. Code-generation functions become SECURITY DEFINER ============
--
-- generate_consultation_code() (migration 036) does
-- `SELECT MAX(...) FROM patients` *inside a BEFORE INSERT trigger*. As
-- SECURITY INVOKER it would run as `authenticated` and that SELECT would
-- be RLS-filtered — harmless today because the new policy is all-or-
-- nothing for authenticated, but it would silently start producing
-- duplicate/collided consultation codes the moment anyone ever adds a
-- row-scoped policy to `patients`. SECURITY DEFINER decouples code
-- generation from row visibility — a correctness fix, not just hygiene.
--
-- generate_patient_code() calls nextval('patient_code_seq'), which needs
-- sequence USAGE. As SECURITY DEFINER that happens as `postgres`, so
-- sequence privileges can be revoked from anon/authenticated entirely and
-- nobody can burn a patient number by calling nextval() directly
-- (CLAUDE.md hard rule #8 exists because burned numbers are unrecoverable).
--
-- Both get an `auth.role() = 'anon'` guard as defense in depth in case
-- grants are ever misconfigured to include anon. Deliberately NOT
-- `NOT is_active_app_user()` — service_role's auth.uid() is null, and
-- scripts/backup/restore.mjs inserts into `patients` (firing the
-- assign_patient_code trigger, which calls these) as service_role. That
-- check would break every restore.
--
-- assign_patient_code() (034) itself stays SECURITY INVOKER, unchanged —
-- it touches no table, only branches and calls the two functions above.
-- Trigger firing is gated by table-level INSERT privilege/RLS, not by an
-- EXECUTE grant on the trigger function itself, so nothing to change here.

CREATE OR REPLACE FUNCTION public.generate_patient_code()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN 'PT-' || LPAD((nextval('patient_code_seq') + 100000)::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_consultation_code()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE next_num bigint;
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT GREATEST(COALESCE(MAX(SUBSTRING(patient_code FROM 4)::bigint), 400000), 400000) + 1
    INTO next_num
    FROM patients
   WHERE patient_code ~ '^CO-[0-9]+$';
  RETURN 'CO-' || LPAD(next_num::text, 6, '0');
END;
$$;

-- === 2. Function grants ================================================
--
-- Functions default to EXECUTE TO PUBLIC, and anon inherits PUBLIC — a
-- plain "REVOKE ... FROM anon" alone would be a no-op. Must revoke from
-- PUBLIC explicitly.

REVOKE EXECUTE ON FUNCTION public.generate_patient_code()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_consultation_code()  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_patient_code()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_inventory_updated_at() FROM PUBLIC, anon;

-- Called directly as RPCs (src/lib/patientCode.ts:45, PatientProfile.tsx,
-- Consultations.tsx) AND internally by the assign_patient_code trigger —
-- either way the calling role needs EXECUTE to even enter the function.
GRANT EXECUTE ON FUNCTION public.generate_patient_code()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_consultation_code() TO authenticated, service_role;
-- assign_patient_code / the two updated_at trigger functions are never
-- called directly (only fired as triggers) — no grant needed.

-- === 3. Table/sequence/default-privilege REVOKEs for anon =============

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- Deliberately NOT `REVOKE USAGE ON SCHEMA public FROM anon` — with zero
-- table/sequence/function privileges anon can already do nothing; revoking
-- schema USAGE too just turns every anon error into an opaque "permission
-- denied for schema public" with no additional safety benefit.

-- === 4. app_users column-level grants ==================================
--
-- This is what actually stops password_hash/password_salt reaching the
-- browser. Order matters: a table-level GRANT overrides column
-- restrictions, so REVOKE ALL must come first.

REVOKE ALL ON public.app_users FROM authenticated;
GRANT SELECT (
  id, created_at, updated_at, role, full_name, identifier,
  is_active, permissions, last_login_at, auth_user_id, auth_email
) ON public.app_users TO authenticated;
GRANT UPDATE (last_login_at) ON public.app_users TO authenticated;

-- Required code changes this makes necessary (see Phase 2 design, tracked
-- in the login-rework task): listAppUsers() and the in-app backup's
-- app_users read both currently do `select('*')`, which PostgREST expands
-- server-side and will now fail with "permission denied for column
-- password_hash" — both must become an explicit column list.

-- === 5. RLS policies: 20 "ordinary data" tables (base pattern) ========
--
-- Any active app_users row -> select/insert/update. Delete gated on
-- app_can('can_delete') (admin always passes). FOR UPDATE needs both
-- USING and WITH CHECK: PostgREST upsert (deviceBackup.ts restore) compiles
-- to ON CONFLICT DO UPDATE, which requires the UPDATE policy to pass on
-- both sides — omitting WITH CHECK would silently break restore.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patients', 'appointments', 'treatments', 'prescriptions', 'invoices',
    'dental_records', 'patient_visits', 'patient_files', 'lab_work',
    'medication_templates', 'investigation_templates', 'inventory_items',
    'inventory_movements', 'invoice_templates', 'payment_methods', 'payments',
    'payment_plans', 'invoice_history', 'invoice_settings', 'backup_settings'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all on ' || t, t);

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

-- === 6. RLS policies: 7 exception tables (explicit, not looped) =======
-- Ordered so app_users and authorized_ips come LAST: if this script is
-- ever aborted partway (should be impossible inside one transaction, but
-- belt and braces), the account tables are the last thing touched and
-- stay permissive the longest, keeping recovery-through-the-UI possible.

-- --- doctor_profiles ---
DROP POLICY IF EXISTS "Allow all on doctor_profiles" ON public.doctor_profiles;

DROP POLICY IF EXISTS "doctor_profiles_select" ON public.doctor_profiles;
CREATE POLICY "doctor_profiles_select" ON public.doctor_profiles
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "doctor_profiles_insert" ON public.doctor_profiles;
CREATE POLICY "doctor_profiles_insert" ON public.doctor_profiles
  FOR INSERT TO authenticated WITH CHECK (public.app_can('can_edit_clinic_profile'));

DROP POLICY IF EXISTS "doctor_profiles_update" ON public.doctor_profiles;
CREATE POLICY "doctor_profiles_update" ON public.doctor_profiles
  FOR UPDATE TO authenticated
  USING (public.app_can('can_edit_clinic_profile'))
  WITH CHECK (public.app_can('can_edit_clinic_profile'));

DROP POLICY IF EXISTS "doctor_profiles_delete" ON public.doctor_profiles;
CREATE POLICY "doctor_profiles_delete" ON public.doctor_profiles
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- Do NOT re-scope this to `user_id = auth.uid()`. Migration 025 explicitly
-- reversed that: this app is single-clinic/single-doctor and the profile
-- must sync across every device and role, not just one auth user's own
-- session. Re-adding a per-user scope here breaks cross-device sync again.

-- --- activity_log (append-only ledger) ---
DROP POLICY IF EXISTS "Allow all on activity_log" ON public.activity_log;

DROP POLICY IF EXISTS "activity_log_select" ON public.activity_log;
CREATE POLICY "activity_log_select" ON public.activity_log
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "activity_log_insert" ON public.activity_log;
CREATE POLICY "activity_log_insert" ON public.activity_log
  FOR INSERT TO authenticated WITH CHECK (public.is_active_app_user());

DROP POLICY IF EXISTS "activity_log_delete" ON public.activity_log;
CREATE POLICY "activity_log_delete" ON public.activity_log
  FOR DELETE TO authenticated USING (public.is_app_admin());
-- No UPDATE policy: nothing in the app ever updates an activity_log row.

-- --- edit_history (revert flow) ---
DROP POLICY IF EXISTS "Allow all on edit_history" ON public.edit_history;

DROP POLICY IF EXISTS "edit_history_select" ON public.edit_history;
CREATE POLICY "edit_history_select" ON public.edit_history
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "edit_history_insert" ON public.edit_history;
CREATE POLICY "edit_history_insert" ON public.edit_history
  FOR INSERT TO authenticated WITH CHECK (public.is_active_app_user());

DROP POLICY IF EXISTS "edit_history_update" ON public.edit_history;
CREATE POLICY "edit_history_update" ON public.edit_history
  FOR UPDATE TO authenticated
  USING (public.app_can('can_revert'))
  WITH CHECK (public.app_can('can_revert'));

DROP POLICY IF EXISTS "edit_history_delete" ON public.edit_history;
CREATE POLICY "edit_history_delete" ON public.edit_history
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- --- delete_history (restore flow — the restored_at write) ---
DROP POLICY IF EXISTS "Allow all on delete_history" ON public.delete_history;

DROP POLICY IF EXISTS "delete_history_select" ON public.delete_history;
CREATE POLICY "delete_history_select" ON public.delete_history
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "delete_history_insert" ON public.delete_history;
CREATE POLICY "delete_history_insert" ON public.delete_history
  FOR INSERT TO authenticated WITH CHECK (public.is_active_app_user());

DROP POLICY IF EXISTS "delete_history_update" ON public.delete_history;
CREATE POLICY "delete_history_update" ON public.delete_history
  FOR UPDATE TO authenticated
  USING (public.app_can('can_delete'))
  WITH CHECK (public.app_can('can_delete'));

DROP POLICY IF EXISTS "delete_history_delete" ON public.delete_history;
CREATE POLICY "delete_history_delete" ON public.delete_history
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- --- app_notifications (dismissing is not a "delete data" privilege) ---
DROP POLICY IF EXISTS "Allow all on app_notifications" ON public.app_notifications;

DROP POLICY IF EXISTS "app_notifications_select" ON public.app_notifications;
CREATE POLICY "app_notifications_select" ON public.app_notifications
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "app_notifications_insert" ON public.app_notifications;
CREATE POLICY "app_notifications_insert" ON public.app_notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_active_app_user());

DROP POLICY IF EXISTS "app_notifications_update" ON public.app_notifications;
CREATE POLICY "app_notifications_update" ON public.app_notifications
  FOR UPDATE TO authenticated
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());

DROP POLICY IF EXISTS "app_notifications_delete" ON public.app_notifications;
CREATE POLICY "app_notifications_delete" ON public.app_notifications
  FOR DELETE TO authenticated USING (public.is_active_app_user());

-- --- authorized_ips (own rows to create/read; admin decides) ---
DROP POLICY IF EXISTS "Allow all on authorized_ips" ON public.authorized_ips;

DROP POLICY IF EXISTS "authorized_ips_select" ON public.authorized_ips;
CREATE POLICY "authorized_ips_select" ON public.authorized_ips
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "authorized_ips_insert" ON public.authorized_ips;
CREATE POLICY "authorized_ips_insert" ON public.authorized_ips
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_app_admin());

DROP POLICY IF EXISTS "authorized_ips_update" ON public.authorized_ips;
CREATE POLICY "authorized_ips_update" ON public.authorized_ips
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "authorized_ips_delete" ON public.authorized_ips;
CREATE POLICY "authorized_ips_delete" ON public.authorized_ips
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- --- app_users (last) ---
DROP POLICY IF EXISTS "Allow all on app_users" ON public.app_users;

DROP POLICY IF EXISTS "app_users_select" ON public.app_users;
CREATE POLICY "app_users_select" ON public.app_users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_app_admin());
-- Deliberately without "AND is_active" — a disabled staffer must still be
-- able to read their own row so the app can say "This account is
-- disabled" instead of failing with an opaque RLS error.

-- Deliberately NO INSERT/UPDATE/DELETE policy for `authenticated` at all:
-- every write to this table (create/update/reset-password/disable/delete
-- staff accounts) goes through functions/api/admin-users.ts using the
-- service_role key, which bypasses RLS entirely. touchLastLogin()'s
-- last_login_at write is covered by the column-level GRANT UPDATE above,
-- not by a row policy.

-- === 7. Verification (informational — still inside the transaction) ===

SELECT tablename, policyname, cmd, roles
  FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;

SELECT COUNT(*) AS remaining_allow_all_policies
  FROM pg_policies
 WHERE schemaname = 'public' AND policyname LIKE 'Allow all on %';
-- Expect 0. If this is not 0, something above didn't match a real table/
-- policy name — do not treat the rest of this run as trustworthy.

COMMIT;

-- ============================================================================
-- ROLLBACK (039_rollback.sql) — copy this whole block into a fresh query
-- and run it as its own single paste if you need to revert after COMMIT.
-- ============================================================================
-- BEGIN;
--
-- DROP POLICY IF EXISTS "patients_select" ON public.patients;
-- DROP POLICY IF EXISTS "patients_insert" ON public.patients;
-- DROP POLICY IF EXISTS "patients_update" ON public.patients;
-- DROP POLICY IF EXISTS "patients_delete" ON public.patients;
-- CREATE POLICY "Allow all on patients" ON public.patients FOR ALL USING (true);
-- -- ... repeat the DROP x4 + CREATE "Allow all on X" for the other 26 tables:
-- -- appointments, treatments, prescriptions, invoices, dental_records,
-- -- patient_visits, patient_files, lab_work, medication_templates,
-- -- investigation_templates, inventory_items, inventory_movements,
-- -- invoice_templates, payment_methods, payments, payment_plans,
-- -- invoice_history, invoice_settings, backup_settings, doctor_profiles,
-- -- activity_log, edit_history, delete_history, app_notifications,
-- -- authorized_ips, app_users
--
-- GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
--
-- GRANT ALL ON public.app_users TO authenticated;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
--
-- CREATE OR REPLACE FUNCTION public.generate_patient_code()
-- RETURNS TEXT AS $$
-- BEGIN
--   RETURN 'PT-' || LPAD((nextval('patient_code_seq') + 100000)::text, 6, '0');
-- END;
-- $$ LANGUAGE plpgsql;
--
-- CREATE OR REPLACE FUNCTION public.generate_consultation_code()
-- RETURNS TEXT AS $$
-- DECLARE next_num bigint;
-- BEGIN
--   SELECT GREATEST(COALESCE(MAX(SUBSTRING(patient_code FROM 4)::bigint), 400000), 400000) + 1
--     INTO next_num FROM patients WHERE patient_code ~ '^CO-[0-9]+$';
--   RETURN 'CO-' || LPAD(next_num::text, 6, '0');
-- END;
-- $$ LANGUAGE plpgsql;
--
-- COMMIT;
--
-- Then in Cloudflare Pages: "Rollback to this deployment" on the
-- pre-Login-rework build. The old frontend uses the anon key with no
-- session, which these restored policies allow again, and old staff
-- logins work via the still-intact PBKDF2 hashes in app_users. Full
-- recovery, ~1 minute of SQL plus one dashboard click.
