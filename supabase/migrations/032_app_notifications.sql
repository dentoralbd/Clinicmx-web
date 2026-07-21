-- Shared (system-wide) in-app notification center. Previously stored per-
-- device in localStorage (src/lib/notifications.ts), meaning two admins on
-- different devices saw different notification lists — confusing when a
-- backup reminder or auto-upload result should mean the same thing to
-- everyone. This is a real table (not a singleton) — many rows, newest
-- first, same pattern used for activity_log/delete_history.

CREATE TABLE IF NOT EXISTS app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  link_to text,
  audience text,            -- null = visible to every role; 'admin' etc. to restrict
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_created_at ON app_notifications(created_at DESC);

ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on app_notifications" ON app_notifications FOR ALL USING (true);
