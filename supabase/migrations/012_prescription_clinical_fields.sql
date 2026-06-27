ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS chief_complaint text DEFAULT '',
  ADD COLUMN IF NOT EXISTS on_examination text DEFAULT '';
