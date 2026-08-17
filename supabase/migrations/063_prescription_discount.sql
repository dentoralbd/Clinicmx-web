-- Doctors want an optional "Please discount XX%" line on the printed
-- prescription (a note to the pharmacy/lab), toggled by a checkbox on the
-- writing form. Stored as a single nullable percent: NULL = no discount
-- line printed, a number = show it at that percent. The 30% default shown
-- when the checkbox is first ticked is app-side only, not enforced here.
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS discount_percent NUMERIC;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE public.prescriptions DROP COLUMN IF EXISTS discount_percent;
