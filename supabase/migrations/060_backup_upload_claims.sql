-- Prevents two sessions (two tabs, two devices, admin + operator now that
-- Smart-upload's check loop runs for both) from racing to perform the same
-- scheduled auto-upload. Found live 2026-08-12: two sessions both saw
-- "today's daily backup not done yet" within the same ~1-minute poll window
-- and both built + uploaded before either result was visible to the other
-- -- two near-identical files 10 seconds apart, harmless but wasteful and
-- confusing in the notification list.
--
-- One row per category, pre-seeded. claimBackupUpload() in
-- backupReminders.ts does an atomic UPDATE ... WHERE (same compare-and-swap
-- pattern as offline_edit_queue's claimMutation(), migration 055) so only
-- the first session to reach a given scheduled instant actually uploads;
-- the loser sees zero rows affected and skips.

CREATE TABLE IF NOT EXISTS backup_upload_claims (
  category text PRIMARY KEY CHECK (category IN ('daily', 'weekly', 'monthly')),
  instant timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  claimed_by_device text
);

ALTER TABLE backup_upload_claims ENABLE ROW LEVEL SECURITY;

-- Same access model as backup_settings (031/039): any active app_user
-- (admin, doctor, or operator) can read/claim. No INSERT/DELETE policy --
-- the three rows are pre-seeded below and only ever updated, never
-- created or removed by the app.
DROP POLICY IF EXISTS "backup_upload_claims_select" ON backup_upload_claims;
CREATE POLICY "backup_upload_claims_select" ON backup_upload_claims
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "backup_upload_claims_update" ON backup_upload_claims;
CREATE POLICY "backup_upload_claims_update" ON backup_upload_claims
  FOR UPDATE TO authenticated
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());

INSERT INTO backup_upload_claims (category, instant, claimed_at)
VALUES
  ('daily', '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z'),
  ('weekly', '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z'),
  ('monthly', '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z')
ON CONFLICT (category) DO NOTHING;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TABLE IF EXISTS backup_upload_claims;
