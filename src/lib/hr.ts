import { supabase } from '@/lib/supabase'
import { getAuditActor } from '@/lib/appSession'
import { logActivity, type ActivityAction } from '@/lib/activityLog'
import { calculateStaffSalarySummary, type StaffRecord, type StaffSalaryPayment } from '@/lib/staff'

// ---------------------------------------------------------------------------
// Leave requests
// ---------------------------------------------------------------------------

export type LeaveType = 'Annual' | 'Sick' | 'Casual' | 'Unpaid' | 'Maternity'
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected'

export interface LeaveRequest {
  id: string
  staff_id: string | null
  app_user_id: string | null
  requester_name: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  reason: string | null
  status: LeaveStatus
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
}

const LEAVE_COLUMNS =
  'id, staff_id, app_user_id, requester_name, leave_type, start_date, end_date, reason, status, decided_by, decided_at, decision_note, created_at, updated_at'

const MISSING_TABLE_MESSAGE =
  'Could not load leave data. If the staff_leaves table does not exist yet, apply migration 052 in Supabase first.'

function wrapLoadError(err: unknown): Error {
  return err instanceof Error ? new Error(err.message) : new Error(MISSING_TABLE_MESSAGE)
}

/** Admin view: every leave request, newest first. RLS restricts this to admin sessions. */
export async function listLeaveRequests(): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from('staff_leaves')
    .select(LEAVE_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw wrapLoadError(error)
  return (data ?? []) as LeaveRequest[]
}

/** Self-service view: only the signed-in account's own requests (RLS-enforced). */
export async function listMyLeaveRequests(): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from('staff_leaves')
    .select(LEAVE_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw wrapLoadError(error)
  return (data ?? []) as LeaveRequest[]
}

export interface LeaveRequestInput {
  staff_id?: string | null
  requester_name?: string | null
  leave_type: LeaveType
  start_date: string
  end_date: string
  reason?: string | null
}

/**
 * Creates a leave request. Called both by the admin's "Add leave for staff"
 * modal (staff_id/requester_name supplied explicitly) and by self-service
 * submission (left null — the staff_leaves_fill_requester trigger resolves
 * app_user_id/staff_id/requester_name from the signed-in session).
 */
export async function createLeaveRequest(input: LeaveRequestInput): Promise<LeaveRequest> {
  const { data, error } = await supabase
    .from('staff_leaves')
    .insert({
      staff_id: input.staff_id || null,
      requester_name: input.requester_name?.trim() || undefined,
      leave_type: input.leave_type,
      start_date: input.start_date,
      end_date: input.end_date,
      reason: input.reason?.trim() || null,
    })
    .select(LEAVE_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  const row = data as LeaveRequest
  logActivity({
    action: 'create' as ActivityAction,
    entityType: 'staff_leave',
    entityId: row.id,
    entityLabel: row.requester_name,
    details: `${row.leave_type} leave requested, ${row.start_date} to ${row.end_date}`,
  })
  return row
}

export async function decideLeaveRequest(
  id: string,
  status: 'Approved' | 'Rejected',
  note: string | null,
  requesterName?: string
): Promise<void> {
  const { error } = await supabase
    .from('staff_leaves')
    .update({
      status,
      decided_by: getAuditActor(),
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  logActivity({
    action: 'edit',
    entityType: 'staff_leave',
    entityId: id,
    entityLabel: requesterName ?? null,
    details: `Leave request ${status.toLowerCase()}`,
  })
}

/** Cancels the signed-in account's own still-pending request (RLS-enforced). */
export async function cancelMyLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase.from('staff_leaves').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export interface LeaveBalance {
  quotaDays: number
  usedDays: number
  remainingDays: number
}

/**
 * The signed-in account's own annual leave balance (quota set by the admin
 * on the roster, used = approved leave of any type within the given
 * calendar year — user decision, 2026-08-08). Calls the `my_leave_balance`
 * RPC (migration 053) rather than reading `staff` directly: `staff` also
 * holds `monthly_salary` and is admin/`can_access_staff_analytics`-gated,
 * so a non-admin has no SELECT access to it — the RPC is a SECURITY
 * DEFINER function that returns only these three numbers.
 * Returns null when the signed-in account isn't linked to a `staff` roster
 * row (no quota to show — not an error).
 */
export async function getMyLeaveBalance(year?: number): Promise<LeaveBalance | null> {
  const { data, error } = await (supabase as any).rpc('my_leave_balance', {
    p_year: year ?? new Date().getFullYear(),
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    quotaDays: Number(row.quota_days),
    usedDays: Number(row.used_days),
    remainingDays: Number(row.remaining_days),
  }
}

/** Inclusive day count between two 'YYYY-MM-DD' dates. */
export function leaveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff + 1)
}

function isLeaveActiveOn(leave: LeaveRequest, isoDate: string): boolean {
  return leave.status === 'Approved' && leave.start_date <= isoDate && leave.end_date >= isoDate
}

// ---------------------------------------------------------------------------
// HR & Payroll metrics — pure functions over already-fetched rows, no
// extra network round-trips. Reuses calculateStaffSalarySummary (src/lib/staff.ts)
// so the payroll totals here can never drift from what Staff & Salary shows.
// ---------------------------------------------------------------------------

export interface PayrollBreakdown {
  base: number
  bonus: number
  deduction: number
  advance: number
}

export interface PayrollTrendPoint {
  month: string
  netPayable: number
  paid: number
}

export interface StaffMixSlice {
  designation: string
  count: number
}

export interface HRMetrics {
  totalStaff: number
  activeStaff: number
  onLeaveToday: number
  pendingLeaves: number
  netPayrollThisMonth: number
  totalPaidThisMonth: number
  totalDueThisMonth: number
  averageSalaryThisMonth: number
  payrollBreakdown: PayrollBreakdown
  payrollTrend: PayrollTrendPoint[]
  staffMix: StaffMixSlice[]
}

export function getHRMetrics(
  monthKey: string,
  staff: StaffRecord[],
  payments: StaffSalaryPayment[],
  leaves: LeaveRequest[]
): HRMetrics {
  const totalStaff = staff.length
  const activeStaff = staff.filter((s) => s.is_active).length

  const todayIso = new Date().toISOString().slice(0, 10)
  const onLeaveToday = leaves.filter((l) => isLeaveActiveOn(l, todayIso)).length
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending').length

  const summary = calculateStaffSalarySummary(staff, payments, 'ALL', monthKey)

  const payrollBreakdown: PayrollBreakdown = {
    base: summary.totalBase,
    bonus: summary.totalBonus,
    deduction: summary.totalDeduction,
    advance: summary.totalAdvance,
  }

  const months = Array.from(new Set(payments.map((p) => p.period_month))).sort()
  const recentMonths = (months.includes(monthKey) ? months : [...months, monthKey].sort()).slice(-6)
  const payrollTrend: PayrollTrendPoint[] = recentMonths.map((m) => {
    const s = calculateStaffSalarySummary(staff, payments, 'ALL', m)
    return { month: m, netPayable: s.totalNetPayable, paid: s.totalPaid }
  })

  const mixMap = new Map<string, number>()
  staff
    .filter((s) => s.is_active)
    .forEach((s) => {
      const key = s.designation?.trim() || 'Unspecified'
      mixMap.set(key, (mixMap.get(key) ?? 0) + 1)
    })
  const staffMix: StaffMixSlice[] = Array.from(mixMap.entries())
    .map(([designation, count]) => ({ designation, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalStaff,
    activeStaff,
    onLeaveToday,
    pendingLeaves,
    netPayrollThisMonth: summary.totalNetPayable,
    totalPaidThisMonth: summary.totalPaid,
    totalDueThisMonth: summary.totalDue,
    averageSalaryThisMonth: summary.rowCount > 0 ? summary.totalBase / summary.rowCount : 0,
    payrollBreakdown,
    payrollTrend,
    staffMix,
  }
}

// ---------------------------------------------------------------------------
// Recent HR activity feed — reuses the existing activity_log table (admin-only
// per its own RLS), filtered to staff/salary/leave events.
// ---------------------------------------------------------------------------

export interface HrActivityRow {
  id: string
  action: string
  entity_type: string
  entity_label: string | null
  details: string | null
  actor: string
  occurred_at: string
}

export async function listHrActivity(limit = 15): Promise<HrActivityRow[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, action, entity_type, entity_label, details, actor, occurred_at')
    .in('entity_type', ['staff', 'staff_salary', 'staff_leave'])
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as HrActivityRow[]
}
