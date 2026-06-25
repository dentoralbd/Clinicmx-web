ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE public.payments AS p
SET payment_method = CASE
  WHEN pm.name = 'Check' THEN 'Cheque'
  WHEN pm.name = 'Bank Transfer' THEN 'Transfer'
  ELSE pm.name
END
FROM public.payment_methods AS pm
WHERE p.payment_method IS NULL
  AND p.payment_method_id = pm.id;

UPDATE public.payments
SET payment_method = 'Cash'
WHERE payment_method IS NULL;

ALTER TABLE public.payments
  ALTER COLUMN payment_method SET DEFAULT 'Cash',
  ALTER COLUMN payment_method SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_method_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_payment_method_check
      CHECK (payment_method IN ('Cash', 'Card', 'Cheque', 'Transfer'));
  END IF;
END
$$;
