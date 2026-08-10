-- Catalog feature: clinic-managed categories for treatments/procedures and
-- medications, so new procedures/medications can be added going forward
-- without a code change.
--
-- dentalDrugDatabase.ts (the built-in BD drug directory) and its closed
-- 11-value category union are NOT touched by this migration — custom
-- medications here are additive, merged into DrugPicker alongside the
-- built-ins at the application layer.
--
-- treatments.treatment_type has never had a catalog (just 4 separately
-- hardcoded, already-drifted <select> option lists in the UI) — this is
-- the first real catalog for it.
--
-- Guarded with existence checks so this is safe to re-run against the live
-- project (matches the style of 030_lab_work.sql / 052_staff_leaves.sql).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'catalog_categories' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.catalog_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      domain TEXT NOT NULL CHECK (domain IN ('treatment', 'medication')),
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT catalog_categories_domain_name_key UNIQUE (domain, name)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'treatment_catalog_items' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.treatment_catalog_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      default_fee NUMERIC(10, 2),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT treatment_catalog_items_name_key UNIQUE (name)
    );

    CREATE INDEX treatment_catalog_items_category_idx ON public.treatment_catalog_items (category_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'custom_medications' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.custom_medications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
      brand TEXT NOT NULL,
      generic TEXT NOT NULL,
      dosage_form TEXT,
      default_dosage TEXT,
      default_frequency TEXT,
      default_duration TEXT,
      default_instructions TEXT,
      default_route TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX custom_medications_category_idx ON public.custom_medications (category_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_catalog_categories_updated_at ON public.catalog_categories;
CREATE TRIGGER update_catalog_categories_updated_at BEFORE UPDATE ON public.catalog_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_treatment_catalog_items_updated_at ON public.treatment_catalog_items;
CREATE TRIGGER update_treatment_catalog_items_updated_at BEFORE UPDATE ON public.treatment_catalog_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_custom_medications_updated_at ON public.custom_medications;
CREATE TRIGGER update_custom_medications_updated_at BEFORE UPDATE ON public.custom_medications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- === RLS: base pattern (matches inventory_items etc. in 039_rls_lockdown.sql) ===
-- Any active app_users row -> select/insert/update. Delete gated on
-- app_can('can_delete') (admin always passes).

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_medications ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_categories', 'treatment_catalog_items', 'custom_medications']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_active_app_user())',
      t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_active_app_user())',
      t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_active_app_user()) WITH CHECK (public.is_active_app_user())',
      t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.app_can(''can_delete''))',
      t || '_delete', t);
  END LOOP;
END $$;

-- Easy-to-forget step (per the 040 post-mortem documented in
-- 041_appointment_schedule_windows.sql): default privileges only revoke
-- anon for future tables, they don't grant authenticated. Without this,
-- PostgREST reports "table not found in schema cache", which looks like a
-- stale-cache bug but is actually a missing GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_catalog_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_medications TO authenticated;

-- === Seed data =================================================================
-- Medication categories: the 11 built-in BDDrug categories from
-- dentalDrugDatabase.ts / DrugPicker.tsx's CATEGORY_ORDER, so the DB becomes
-- the source of truth for category existence/order going forward, while
-- DrugPicker keeps its hardcoded color styling as a resilient fallback.

INSERT INTO public.catalog_categories (domain, name, sort_order) VALUES
  ('medication', 'Antibiotic', 0),
  ('medication', 'Analgesic', 1),
  ('medication', 'Anti-inflammatory', 2),
  ('medication', 'Local anesthetic', 3),
  ('medication', 'Antifungal', 4),
  ('medication', 'Antiviral', 5),
  ('medication', 'Antiseptic', 6),
  ('medication', 'Anxiolytic', 7),
  ('medication', 'Steroid', 8),
  ('medication', 'Antifibrinolytic', 9),
  ('medication', 'Anti-ulcerant', 10)
ON CONFLICT (domain, name) DO NOTHING;

-- Treatment catalog: one starter category holding the union of today's 4
-- separately hardcoded <select> lists (Treatments.tsx x2, PatientProfile.tsx
-- x2), so nothing regresses. The clinic can re-categorize via the new
-- Catalog page afterward.

INSERT INTO public.catalog_categories (domain, name, sort_order) VALUES
  ('treatment', 'General Procedures', 0)
ON CONFLICT (domain, name) DO NOTHING;

INSERT INTO public.treatment_catalog_items (category_id, name, sort_order)
SELECT c.id, item.name, item.sort_order
FROM public.catalog_categories c
CROSS JOIN (VALUES
  ('Filling', 0), ('Root Canal', 1), ('Crown', 2), ('Bridge', 3),
  ('Extraction', 4), ('Implant', 5), ('Cleaning', 6), ('Whitening', 7),
  ('Braces', 8), ('Dentures', 9), ('Scaling', 10), ('Veneer', 11),
  ('Consultation', 12), ('Other', 13)
) AS item(name, sort_order)
WHERE c.domain = 'treatment' AND c.name = 'General Procedures'
ON CONFLICT (name) DO NOTHING;

-- === Extend delete_history / edit_history entity_type check constraints ===
-- (020-style) — treatment_catalog_item and custom_medication are audit-tracked
-- (ENTITY_TABLE_COLUMNS in src/lib/entityTables.ts), so logEdit()/logDeletion()
-- calls for them would otherwise fail this CHECK. Current allowlist as of 030
-- reproduced in full (DROP+ADD replaces the whole list, not just appends).

ALTER TABLE delete_history DROP CONSTRAINT delete_history_entity_type_check;
ALTER TABLE delete_history ADD CONSTRAINT delete_history_entity_type_check
  CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'patient_file', 'inventory_item', 'patient_visit', 'lab_work', 'treatment_catalog_item', 'custom_medication'));

ALTER TABLE edit_history DROP CONSTRAINT edit_history_entity_type_check;
ALTER TABLE edit_history ADD CONSTRAINT edit_history_entity_type_check
  CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'inventory_item', 'patient_visit', 'lab_work', 'treatment_catalog_item', 'custom_medication'));

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TABLE IF EXISTS public.custom_medications;
-- DROP TABLE IF EXISTS public.treatment_catalog_items;
-- DROP TABLE IF EXISTS public.catalog_categories;
-- ALTER TABLE delete_history DROP CONSTRAINT delete_history_entity_type_check;
-- ALTER TABLE delete_history ADD CONSTRAINT delete_history_entity_type_check
--   CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'patient_file', 'inventory_item', 'patient_visit', 'lab_work'));
-- ALTER TABLE edit_history DROP CONSTRAINT edit_history_entity_type_check;
-- ALTER TABLE edit_history ADD CONSTRAINT edit_history_entity_type_check
--   CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'inventory_item', 'patient_visit', 'lab_work'));
