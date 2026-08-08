-- Staff leave requests: self-service submission by any active app user,
-- review/approve by admin. Feeds the HR & Payroll page (admin-only) and the
-- "My Leave" tab in the Doctor/Operator Zone (self-service).
--
-- Deliberately NOT gated behind app_can('can_access_staff_analytics') like
-- staff/staff_salary_payments (045/046): HR & Payroll is strictly
-- admin-only in the UI, and every active non-admin needs to reach their
-- OWN leave rows regardless of that flag. staff / staff_salary_payments
-- policies are untouched by this migration.
--
-- Guarded with existence checks so this is safe to re-run against the live
-- project (matches the style of 030_lab_work.sql / 045_staff_and_salary.sql).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'staff_leaves' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.staff_leaves (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      -- Roster link, resolved server-side by the BEFORE INSERT trigger below
      -- (a self-service requester never needs read access to `staff`).
      staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
      -- Who filed it, for the self-service "own rows" policies below.
      app_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
      -- Snapshot of the requester's name at submission time, so the admin
      -- list can render without joining `staff` (which self-service
      -- accounts can't read) or `app_users` (column-grant restricted).
      requester_name TEXT NOT NULL,
      leave_type TEXT NOT NULL CHECK (leave_type IN ('Annual', 'Sick', 'Casual', 'Unpaid', 'Maternity')),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      decision_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT staff_leaves_date_order CHECK (end_date >= start_date)
    );

    CREATE INDEX staff_leaves_status_idx ON public.staff_leaves (status);
    CREATE INDEX staff_leaves_dates_idx ON public.staff_leaves (start_date, end_date);
    CREATE INDEX staff_leaves_app_user_idx ON public.staff_leaves (app_user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_staff_leaves_updated_at ON public.staff_leaves;
CREATE TRIGGER update_staff_leaves_updated_at BEFORE UPDATE ON public.staff_leaves
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- === Identity-filling trigger ===============================================
--
-- Runs BEFORE the INSERT policy's WITH CHECK, so a self-service insert can
-- rely on app_user_id/status already being correct by the time RLS
-- evaluates it. SECURITY DEFINER + pinned search_path, same hygiene as the
-- 038_auth_identity.sql helpers; owned by postgres so the `staff` lookup
-- here does not re-trigger `staff`'s own RLS (a requester never needs
-- direct SELECT on `staff`).
CREATE OR REPLACE FUNCTION public.staff_leaves_fill_requester()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  resolved_staff_id uuid;
  resolved_name text;
BEGIN
  IF NEW.app_user_id IS NULL THEN
    NEW.app_user_id := public.current_app_user_id();
  END IF;

  IF NEW.staff_id IS NULL AND NEW.app_user_id IS NOT NULL THEN
    SELECT id, full_name INTO resolved_staff_id, resolved_name
      FROM public.staff WHERE app_user_id = NEW.app_user_id LIMIT 1;
    NEW.staff_id := resolved_staff_id;
    IF NEW.requester_name IS NULL OR btrim(NEW.requester_name) = '' THEN
      NEW.requester_name := resolved_name;
    END IF;
  END IF;

  IF (NEW.requester_name IS NULL OR btrim(NEW.requester_name) = '') AND NEW.app_user_id IS NOT NULL THEN
    SELECT full_name INTO resolved_name FROM public.app_users WHERE id = NEW.app_user_id LIMIT 1;
    NEW.requester_name := resolved_name;
  END IF;

  -- A non-admin can never self-approve on insert, no matter what the
  -- client sends.
  IF NOT public.is_app_admin() THEN
    NEW.status := 'Pending';
    NEW.decided_by := NULL;
    NEW.decided_at := NULL;
    NEW.decision_note := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_leaves_fill_requester() FROM PUBLIC;

DROP TRIGGER IF EXISTS staff_leaves_fill_requester_trg ON public.staff_leaves;
CREATE TRIGGER staff_leaves_fill_requester_trg BEFORE INSERT ON public.staff_leaves
  FOR EACH ROW EXECUTE FUNCTION public.staff_leaves_fill_requester();

-- === RLS =====================================================================

ALTER TABLE public.staff_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_leaves_select_admin" ON public.staff_leaves;
CREATE POLICY "staff_leaves_select_admin" ON public.staff_leaves
  FOR SELECT TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "staff_leaves_select_own" ON public.staff_leaves;
CREATE POLICY "staff_leaves_select_own" ON public.staff_leaves
  FOR SELECT TO authenticated USING (app_user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "staff_leaves_insert_admin" ON public.staff_leaves;
CREATE POLICY "staff_leaves_insert_admin" ON public.staff_leaves
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

-- A self-service insert must target the requester's own identity and land
-- Pending (the trigger above enforces the latter server-side too, but the
-- WITH CHECK keeps the guarantee visible at the policy layer as well).
DROP POLICY IF EXISTS "staff_leaves_insert_own" ON public.staff_leaves;
CREATE POLICY "staff_leaves_insert_own" ON public.staff_leaves
  FOR INSERT TO authenticated WITH CHECK (
    public.is_active_app_user()
    AND app_user_id = public.current_app_user_id()
    AND status = 'Pending'
  );

DROP POLICY IF EXISTS "staff_leaves_update_admin" ON public.staff_leaves;
CREATE POLICY "staff_leaves_update_admin" ON public.staff_leaves
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "staff_leaves_delete_admin" ON public.staff_leaves;
CREATE POLICY "staff_leaves_delete_admin" ON public.staff_leaves
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- Lets a requester cancel their own still-pending request.
DROP POLICY IF EXISTS "staff_leaves_delete_own" ON public.staff_leaves;
CREATE POLICY "staff_leaves_delete_own" ON public.staff_leaves
  FOR DELETE TO authenticated USING (
    app_user_id = public.current_app_user_id() AND status = 'Pending'
  );

-- Easy-to-forget step (per the 040 post-mortem documented in
-- 041_appointment_schedule_windows.sql): default privileges only revoke
-- anon for future tables, they don't grant authenticated. Without this,
-- PostgREST reports "table not found in schema cache", which looks like a
-- stale-cache bug but is actually a missing GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_leaves TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS staff_leaves_fill_requester_trg ON public.staff_leaves;
-- DROP FUNCTION IF EXISTS public.staff_leaves_fill_requester();
-- DROP TABLE IF EXISTS public.staff_leaves;
