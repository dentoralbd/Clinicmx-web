-- Recurring Expenses: monthly-repeating clinic bills (rent, utilities,
-- subscriptions) that feed the Clinic Expenses tab's "Recurring Expenses"
-- sub-menu (/financial-analysis). Admin-only, same is_app_admin() pattern
-- as clinic_expenses (059) and staff (045).
--
-- A recurring_expenses row is a TEMPLATE, not an expense itself. Clicking
-- "Generate <month>" (src/lib/recurringExpenses.ts) creates one real
-- clinic_expenses row per active template for that month, tagged via the
-- new clinic_expenses.recurring_expense_id column -- from that point on
-- it's an ordinary clinic_expenses row (editable/deletable like any other),
-- keeping the recurring/one-off ledgers unified instead of duplicating
-- totals logic. UNIQUE (recurring_expense_id, expense_date) makes
-- generation idempotent (mirrors staff_salary_payments' UNIQUE(staff_id,
-- period_month) + ensureMonthRows upsert pattern from 045) -- NULLs never
-- conflict with each other in Postgres, so this adds no constraint on
-- ordinary one-off expenses (recurring_expense_id IS NULL there).
--
-- Guarded with existence checks so this is safe to re-run against the live
-- project (matches the style of 059_clinic_expenses.sql).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'recurring_expenses' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.recurring_expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category TEXT NOT NULL CHECK (category IN ('Rent', 'Utilities', 'Subscription', 'Other')),
      description TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      vendor TEXT,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_recurring_expenses_updated_at ON public.recurring_expenses;
CREATE TRIGGER update_recurring_expenses_updated_at BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_expenses_select" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_select" ON public.recurring_expenses
  FOR SELECT TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "recurring_expenses_insert" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_insert" ON public.recurring_expenses
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "recurring_expenses_update" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_update" ON public.recurring_expenses
  FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "recurring_expenses_delete" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_delete" ON public.recurring_expenses
  FOR DELETE TO authenticated USING (public.is_app_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;

-- ----------------------------------------------------------------------------
-- clinic_expenses: link generated rows back to their template, widen the
-- category list to also accept the recurring-only categories (Rent/
-- Utilities/Subscription), and enforce one generated row per template/month.
-- ----------------------------------------------------------------------------

ALTER TABLE public.clinic_expenses
  ADD COLUMN IF NOT EXISTS recurring_expense_id UUID REFERENCES public.recurring_expenses(id) ON DELETE SET NULL;

ALTER TABLE public.clinic_expenses DROP CONSTRAINT IF EXISTS clinic_expenses_category_check;
ALTER TABLE public.clinic_expenses ADD CONSTRAINT clinic_expenses_category_check CHECK (category IN (
  'Instrument Purchase', 'Material Purchase', 'Machine Repair', 'Rent', 'Utilities', 'Subscription', 'Other'
));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_expenses_recurring_month_unique'
  ) THEN
    ALTER TABLE public.clinic_expenses
      ADD CONSTRAINT clinic_expenses_recurring_month_unique UNIQUE (recurring_expense_id, expense_date);
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE public.clinic_expenses DROP CONSTRAINT IF EXISTS clinic_expenses_recurring_month_unique;
-- ALTER TABLE public.clinic_expenses DROP CONSTRAINT IF EXISTS clinic_expenses_category_check;
-- ALTER TABLE public.clinic_expenses ADD CONSTRAINT clinic_expenses_category_check CHECK (category IN (
--   'Instrument Purchase', 'Material Purchase', 'Machine Repair', 'Other'
-- ));
-- ALTER TABLE public.clinic_expenses DROP COLUMN IF EXISTS recurring_expense_id;
-- DROP TABLE IF EXISTS public.recurring_expenses;
