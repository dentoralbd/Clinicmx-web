-- Patients registered with only an Age (no real Date of Birth) get a
-- synthetic date_of_birth via deriveDateOfBirthFromAge() (src/pages/Patients.tsx)
-- — today's month/day, years subtracted. That's indistinguishable from a
-- real DOB in this column alone, which means the Celebrations & Greetings
-- feature (added 2026-08-22) would wrongly flag every age-only patient as
-- "Birthday Today" on their registration date, every year. This flag lets
-- the celebration engine (src/lib/celebrationReminders.ts) skip the
-- birthday check for those patients instead of guessing from the date shape.
--
-- Existing patients default to FALSE (assumed real DOB) — there is no way
-- to tell, after the fact, which of them were originally entered via Age
-- only; this only prevents the problem going forward.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS dob_is_estimated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN patients.dob_is_estimated IS
  'TRUE when date_of_birth was derived from an entered Age rather than a real birthdate (deriveDateOfBirthFromAge() in Patients.tsx). Existing rows default FALSE since the original source cannot be recovered. Used to suppress false "Birthday Today" alerts in the Celebrations & Greetings feature.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE patients DROP COLUMN IF EXISTS dob_is_estimated;
