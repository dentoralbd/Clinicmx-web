-- App user accounts (doctor / operator) managed by the admin from the Admin zone.
-- The admin itself has no row here — it authenticates with the fixed app password.
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role TEXT NOT NULL CHECK (role IN ('doctor', 'operator')),
  full_name TEXT NOT NULL,
  -- Normalized login identifier: lowercase email, or phone digits (optional leading +)
  identifier TEXT NOT NULL,
  -- PBKDF2-SHA256 (100k iterations, 256-bit), base64
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- {"can_delete":bool,"can_revert":bool,"can_edit_clinic_profile":bool,
  --  "pages":{"patients":bool,"appointments":bool,"treatments":bool,
  --           "prescriptions":bool,"billing":bool,"inventory":bool,"qr-search":bool}}
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_app_users_identifier ON app_users (identifier);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on app_users" ON app_users
  FOR ALL USING (true);
