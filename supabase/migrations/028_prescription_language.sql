-- Tracks which language (Bengali or English) a prescription's medication fields were
-- written in, so print/share can respect an intentionally-English prescription instead
-- of always converting to Bengali. Existing rows default to 'bn' (matches current
-- render-time translation behavior for legacy data).
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'bn';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'prescriptions_language_check'
  ) THEN
    ALTER TABLE prescriptions
      ADD CONSTRAINT prescriptions_language_check CHECK (language IN ('bn', 'en'));
  END IF;
END $$;

-- Rollback:
-- ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_language_check;
-- ALTER TABLE prescriptions DROP COLUMN IF EXISTS language;
