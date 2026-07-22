-- Adds a patient_type flag so a walk-in consultation can be recorded as a
-- lightweight patients row (name/age/sex + fee) without appearing in the
-- main Patients list, Dashboard patient count, or Analytics new-patient
-- charts until it's explicitly converted to a full patient. See the
-- Consultation tab (src/pages/Consultations.tsx).
--
-- Guarded so it is safe to re-run against the live project.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'patient_type'
  ) THEN
    ALTER TABLE public.patients
      ADD COLUMN patient_type TEXT NOT NULL DEFAULT 'full' CHECK (patient_type IN ('full', 'consultation'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_patients_type'
  ) THEN
    CREATE INDEX idx_patients_type ON public.patients (patient_type);
  END IF;
END $$;

-- Rollback:
-- DROP INDEX IF EXISTS idx_patients_type;
-- ALTER TABLE public.patients DROP COLUMN IF EXISTS patient_type;
