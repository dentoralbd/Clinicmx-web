-- Multiple appointment schedule windows per day (e.g. 10am-2pm AND 5pm-10pm
-- on the same weekday), plus one-off date overrides (holidays / special
-- hours). Replaces the single start/end window in appointment_settings
-- (040) -- that table is retired here; slot length stays a fixed 30-min
-- constant in code (SLOT_MINUTES in src/lib/appointmentSlots.ts), same as
-- before, never exposed in the UI.
--
-- Model: a day's schedule is either
--   1. a date-specific override (appointment_schedule_date_overrides has a
--      row for that calendar date) -- either fully closed, or its own
--      window list from appointment_schedule_windows (override_date set), OR
--   2. the recurring weekly pattern for that weekday
--      (appointment_schedule_windows rows with day_of_week set). Zero
--      recurring windows for a weekday means that weekday is closed --
--      replaces the old separate `open_days` array entirely.

CREATE TABLE IF NOT EXISTS appointment_schedule_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer,
  override_date date,
  start_hour integer NOT NULL,
  start_minute integer NOT NULL,
  end_hour integer NOT NULL,
  end_minute integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_schedule_windows_scope_check CHECK (
    (day_of_week IS NOT NULL AND override_date IS NULL AND day_of_week BETWEEN 0 AND 6)
    OR (day_of_week IS NULL AND override_date IS NOT NULL)
  ),
  CONSTRAINT appointment_schedule_windows_hours_valid CHECK (
    start_hour BETWEEN 0 AND 23 AND end_hour BETWEEN 0 AND 23
    AND start_minute IN (0, 30) AND end_minute IN (0, 30)
    AND (start_hour * 60 + start_minute) < (end_hour * 60 + end_minute)
  )
);

CREATE INDEX IF NOT EXISTS idx_appointment_schedule_windows_day
  ON appointment_schedule_windows(day_of_week) WHERE day_of_week IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_schedule_windows_date
  ON appointment_schedule_windows(override_date) WHERE override_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS appointment_schedule_date_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_date date UNIQUE NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: same locked-down model as every other table (039). Any active
-- app_user can read (doctor/operator need this to render the slot picker);
-- only admin can write. NOTE (see 040's post-mortem, 2026-07-28): grant
-- table-level privileges to `authenticated` explicitly -- default
-- privileges only revoke anon for future tables, they don't grant
-- authenticated, and PostgREST reports a missing grant as "table not
-- found in schema cache" which looks like a stale-cache bug but isn't.

ALTER TABLE appointment_schedule_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_schedule_date_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointment_schedule_windows_select" ON appointment_schedule_windows;
CREATE POLICY "appointment_schedule_windows_select" ON appointment_schedule_windows
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "appointment_schedule_windows_insert" ON appointment_schedule_windows;
CREATE POLICY "appointment_schedule_windows_insert" ON appointment_schedule_windows
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "appointment_schedule_windows_delete" ON appointment_schedule_windows;
CREATE POLICY "appointment_schedule_windows_delete" ON appointment_schedule_windows
  FOR DELETE TO authenticated USING (public.is_app_admin());

DROP POLICY IF EXISTS "appointment_schedule_date_overrides_select" ON appointment_schedule_date_overrides;
CREATE POLICY "appointment_schedule_date_overrides_select" ON appointment_schedule_date_overrides
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "appointment_schedule_date_overrides_insert" ON appointment_schedule_date_overrides;
CREATE POLICY "appointment_schedule_date_overrides_insert" ON appointment_schedule_date_overrides
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "appointment_schedule_date_overrides_update" ON appointment_schedule_date_overrides;
CREATE POLICY "appointment_schedule_date_overrides_update" ON appointment_schedule_date_overrides
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "appointment_schedule_date_overrides_delete" ON appointment_schedule_date_overrides;
CREATE POLICY "appointment_schedule_date_overrides_delete" ON appointment_schedule_date_overrides
  FOR DELETE TO authenticated USING (public.is_app_admin());

GRANT SELECT, INSERT, DELETE ON public.appointment_schedule_windows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_schedule_date_overrides TO authenticated;

-- Seed the current 5pm-10pm/every day pattern as recurring windows, so
-- nothing changes for staff until an admin edits it. Only runs if the
-- table is empty (safe to re-run this migration file).
INSERT INTO appointment_schedule_windows (day_of_week, start_hour, start_minute, end_hour, end_minute)
SELECT d, 17, 0, 22, 0
FROM generate_series(0, 6) AS d
WHERE NOT EXISTS (SELECT 1 FROM appointment_schedule_windows);

-- appointment_settings (040) is superseded -- drop it.
DROP TABLE IF EXISTS appointment_settings;

NOTIFY pgrst, 'reload schema';
