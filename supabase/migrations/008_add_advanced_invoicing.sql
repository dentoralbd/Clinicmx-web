-- Add core and advanced invoicing support

-- Core invoice columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS recurring_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_frequency text,
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_fee_amount numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_invoice_type_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_type_check CHECK (invoice_type IN ('basic', 'advanced'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_discount_type_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_discount_type_check CHECK (discount_type IN ('fixed', 'percentage'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_number_unique
  ON public.invoices(invoice_number)
  WHERE invoice_number IS NOT NULL;

-- System + custom templates
CREATE TABLE IF NOT EXISTS public.invoice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  invoice_type text NOT NULL DEFAULT 'basic' CHECK (invoice_type IN ('basic', 'advanced')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  discount_amount numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  payment_terms text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Link template to invoice only after template table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_template_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES public.invoice_templates(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Payment method catalog
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Individual invoice payments
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date timestamptz NOT NULL DEFAULT now(),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments(payment_date);

-- Installments / payment plan rows
CREATE TABLE IF NOT EXISTS public.payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  installment_no integer NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Overdue')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_invoice_id ON public.payment_plans(invoice_id);

-- Invoice history / audit entries
CREATE TABLE IF NOT EXISTS public.invoice_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_history_invoice_id ON public.invoice_history(invoice_id);

-- Invoice preferences (single-row style settings)
CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id integer PRIMARY KEY,
  invoice_prefix text NOT NULL DEFAULT 'INV',
  next_invoice_number integer NOT NULL DEFAULT 1,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  late_interest_rate numeric NOT NULL DEFAULT 0,
  payment_terms text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.invoice_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- seed payment methods
INSERT INTO public.payment_methods (code, name)
VALUES
  ('cash', 'Cash'),
  ('card', 'Card'),
  ('check', 'Check'),
  ('transfer', 'Bank Transfer')
ON CONFLICT (code) DO NOTHING;

-- seed common templates once
INSERT INTO public.invoice_templates (name, description, invoice_type, items, is_system, payment_terms)
VALUES
  (
    'General Checkup',
    'Consultation and oral exam',
    'basic',
    '[{"description":"General checkup","amount":800}]'::jsonb,
    true,
    'Due on receipt'
  ),
  (
    'Scaling & Polishing',
    'Standard cleaning session',
    'basic',
    '[{"description":"Scaling & polishing","amount":2500}]'::jsonb,
    true,
    'Due within 7 days'
  )
ON CONFLICT DO NOTHING;

-- Keep updated_at current
DROP TRIGGER IF EXISTS update_invoice_templates_updated_at ON public.invoice_templates;
CREATE TRIGGER update_invoice_templates_updated_at
BEFORE UPDATE ON public.invoice_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
