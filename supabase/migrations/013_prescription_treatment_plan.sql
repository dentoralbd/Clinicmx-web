ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS treatment_plan text DEFAULT '';

ALTER TABLE treatments
  ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES prescriptions(id) ON DELETE SET NULL;
