-- Doctor Analytics currently buckets a treatment's payout into the month it
-- was CREATED (treatments.created_at), even for money paid and work
-- finished much later. User decision, 2026-08-01: a treatment's payout
-- should show up in the statement for the month it was actually
-- COMPLETED/paid, not the month it was first logged. This adds a real
-- completed_at column so that date exists to bucket by, instead of trying
-- to approximate it from updated_at on every read.

ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Auto-set/clear on status transitions — not app-code's job, since there
-- are multiple write paths that can set status to 'Completed' (direct
-- edit, invoice flows, future ones) and a trigger guarantees none of them
-- can forget to stamp it. Fires on the *transition into* Completed, not on
-- every save while already Completed, so re-saving other fields doesn't
-- bump the date. Clears back to NULL if status moves away from Completed
-- (e.g. a mis-click corrected), so completed_at only ever reflects a
-- genuinely current completion.
CREATE OR REPLACE FUNCTION public.set_treatment_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Completed') THEN
    NEW.completed_at = now();
  ELSIF NEW.status IS DISTINCT FROM 'Completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_treatment_completed_at ON public.treatments;
CREATE TRIGGER set_treatment_completed_at
  BEFORE INSERT OR UPDATE ON public.treatments
  FOR EACH ROW EXECUTE FUNCTION public.set_treatment_completed_at();

-- One-time backfill for treatments already Completed before this migration
-- — the trigger only fires on future writes. treatments has no updated_at
-- column (checked: 001_initial_schema.sql only gives it created_at), so
-- created_at is the only timestamp available to backfill with. This is a
-- no-op for app-level bucketing (created_at is already the fallback when
-- completed_at is NULL — see calculateDoctorFinancialSummary), it just
-- keeps the column populated for anyone querying completed_at directly.
-- Exact (trigger-set) for every row going forward.
UPDATE public.treatments
   SET completed_at = created_at
 WHERE status = 'Completed' AND completed_at IS NULL;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS set_treatment_completed_at ON public.treatments;
-- DROP FUNCTION IF EXISTS public.set_treatment_completed_at();
-- ALTER TABLE public.treatments DROP COLUMN IF EXISTS completed_at;
