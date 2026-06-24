-- Patient files metadata table
-- Files are stored in Supabase Storage bucket "patient-files"
-- Bucket setup: create a public bucket named "patient-files" in your Supabase project
--   Dashboard → Storage → New bucket → Name: patient-files → Public: true
CREATE TABLE IF NOT EXISTS patient_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  file_category TEXT NOT NULL CHECK (file_category IN ('profile_photo', 'clinical_image', 'xray_image')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast patient file lookups
CREATE INDEX IF NOT EXISTS idx_patient_files_patient ON patient_files(patient_id);

-- Enable Row Level Security
ALTER TABLE patient_files ENABLE ROW LEVEL SECURITY;

-- Allow all operations (app does not use per-user auth)
CREATE POLICY "Allow all on patient_files"
  ON patient_files FOR ALL
  USING (true)
  WITH CHECK (true);
