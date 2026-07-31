-- Add doctor attribution and revenue share percentage to treatments table
ALTER TABLE treatments 
ADD COLUMN IF NOT EXISTS doctor_name TEXT,
ADD COLUMN IF NOT EXISTS doctor_share_pct DECIMAL(5,2) DEFAULT 30.00;

-- Add default doctor share percentage to doctor_profiles table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_profiles') THEN
    ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS default_share_pct DECIMAL(5,2) DEFAULT 30.00;
  END IF;
END $$;
