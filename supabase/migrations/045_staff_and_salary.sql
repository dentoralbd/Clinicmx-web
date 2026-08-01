-- Staff Analytics: a salaried-staff roster + monthly salary payment records.
-- Admin-only feature (Financial Analysis -> Staff Analytics).
--
-- Deliberately NOT stored on app_users: migration 043 added
-- app_users_select_roster, which lets any active app user (doctor,
-- operator) read active doctor/admin rows so the "Attending Doctor"
-- dropdown can populate. RLS policies OR together, so a salary column on
-- app_users would immediately be readable by every logged-in staff member.
-- Separate tables with is_app_admin()-only policies avoid that entirely.
--
-- Guarded with existence checks so this is safe to re-run against the live
-- project (matches the style of 030_lab_work.sql).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'staff' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.staff (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      phone TEXT,
      -- Free text ("Receptionist", "Dental Assistant", "Doctor" for a
      -- fixed-salary doctor, ...) -- no fixed designation list requested.
      designation TEXT,
      -- Current designated monthly figure. NOT what a past month's
      -- statement shows -- see staff_salary_payments.base_salary below.
      monthly_salary NUMERIC NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
      -- Optional link for staff who also have an app login (a salaried
      -- doctor/operator), so their name/phone need not be entered twice.
      app_user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      joined_on DATE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'staff_salary_payments' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.staff_salary_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
      period_month TEXT NOT NULL CHECK (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
      -- Snapshot of staff.monthly_salary at the moment this row was
      -- created (see ensureMonthRows in src/lib/staff.ts). This is what
      -- keeps an old month's statement correct after a later raise --
      -- without it, raising someone's salary in March would silently
      -- rewrite what January's statement says they were owed.
      base_salary NUMERIC NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
      bonus NUMERIC NOT NULL DEFAULT 0 CHECK (bonus >= 0),
      deduction NUMERIC NOT NULL DEFAULT 0 CHECK (deduction >= 0),
      advance NUMERIC NOT NULL DEFAULT 0 CHECK (advance >= 0),
      amount_paid NUMERIC NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      payment_date DATE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      -- Makes "generate this month" an idempotent upsert (ON CONFLICT DO
      -- NOTHING) -- re-running it never overwrites figures already entered.
      UNIQUE (staff_id, period_month)
    );
  END IF;
END $$;

-- No status column: Pending/Partial/Paid is derived from amount_paid vs
-- net payable in the app layer -- one less thing that can drift out of sync.

DROP TRIGGER IF EXISTS update_staff_updated_at ON public.staff;
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_staff_salary_payments_updated_at ON public.staff_salary_payments;
CREATE TRIGGER update_staff_salary_payments_updated_at BEFORE UPDATE ON public.staff_salary_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_salary_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select" ON public.staff
  FOR SELECT TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "staff_insert" ON public.staff;
CREATE POLICY "staff_insert" ON public.staff
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "staff_update" ON public.staff;
CREATE POLICY "staff_update" ON public.staff
  FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "staff_delete" ON public.staff;
CREATE POLICY "staff_delete" ON public.staff
  FOR DELETE TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "staff_salary_payments_select" ON public.staff_salary_payments;
CREATE POLICY "staff_salary_payments_select" ON public.staff_salary_payments
  FOR SELECT TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "staff_salary_payments_insert" ON public.staff_salary_payments;
CREATE POLICY "staff_salary_payments_insert" ON public.staff_salary_payments
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "staff_salary_payments_update" ON public.staff_salary_payments;
CREATE POLICY "staff_salary_payments_update" ON public.staff_salary_payments
  FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "staff_salary_payments_delete" ON public.staff_salary_payments;
CREATE POLICY "staff_salary_payments_delete" ON public.staff_salary_payments
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- Easy-to-forget step (per the 040 post-mortem documented in
-- 041_appointment_schedule_windows.sql): default privileges only revoke
-- anon for future tables, they don't grant authenticated. Without this,
-- PostgREST reports "table not found in schema cache", which looks like a
-- stale-cache bug but is actually a missing GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_salary_payments TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TABLE IF EXISTS public.staff_salary_payments;
-- DROP TABLE IF EXISTS public.staff;
