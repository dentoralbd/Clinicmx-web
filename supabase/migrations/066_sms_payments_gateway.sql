-- Migration 066: Add gateway support for SMS verification and dynamic Bangla QR

-- Add gateway tracking columns to payments table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_provider text,
  ADD COLUMN IF NOT EXISTS gateway_reference text,
  ADD COLUMN IF NOT EXISTS gateway_transaction_id text,
  ADD COLUMN IF NOT EXISTS gateway_status text;

-- Partial unique index as idempotency guard: prevents double-recording the same SMS/TrxID
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_gateway_reference_unique
  ON public.payments (gateway_reference)
  WHERE gateway_reference IS NOT NULL;

-- Add merchant Bangla QR template payload to invoice_settings table
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS bangla_qr_merchant_payload text;

-- Seed default merchant Bangla QR payload (Pubali Bank PLC, GOPI SANKAR BANIK,
-- terminal PBLQR01169431) if none exists yet, or repair a prior typo (BABIK).
UPDATE public.invoice_settings
SET bangla_qr_merchant_payload = '00020101021126560016com.pubalibankbd0102000204017503189017520000116943115204541153030505802BD5925GOPI SANKAR BANIK        6005DHAKA62320211019147997620713PBLQR0116943164170002bn0107bangali91200016com.pubalibankbd6304EE51'
WHERE id = 1 AND (bangla_qr_merchant_payload IS NULL OR bangla_qr_merchant_payload LIKE '%BABIK%');
