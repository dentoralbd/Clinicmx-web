-- Link treatments to invoices for billing workflow
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS is_invoiced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_treatments_invoice_id  ON public.treatments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_treatments_is_invoiced ON public.treatments(is_invoiced);
