ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS chief_complaint_entries jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS on_examination_entries jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS diagnosis_entries jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS treatment_plan_entries jsonb DEFAULT '[]'::jsonb;

ALTER TABLE treatments
  ADD COLUMN IF NOT EXISTS prescription_entry_id text;
