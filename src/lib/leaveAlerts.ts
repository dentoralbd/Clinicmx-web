import { supabase } from './supabase'

/**
 * Admin-only pending count for the notification bell (NotificationBell.tsx).
 * Deliberately its own tiny module rather than living in hr.ts: hr.ts pulls
 * in staff.ts for calculateStaffSalarySummary, which drags jspdf/jspdf-autotable
 * along with it — fine for the lazily-loaded HR & Payroll page, but
 * NotificationBell is part of the always-loaded Header, so importing hr.ts
 * from it bloated every page's main bundle by ~450KB (found via `npm run
 * build` chunk-size warning, 2026-08-08). Same live-count pattern as
 * countPendingIpRequests() in ipAccess.ts — no stored notification row to
 * insert on submit or dismiss once acted on, it just reflects however many
 * 'Pending' rows RLS currently lets this admin see.
 */
export async function getPendingLeaveCount(): Promise<number> {
  const { count, error } = await supabase
    .from('staff_leaves')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Pending')
  if (error) throw new Error(error.message)
  return count ?? 0
}
