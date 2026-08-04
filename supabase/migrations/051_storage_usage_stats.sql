-- Dashboard "Storage Health" tile (UI polish pass, 2026-08). Admin/operator
-- want a quick read on how much of the Supabase plan quota the clinic is
-- using, without opening the Supabase dashboard. Two numbers: total
-- database size and total bytes stored in the `patient-files` bucket
-- (x-rays, clinical images, profile photos — the thing that actually grows
-- fast and is realistically what hits a plan limit first).
--
-- SECURITY DEFINER, service_role-only (same pattern as 039_rls_lockdown.sql's
-- code-generation functions): `storage.objects` has RLS enabled by Supabase
-- Storage itself, so a plain SECURITY INVOKER call would only see rows the
-- caller's own policies allow — irrelevant here since summing bucket size is
-- an aggregate over ALL objects, not a per-user view. `pg_database_size`
-- needs no special privilege, but there's no reason to expose either number
-- to anon/authenticated: the only caller is functions/api/storage-usage.ts,
-- which holds the service_role key server-side and is itself gated by
-- requireStaffSession (any signed-in staff member) — never called from the
-- browser directly.

CREATE OR REPLACE FUNCTION public.get_storage_usage_stats()
RETURNS TABLE (database_bytes BIGINT, patient_files_bytes BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() NOT IN ('service_role') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    pg_database_size(current_database())::BIGINT,
    COALESCE((
      SELECT SUM((metadata->>'size')::BIGINT)
      FROM storage.objects
      WHERE bucket_id = 'patient-files'
    ), 0)::BIGINT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_storage_usage_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storage_usage_stats() TO service_role;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.get_storage_usage_stats();
