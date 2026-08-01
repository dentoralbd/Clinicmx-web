-- Lets a non-admin account access Staff Analytics when explicitly granted
-- the can_access_staff_analytics permission (Admin -> Users), instead of
-- admin-only. Re-points all eight staff / staff_salary_payments policies
-- from is_app_admin() to app_can('can_access_staff_analytics').
--
-- app_can() (038_auth_identity.sql) already covers admin unconditionally
-- (`role = 'admin' OR (permissions ->> flag)::boolean`), so this strictly
-- WIDENS access to whoever is granted the flag — nothing that could
-- previously read/write these tables loses access. A missing permission
-- key evaluates to NULL -> COALESCE false -> deny, so accounts saved
-- before this feature default to no access, same as before this migration.
--
-- Doctor Share % and the Doctor Analytics tab are companion permissions
-- added in the same release, but neither touches RLS: doctor_share_pct is
-- already writable by any active app user (039 §5, treatments_update), and
-- treatments/invoices/patients are already readable by any active app user
-- — both are UI-only gates. Staff/payroll data is the one that actually
-- needed a real database-level boundary, hence this migration existing at
-- all while the other two don't need one.
--
-- DROP POLICY IF EXISTS before each CREATE, matching 043/045 — re-runnable.

DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select" ON public.staff
  FOR SELECT TO authenticated USING (public.app_can('can_access_staff_analytics'));

DROP POLICY IF EXISTS "staff_insert" ON public.staff;
CREATE POLICY "staff_insert" ON public.staff
  FOR INSERT TO authenticated WITH CHECK (public.app_can('can_access_staff_analytics'));

DROP POLICY IF EXISTS "staff_update" ON public.staff;
CREATE POLICY "staff_update" ON public.staff
  FOR UPDATE TO authenticated
  USING (public.app_can('can_access_staff_analytics'))
  WITH CHECK (public.app_can('can_access_staff_analytics'));

DROP POLICY IF EXISTS "staff_delete" ON public.staff;
CREATE POLICY "staff_delete" ON public.staff
  FOR DELETE TO authenticated USING (public.app_can('can_access_staff_analytics'));

DROP POLICY IF EXISTS "staff_salary_payments_select" ON public.staff_salary_payments;
CREATE POLICY "staff_salary_payments_select" ON public.staff_salary_payments
  FOR SELECT TO authenticated USING (public.app_can('can_access_staff_analytics'));

DROP POLICY IF EXISTS "staff_salary_payments_insert" ON public.staff_salary_payments;
CREATE POLICY "staff_salary_payments_insert" ON public.staff_salary_payments
  FOR INSERT TO authenticated WITH CHECK (public.app_can('can_access_staff_analytics'));

DROP POLICY IF EXISTS "staff_salary_payments_update" ON public.staff_salary_payments;
CREATE POLICY "staff_salary_payments_update" ON public.staff_salary_payments
  FOR UPDATE TO authenticated
  USING (public.app_can('can_access_staff_analytics'))
  WITH CHECK (public.app_can('can_access_staff_analytics'));

DROP POLICY IF EXISTS "staff_salary_payments_delete" ON public.staff_salary_payments;
CREATE POLICY "staff_salary_payments_delete" ON public.staff_salary_payments
  FOR DELETE TO authenticated USING (public.app_can('can_access_staff_analytics'));

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP POLICY IF EXISTS "staff_select" ON public.staff;
-- CREATE POLICY "staff_select" ON public.staff FOR SELECT TO authenticated USING (public.is_app_admin());
-- DROP POLICY IF EXISTS "staff_insert" ON public.staff;
-- CREATE POLICY "staff_insert" ON public.staff FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());
-- DROP POLICY IF EXISTS "staff_update" ON public.staff;
-- CREATE POLICY "staff_update" ON public.staff FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
-- DROP POLICY IF EXISTS "staff_salary_payments_select" ON public.staff_salary_payments;
-- CREATE POLICY "staff_salary_payments_select" ON public.staff_salary_payments FOR SELECT TO authenticated USING (public.is_app_admin());
-- DROP POLICY IF EXISTS "staff_salary_payments_insert" ON public.staff_salary_payments;
-- CREATE POLICY "staff_salary_payments_insert" ON public.staff_salary_payments FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());
-- DROP POLICY IF EXISTS "staff_salary_payments_update" ON public.staff_salary_payments;
-- CREATE POLICY "staff_salary_payments_update" ON public.staff_salary_payments FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
-- DROP POLICY IF EXISTS "staff_delete" ON public.staff;
-- CREATE POLICY "staff_delete" ON public.staff FOR DELETE TO authenticated USING (public.is_app_admin());
-- DROP POLICY IF EXISTS "staff_salary_payments_delete" ON public.staff_salary_payments;
-- CREATE POLICY "staff_salary_payments_delete" ON public.staff_salary_payments FOR DELETE TO authenticated USING (public.is_app_admin());
