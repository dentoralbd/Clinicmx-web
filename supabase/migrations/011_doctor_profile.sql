CREATE TABLE IF NOT EXISTS doctor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  full_name text NOT NULL DEFAULT '',
  degrees text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  workplace text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  bmdc_reg text DEFAULT '',
  signature_url text DEFAULT '',
  clinic_logo_url text DEFAULT '',
  clinic_address text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE doctor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile" ON doctor_profiles
  FOR ALL USING (auth.uid() = user_id);
