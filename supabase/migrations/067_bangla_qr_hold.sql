-- Migration 067: Track a pending Bangla QR request against an invoice, so Billing can
-- show "Hold BDT X on Bangla QR" instead of a plain "Due BDT X" for an invoice whose
-- balance is sitting there because a QR payment was requested (and possibly cancelled
-- before confirming), not because nobody has attempted to collect it yet.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS bangla_qr_hold_amount numeric;

COMMENT ON COLUMN public.invoices.bangla_qr_hold_amount IS
  'Non-null while a Bangla QR payment has been requested for this invoice and not yet confirmed. Set when BanglaQrPaymentModal opens; cleared whenever any payment is recorded against the invoice (recordInvoicePayment).';
