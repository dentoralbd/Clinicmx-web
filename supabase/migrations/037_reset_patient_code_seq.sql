-- One-time cleanup: dev/verification test patients (created and later
-- deleted while building the Consultation feature, 2026-07-22) consumed
-- PT-1xxxxx numbers past the real patient range. Deleting a patient has
-- never freed its number -- patient_code_seq is a plain sequence, same
-- deliberate behavior as invoice numbers -- so the next real patient would
-- otherwise jump straight past all the deleted test ones.
--
-- Resets patient_code_seq to the highest PT- number actually in use right
-- now, computed live (not hardcoded), so the next real patient continues
-- cleanly from there. Safe to re-run at any time -- it always recomputes
-- from current data rather than assuming a fixed starting point.

DO $$
DECLARE highest bigint;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(patient_code FROM 4)::bigint - 100000), 0)
    INTO highest
    FROM patients
   WHERE patient_code ~ '^PT-[0-9]+$';
  PERFORM setval('patient_code_seq', highest, true);
END $$;
