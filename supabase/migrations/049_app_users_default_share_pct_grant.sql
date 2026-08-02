-- Fixes a gap in 048_app_users_default_share_pct.sql: app_users uses
-- column-level grants (039_rls_lockdown.sql §4, REVOKE ALL + explicit
-- allow-list) rather than a blanket table grant, so a new column is
-- invisible to `authenticated` until it's added to the SELECT list too.
-- 048 added the column but not the grant, so listAppUsers() and
-- fetchDoctorsList() (both `select`, run as `authenticated` from the
-- browser) failed with "permission denied for table app_users" the moment
-- default_share_pct was added to their column list.
--
-- No UPDATE grant needed: the only writer is functions/api/admin-users.ts,
-- which uses the service_role key and bypasses grants/RLS entirely.
GRANT SELECT (default_share_pct) ON public.app_users TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- REVOKE SELECT (default_share_pct) ON public.app_users FROM authenticated;
