-- Preserves the pre-discount price per treatment row so invoices generated from
-- discounted treatment plans (Add Visit auto-invoice) can show a discount line
-- instead of silently billing the already-discounted cost as if it were the base price.
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS original_cost numeric;
