-- Patient weight (kg), optional, for clinical reference (not used in dosage math automatically).
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS weight numeric;
COMMENT ON COLUMN patients.weight IS 'Patient weight in kilograms, optional, for clinical reference.';

-- Weight recorded at the time a specific prescription was written (may differ from
-- patients.weight later -- e.g. a growing child weighed more at a later visit).
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS weight_at_prescription numeric;
COMMENT ON COLUMN prescriptions.weight_at_prescription IS 'Patient weight in kg at the time this prescription was written, optional.';
