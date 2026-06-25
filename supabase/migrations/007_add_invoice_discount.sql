-- Add discount_amount column to invoices table
-- Uses IF NOT EXISTS pattern via DO block for safety on existing databases

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0;

    -- Backfill existing rows (already covered by DEFAULT 0, but explicit for clarity)
    UPDATE public.invoices SET discount_amount = 0 WHERE discount_amount IS NULL;
  END IF;
END
$$;
