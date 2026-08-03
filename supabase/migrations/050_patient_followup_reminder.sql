-- Dashboard treatment follow-up nudges: set when staff sends the WhatsApp
-- "come back to finish your treatment" message, so the patient drops off
-- the list for 30 days instead of reappearing every day.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS followup_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN patients.followup_reminder_sent_at IS
  'Last time a treatment follow-up WhatsApp reminder was sent from the Dashboard card. Snoozes the patient from that list for 30 days. NULL = never reminded.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE patients DROP COLUMN IF EXISTS followup_reminder_sent_at;
