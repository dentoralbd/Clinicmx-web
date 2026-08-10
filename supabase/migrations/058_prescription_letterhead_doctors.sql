-- Prescription letterhead doctors: the clinic's real physical prescription
-- pad lists two doctors side by side (DentOral Dental Care), but the
-- existing doctor_profiles table is a de facto singleton (025) used
-- elsewhere for the clinic-wide profile (Invoice letterhead, "My Profile"
-- tab, etc.) — that usage/convention is left untouched. This is a separate,
-- purpose-built, genuinely multi-row table so doctors shown on the
-- prescription letterhead can be added/edited/removed by the clinic via a
-- new Admin screen, without changing what "doctor_profiles" means anywhere
-- else in the app.
--
-- Access mirrors doctor_profiles' own policy shape (039_rls_lockdown.sql):
-- any active app user can read; only can_edit_clinic_profile can
-- write; only admin can delete.
--
-- Guarded with existence checks so this is safe to re-run against the live
-- project.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'prescription_letterhead_doctors' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.prescription_letterhead_doctors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      degrees TEXT NOT NULL DEFAULT '',
      designation TEXT NOT NULL DEFAULT '',
      bmdc_reg TEXT NOT NULL DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_prescription_letterhead_doctors_updated_at ON public.prescription_letterhead_doctors;
CREATE TRIGGER update_prescription_letterhead_doctors_updated_at BEFORE UPDATE ON public.prescription_letterhead_doctors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.prescription_letterhead_doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prescription_letterhead_doctors_select" ON public.prescription_letterhead_doctors;
CREATE POLICY "prescription_letterhead_doctors_select" ON public.prescription_letterhead_doctors
  FOR SELECT TO authenticated USING (public.is_active_app_user());

DROP POLICY IF EXISTS "prescription_letterhead_doctors_insert" ON public.prescription_letterhead_doctors;
CREATE POLICY "prescription_letterhead_doctors_insert" ON public.prescription_letterhead_doctors
  FOR INSERT TO authenticated WITH CHECK (public.app_can('can_edit_clinic_profile'));

DROP POLICY IF EXISTS "prescription_letterhead_doctors_update" ON public.prescription_letterhead_doctors;
CREATE POLICY "prescription_letterhead_doctors_update" ON public.prescription_letterhead_doctors
  FOR UPDATE TO authenticated
  USING (public.app_can('can_edit_clinic_profile'))
  WITH CHECK (public.app_can('can_edit_clinic_profile'));

DROP POLICY IF EXISTS "prescription_letterhead_doctors_delete" ON public.prescription_letterhead_doctors;
CREATE POLICY "prescription_letterhead_doctors_delete" ON public.prescription_letterhead_doctors
  FOR DELETE TO authenticated USING (public.is_app_admin());

-- Easy-to-forget step (per the 040 post-mortem documented in
-- 041_appointment_schedule_windows.sql): default privileges only revoke
-- anon for future tables, they don't grant authenticated.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_letterhead_doctors TO authenticated;

-- Seed with today's single doctor_profiles row so the letterhead isn't blank
-- on first deploy. The clinic adds the second (and any future) doctor via
-- the new Admin > Prescription Doctors screen afterward.
INSERT INTO public.prescription_letterhead_doctors (full_name, degrees, designation, bmdc_reg, display_order)
SELECT full_name, degrees, designation, bmdc_reg, 0
FROM public.doctor_profiles
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TABLE IF EXISTS public.prescription_letterhead_doctors;
