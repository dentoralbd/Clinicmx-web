-- Slot-based appointment booking: clinic operating-hours config.
-- Singleton settings row (same pattern as backup_settings, 031) so every
-- device reads/writes the same clinic hours. Defaults (17:00-22:00, all
-- days open) match today's de facto behavior, so applying this migration
-- changes nothing until an admin edits it via the new Clinic Hours tab.
--
-- RLS: written against the LOCKED-DOWN model (039_rls_lockdown.sql is
-- live in production as of 2026-07-26 -- confirmed via live diagnostics,
-- not the older "Allow all" convention some other comments in this repo
-- still describe). Any active app_user can read (doctor/operator need
-- this to render the slot picker in AppointmentModal/RescheduleModal);
-- only admin can write (matches the admin-only Clinic Hours tab).

CREATE TABLE IF NOT EXISTS appointment_settings (
  id integer PRIMARY KEY DEFAULT 1,
  start_hour integer NOT NULL DEFAULT 17,
  start_minute integer NOT NULL DEFAULT 0,
  end_hour integer NOT NULL DEFAULT 22,
  end_minute integer NOT NULL DEFAULT 0,
  slot_minutes integer NOT NULL DEFAULT 30,
  open_days integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0=Sun..6=Sat (date-fns getDay())
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_settings_singleton CHECK (id = 1),
  CONSTRAINT appointment_settings_hours_valid CHECK (
    start_hour BETWEEN 0 AND 23 AND end_hour BETWEEN 0 AND 23
    AND start_minute IN (0, 30) AND end_minute IN (0, 30)
  )
);

ALTER TABLE appointment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointment_settings_select" ON appointment_settings;
CREATE POLICY "appointment_settings_select" ON appointment_settings
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "appointment_settings_insert" ON appointment_settings;
CREATE POLICY "appointment_settings_insert" ON appointment_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "appointment_settings_update" ON appointment_settings;
CREATE POLICY "appointment_settings_update" ON appointment_settings
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- No DELETE policy -- singleton row, the app never deletes it.

INSERT INTO appointment_settings (id, start_hour, start_minute, end_hour, end_minute)
VALUES (1, 17, 0, 22, 0)
ON CONFLICT (id) DO NOTHING;
