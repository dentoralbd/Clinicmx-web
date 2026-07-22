-- Consultation codes (CO-4xxxxx, migrations 034/035) came from a sequence,
-- so deleting the latest consultation entry left a permanent gap: delete
-- CO-400002, add a new one, and it became CO-400003. Recompute the next
-- code from live rows instead — max existing CO number + 1 (floor 400000) —
-- so the number freed by deleting (or converting) the latest entry is
-- reused by the next one. Interior gaps (deleting an older entry while
-- newer ones exist) are deliberately not back-filled: codes stay monotonic
-- and a number that may exist on old printed invoices is never resurrected.
--
-- Concurrency: two simultaneous inserts could compute the same max; the
-- UNIQUE constraint on patient_code makes one fail loudly instead of
-- corrupting data — acceptable for a single-clinic deployment.
--
-- Idempotent / safe to re-run.

CREATE OR REPLACE FUNCTION generate_consultation_code()
RETURNS TEXT AS $$
DECLARE next_num bigint;
BEGIN
  SELECT GREATEST(COALESCE(MAX(SUBSTRING(patient_code FROM 4)::bigint), 400000), 400000) + 1
    INTO next_num
    FROM patients
   WHERE patient_code ~ '^CO-[0-9]+$';
  RETURN 'CO-' || LPAD(next_num::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- consultation_code_seq is now unused; kept (harmless) so rolling back to
-- the 034/035 behavior is a single CREATE OR REPLACE FUNCTION away.

-- Rollback (restores the sequence-based generator):
-- CREATE OR REPLACE FUNCTION generate_consultation_code()
-- RETURNS TEXT AS $$
-- BEGIN
--   RETURN 'CO-' || LPAD(nextval('consultation_code_seq')::text, 6, '0');
-- END;
-- $$ LANGUAGE plpgsql;
