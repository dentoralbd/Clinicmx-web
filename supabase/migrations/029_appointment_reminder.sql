-- One-tap WhatsApp reminders: set when staff taps the wa.me reminder for
-- this appointment; cleared on reschedule so a new reminder becomes due.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Rollback:
-- ALTER TABLE public.appointments DROP COLUMN IF EXISTS reminder_sent_at;
