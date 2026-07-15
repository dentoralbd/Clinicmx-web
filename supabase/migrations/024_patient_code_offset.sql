-- Shift patient codes into the PT-1xxxxx range (e.g. PT-00021 -> PT-100021)
-- by adding a 100000 offset and widening the zero-padding from 5 to 6 digits.
-- Idempotent: re-running after the offset has already been applied is a no-op,
-- since the WHERE clause only matches codes still in the old 5-digit form.

-- 1. Backfill existing codes to the new offset/width.
UPDATE patients
SET patient_code = 'PT-' || LPAD((SUBSTRING(patient_code FROM 4)::bigint + 100000)::text, 6, '0')
WHERE patient_code ~ '^PT-[0-9]{1,5}$';

-- 2. Recreate the generator function so future codes keep the offset and width.
--    The underlying sequence is untouched and keeps counting from where it left
--    off; the offset is applied only at format time.
CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PT-' || LPAD((nextval('patient_code_seq') + 100000)::text, 6, '0');
END;
$$ LANGUAGE plpgsql;
