-- Consultation-only patients (patient_type = 'consultation', see migration
-- 033) were getting the same PT-1xxxxx code series as full patients, because
-- the patient_code column's DEFAULT (generate_patient_code()) can't see
-- NEW.patient_type from the same INSERT. Gives them their own CO-xxxxxx
-- series instead, via a BEFORE INSERT trigger that picks the right
-- generator. No JS changes needed: src/lib/patients.ts already re-reads
-- whatever code ends up on the row after insert.
--
-- Idempotent / safe to re-run against the live project.

-- Starts at 200001 (CO-200001) so the series is visually distinct from the
-- PT-1xxxxx range at a glance, per user request.
CREATE SEQUENCE IF NOT EXISTS consultation_code_seq START 200001;

CREATE OR REPLACE FUNCTION generate_consultation_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'CO-' || LPAD(nextval('consultation_code_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_patient_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.patient_code IS NULL THEN
    IF NEW.patient_type = 'consultation' THEN
      NEW.patient_code := generate_consultation_code();
    ELSE
      NEW.patient_code := generate_patient_code();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The column DEFAULT would populate patient_code before this trigger ever
-- sees the row, so NEW.patient_code would never be NULL for the trigger to
-- act on. Drop it and let the trigger own assignment for every insert.
ALTER TABLE patients ALTER COLUMN patient_code DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'patients' AND t.tgname = 'assign_patient_code_trigger'
  ) THEN
    CREATE TRIGGER assign_patient_code_trigger
      BEFORE INSERT ON public.patients
      FOR EACH ROW EXECUTE FUNCTION assign_patient_code();
  END IF;
END $$;

-- Deliberately NOT backfilled: consultation patients created before this
-- migration (e.g. any test entries) keep their existing PT- code.

-- Rollback:
-- DROP TRIGGER IF EXISTS assign_patient_code_trigger ON public.patients;
-- DROP FUNCTION IF EXISTS assign_patient_code();
-- DROP FUNCTION IF EXISTS generate_consultation_code();
-- DROP SEQUENCE IF EXISTS consultation_code_seq;
-- ALTER TABLE patients ALTER COLUMN patient_code SET DEFAULT generate_patient_code();
