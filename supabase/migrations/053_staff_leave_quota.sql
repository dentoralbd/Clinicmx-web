-- Per-staff annual leave quota, plus a SECURITY DEFINER RPC so a non-admin
-- account can see its own "total / used / remaining" leave balance on the
-- My Leave tab (src/components/hr/MyLeaveTab.tsx) without needing any read
-- access to `staff` itself.
--
-- Deliberately an RPC, not a relaxed `staff` SELECT policy: `staff` also
-- holds `monthly_salary` (admin/`can_access_staff_analytics`-only per
-- migration 046) and RLS is row-level, not column-level, so a "read your
-- own row" policy on `staff` would hand every account its own salary row
-- too. The RPC is owned by postgres (bypasses `staff`'s RLS by design,
-- same pattern as `staff_leaves_fill_requester()` in 052) and returns only
-- the three numbers the tab needs.
--
-- Guarded with existence checks so this is safe to re-run against the live
-- project (matches the style of 045/052).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'leave_quota_days'
  ) THEN
    ALTER TABLE public.staff
      ADD COLUMN leave_quota_days NUMERIC NOT NULL DEFAULT 20 CHECK (leave_quota_days >= 0);
  END IF;
END $$;

-- `staff` uses a table-wide GRANT (045), not a column allow-list like
-- `app_users` (DATABASE.md §3) — this new column is already covered,
-- no separate GRANT needed here.

CREATE OR REPLACE FUNCTION public.my_leave_balance(p_year int DEFAULT EXTRACT(YEAR FROM now())::int)
RETURNS TABLE(quota_days numeric, used_days numeric, remaining_days numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    s.leave_quota_days AS quota_days,
    COALESCE(u.days, 0) AS used_days,
    GREATEST(s.leave_quota_days - COALESCE(u.days, 0), 0) AS remaining_days
  FROM public.staff s
  LEFT JOIN LATERAL (
    -- All approved leave types count against the same pool (user decision,
    -- 2026-08-08) — not just 'Annual'. Inclusive day count, matching the
    -- client-side leaveDays() helper in src/lib/hr.ts.
    SELECT SUM(l.end_date - l.start_date + 1) AS days
    FROM public.staff_leaves l
    WHERE l.app_user_id = s.app_user_id
      AND l.status = 'Approved'
      AND EXTRACT(YEAR FROM l.start_date) = p_year
  ) u ON true
  WHERE s.app_user_id = public.current_app_user_id()
  LIMIT 1;
$$;
-- No rows back means the calling account isn't linked to a `staff` roster
-- row (app_users.id not referenced by any staff.app_user_id) — the tab
-- treats that as "no quota to show", not an error.

REVOKE ALL ON FUNCTION public.my_leave_balance(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_leave_balance(int) TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.my_leave_balance(int);
-- ALTER TABLE public.staff DROP COLUMN IF EXISTS leave_quota_days;
