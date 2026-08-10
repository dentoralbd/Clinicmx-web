-- Clinic Expenses: categorized one-off/ad-hoc clinic spending (instrument or
-- material purchases, machine repairs, and any other special expense) that
-- feeds the Clinic Expenses tab on Financial Analysis (/financial-analysis).
-- Admin-only feature, matching Staff & Salary (045_staff_and_salary.sql) --
-- see that migration's comment for why a separate is_app_admin()-gated
-- table is used instead of extending an existing broadly-readable table.
--
-- Cash-basis by construction: a row IS the payment event (there is no
-- separate "owed" vs "paid" concept here, unlike staff_salary_payments or
-- lab_work), so there's no accrual/paid split to model.
--
-- Guarded with existence checks so this is safe to re-run against the live
-- project (matches the style of 030_lab_work.sql / 045_staff_and_salary.sql).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'clinic_expenses' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.clinic_expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category TEXT NOT NULL CHECK (category IN (
        'Instrument Purchase', 'Material Purchase', 'Machine Repair', 'Other'
      )),
      description TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      vendor TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_clinic_expenses_expense_date'
  ) THEN
    CREATE INDEX idx_clinic_expenses_expense_date ON public.clinic_expenses (expense_date);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_clinic_expenses_updated_at ON public.clinic_expenses;
CREATE TRIGGER update_clinic_expenses_updated_at BEFORE UPDATE ON public.clinic_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.clinic_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_expenses_select" ON public.clinic_expenses;
CREATE POLICY "clinic_expenses_select" ON public.clinic_expenses
  FOR SELECT TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "clinic_expenses_insert" ON public.clinic_expenses;
CREATE POLICY "clinic_expenses_insert" ON public.clinic_expenses
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "clinic_expenses_update" ON public.clinic_expenses;
CREATE POLICY "clinic_expenses_update" ON public.clinic_expenses
  FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "clinic_expenses_delete" ON public.clinic_expenses;
CREATE POLICY "clinic_expenses_delete" ON public.clinic_expenses
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- Easy-to-forget step (per the 040 post-mortem documented in
-- 041_appointment_schedule_windows.sql, repeated verbatim in 045): default
-- privileges only revoke anon for future tables, they don't grant
-- authenticated. Without this, PostgREST reports "table not found in
-- schema cache" -- looks like a stale-cache bug, is actually a missing GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_expenses TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TABLE IF EXISTS public.clinic_expenses;
