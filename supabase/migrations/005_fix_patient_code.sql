-- Consolidate patient_code setup after migrations 003/004 which may
-- have been applied independently or in different environments.
-- This migration is fully idempotent and safe to run at any time.

-- 1. Ensure the column exists (no-op if already added by 003 or 004)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_code TEXT;

-- 2. Ensure the unique constraint exists (no-op if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_patient_code_key'
  ) THEN
    ALTER TABLE patients ADD CONSTRAINT patients_patient_code_key UNIQUE (patient_code);
  END IF;
END $$;

-- 3. Ensure the sequence exists at a safe starting point
--    START 1 is ignored if the sequence already exists.
CREATE SEQUENCE IF NOT EXISTS patient_code_seq START 1;

-- 4. Advance the sequence so it is always ahead of every existing code.
--    This prevents collisions whether 003 or 004 (or neither) ran first.
SELECT setval(
  'patient_code_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(SUBSTRING(patient_code FROM 4)::bigint)
         FROM patients
        WHERE patient_code ~ '^PT-[0-9]+$'),
      0
    ),
    (SELECT last_value FROM patient_code_seq)
  )
);

-- 5. (Re)create the generator function with consistent zero-padded format
CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PT-' || LPAD(nextval('patient_code_seq')::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 6. Set the column default to use the function
ALTER TABLE patients ALTER COLUMN patient_code SET DEFAULT generate_patient_code();

-- 7. Backfill any rows that still have a NULL patient_code
UPDATE patients
SET patient_code = generate_patient_code()
WHERE patient_code IS NULL;
