-- Shared (system-wide) Daily/Weekly/Monthly backup schedule config.
-- Previously stored per-device in localStorage, meaning two devices could
-- show/behave differently for the same clinic. This is a singleton table
-- (same pattern as invoice_settings) so every device reads and writes the
-- same schedule.

CREATE TABLE IF NOT EXISTS backup_settings (
  id integer PRIMARY KEY DEFAULT 1,
  daily jsonb NOT NULL DEFAULT '{"enabled":false,"time":"23:30","autoUpload":false}',
  weekly jsonb NOT NULL DEFAULT '{"enabled":false,"time":"23:30","autoUpload":false}',
  monthly jsonb NOT NULL DEFAULT '{"enabled":false,"time":"23:30","autoUpload":false}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backup_settings_singleton CHECK (id = 1)
);

ALTER TABLE backup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on backup_settings" ON backup_settings FOR ALL USING (true);

INSERT INTO backup_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
