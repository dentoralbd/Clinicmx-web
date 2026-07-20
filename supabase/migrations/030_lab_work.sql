-- Lab work tracking: crowns, bridges, dentures, ortho appliances and other
-- prosthetics sent out to a dental laboratory. This table records the clinic's
-- ACCOUNTS PAYABLE TO THE LAB VENDOR -- it is deliberately NOT patient
-- invoicing and has no link to invoices/payments. Payment state is a single
-- boolean (is_paid); partial payments are intentionally not tracked.
--
-- Rows are created by hand on the /lab page, or automatically when a
-- lab-related treatment is saved (see src/lib/labWork.ts). Auto-created rows
-- carry source_plan_group_id / source_treatment_id; the UNIQUE constraint on
-- (source_plan_group_id, work_type) is what makes the auto-create idempotent.
-- It is deliberately NOT partial: Postgres treats NULLs as distinct in a
-- unique index, so hand-made rows (NULL group) never collide, while
-- ON CONFLICT inference still works for the auto-created ones.
--
-- Guarded with existence checks so it is safe to re-run against the live project.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'lab_work' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.lab_work (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

      -- Vendor. Free text (no separate labs table yet); blank on auto-created
      -- rows until the user fills it in on the Lab page.
      lab_name TEXT NOT NULL DEFAULT '',
      work_type TEXT NOT NULL DEFAULT 'Other' CHECK (work_type IN (
        'Crown', 'Bridge', 'Denture', 'Ortho Appliance', 'Veneer',
        'Inlay/Onlay', 'Implant Prosthesis', 'Post & Core',
        'Splint/Night Guard', 'Other'
      )),

      -- FDI tooth numbers as a JSON array of integers, e.g. [11,12,13].
      -- Matches the number[] shape produced by src/components/ToothSelector.tsx.
      teeth JSONB NOT NULL DEFAULT '[]'::jsonb,
      -- Billable units. Defaults from the tooth count in the UI but is
      -- editable: an ortho appliance spans many teeth yet is a single unit.
      unit_count INTEGER NOT NULL DEFAULT 0 CHECK (unit_count >= 0),

      shade TEXT,
      material TEXT,

      -- 'per_unit' => unit_price * unit_count ; 'flat' => flat_price.
      -- Both price columns are kept so toggling the mode is non-destructive.
      pricing_mode TEXT NOT NULL DEFAULT 'per_unit' CHECK (pricing_mode IN ('per_unit', 'flat')),
      unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      flat_price numeric NOT NULL DEFAULT 0 CHECK (flat_price >= 0),

      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN (
        'Pending', 'Sent', 'Received', 'Delivered', 'Cancelled'
      )),
      date_sent DATE,
      expected_date DATE,
      date_received DATE,

      -- Simple accounts-payable flag: has the clinic paid the lab for this case?
      is_paid BOOLEAN NOT NULL DEFAULT false,

      notes TEXT,

      -- Provenance for auto-created rows. source_plan_group_id mirrors
      -- treatments.treatment_plan_group_id when one exists; flows without a
      -- plan group get a client-generated UUID so each submission stays unique.
      source_plan_group_id UUID,
      source_treatment_id UUID REFERENCES public.treatments(id) ON DELETE SET NULL,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT lab_work_source_dedup UNIQUE (source_plan_group_id, work_type)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_lab_work_patient_id'
  ) THEN
    CREATE INDEX idx_lab_work_patient_id ON public.lab_work (patient_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_lab_work_source_treatment_id'
  ) THEN
    CREATE INDEX idx_lab_work_source_treatment_id ON public.lab_work (source_treatment_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_lab_work_created_at'
  ) THEN
    CREATE INDEX idx_lab_work_created_at ON public.lab_work (created_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_lab_work_date_sent'
  ) THEN
    CREATE INDEX idx_lab_work_date_sent ON public.lab_work (date_sent);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_lab_work_expected_date'
  ) THEN
    CREATE INDEX idx_lab_work_expected_date ON public.lab_work (expected_date);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_lab_work_date_received'
  ) THEN
    CREATE INDEX idx_lab_work_date_received ON public.lab_work (date_received);
  END IF;
END $$;

-- updated_at maintenance (function defined in 001_initial_schema.sql).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'lab_work' AND t.tgname = 'update_lab_work_updated_at'
  ) THEN
    CREATE TRIGGER update_lab_work_updated_at
      BEFORE UPDATE ON public.lab_work
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.lab_work ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lab_work' AND policyname = 'Allow all on lab_work'
  ) THEN
    CREATE POLICY "Allow all on lab_work" ON public.lab_work
      FOR ALL USING (true);
  END IF;
END $$;

-- Allow 'lab_work' as a trackable entity_type, matching the TrackedEntityType
-- union in src/lib/entityTables.ts. Same DROP/ADD form as migration 020.
ALTER TABLE delete_history DROP CONSTRAINT delete_history_entity_type_check;
ALTER TABLE delete_history ADD CONSTRAINT delete_history_entity_type_check
  CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'patient_file', 'inventory_item', 'patient_visit', 'lab_work'));

ALTER TABLE edit_history DROP CONSTRAINT edit_history_entity_type_check;
ALTER TABLE edit_history ADD CONSTRAINT edit_history_entity_type_check
  CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'inventory_item', 'patient_visit', 'lab_work'));

-- Rollback:
-- NOTE: the two CHECK reverts below will fail if any delete_history/edit_history
-- row with entity_type = 'lab_work' exists. Delete those rows first:
--   DELETE FROM delete_history WHERE entity_type = 'lab_work';
--   DELETE FROM edit_history   WHERE entity_type = 'lab_work';
-- ALTER TABLE delete_history DROP CONSTRAINT delete_history_entity_type_check;
-- ALTER TABLE delete_history ADD CONSTRAINT delete_history_entity_type_check
--   CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'patient_file', 'inventory_item', 'patient_visit'));
-- ALTER TABLE edit_history DROP CONSTRAINT edit_history_entity_type_check;
-- ALTER TABLE edit_history ADD CONSTRAINT edit_history_entity_type_check
--   CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'inventory_item', 'patient_visit'));
-- DROP TRIGGER IF EXISTS update_lab_work_updated_at ON public.lab_work;
-- DROP POLICY IF EXISTS "Allow all on lab_work" ON public.lab_work;
-- DROP TABLE IF EXISTS public.lab_work;
