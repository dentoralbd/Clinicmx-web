-- Link patient_visits to the invoice created for that visit, so Visit History
-- can show the invoice's current (post-discount) billed/due amounts instead of
-- a frozen pre-discount snapshot captured in notes at visit-creation time.
ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_visits_invoice_id ON public.patient_visits(invoice_id);
