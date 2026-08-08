import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Users,
  UserCheck,
  CalendarDays,
  Wallet,
  Clock,
  Check,
  X,
  Plus,
  AlertCircle,
  ScrollText,
  Landmark,
  PieChart as PieChartIcon,
} from 'lucide-react'
import { getAppRole } from '@/lib/appSession'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import { StaffAnalyticsSection } from '@/components/analytics/StaffAnalyticsSection'
import { ChartCard, ChartEmptyState, CHART_COLORS, formatBDTCompact, TOOLTIP_ITEM_STYLE } from '@/components/analytics/ChartCard'
import { listStaff, listSalaryPayments, type StaffRecord } from '@/lib/staff'
import {
  listLeaveRequests,
  createLeaveRequest,
  decideLeaveRequest,
  leaveDays,
  getHRMetrics,
  listHrActivity,
  type LeaveRequest,
  type LeaveType,
  type HrActivityRow,
} from '@/lib/hr'

type HRTab = 'overview' | 'leaves' | 'staff'

function currentMonthKey() {
  return new Date().toISOString().substring(0, 7)
}

function emptyLeaveForm() {
  return { staff_id: '', leave_type: 'Annual' as LeaveType, start_date: '', end_date: '', reason: '' }
}

export function HRPayroll() {
  const isAdmin = getAppRole() === 'admin'

  const [tab, setTab] = useState<HRTab>('overview')

  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof listSalaryPayments>>>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [activity, setActivity] = useState<HrActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [leaveFilter, setLeaveFilter] = useState<'Pending' | 'Approved' | 'Rejected' | 'All'>('Pending')
  const [addLeaveOpen, setAddLeaveOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState(emptyLeaveForm())
  const [submittingLeave, setSubmittingLeave] = useState(false)

  const [decisionTarget, setDecisionTarget] = useState<{ leave: LeaveRequest; status: 'Approved' | 'Rejected' } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState(false)

  const monthKey = currentMonthKey()

  useEffect(() => {
    if (isAdmin) loadAll()
  }, [isAdmin])

  async function loadAll() {
    try {
      setLoading(true)
      setLoadError(null)
      const [staffRows, paymentRows, leaveRows, activityRows] = await Promise.all([
        listStaff(),
        listSalaryPayments(),
        listLeaveRequests(),
        listHrActivity().catch(() => [] as HrActivityRow[]),
      ])
      setStaff(staffRows)
      setPayments(paymentRows)
      setLeaves(leaveRows)
      setActivity(activityRows)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load HR & Payroll data.')
    } finally {
      setLoading(false)
    }
  }

  const metrics = useMemo(() => getHRMetrics(monthKey, staff, payments, leaves), [monthKey, staff, payments, leaves])

  const visibleLeaves = useMemo(
    () => (leaveFilter === 'All' ? leaves : leaves.filter((l) => l.status === leaveFilter)),
    [leaves, leaveFilter]
  )

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  const payrollBreakdownData = [
    { label: 'Base', value: metrics.payrollBreakdown.base },
    { label: 'Bonus', value: metrics.payrollBreakdown.bonus },
    { label: 'Deduction', value: metrics.payrollBreakdown.deduction },
    { label: 'Advance', value: metrics.payrollBreakdown.advance },
  ]
  const hasPayrollBreakdown = payrollBreakdownData.some((d) => d.value > 0)

  const staffMixData = metrics.staffMix.map((m) => ({ label: m.designation, value: m.count }))

  async function handleAddLeaveSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!leaveForm.staff_id || !leaveForm.start_date || !leaveForm.end_date) {
      alert('Please fill all required fields.')
      return
    }
    const chosen = staff.find((s) => s.id === leaveForm.staff_id)
    setSubmittingLeave(true)
    try {
      await createLeaveRequest({
        staff_id: leaveForm.staff_id,
        requester_name: chosen?.full_name,
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason || null,
      })
      setAddLeaveOpen(false)
      setLeaveForm(emptyLeaveForm())
      setLeaves(await listLeaveRequests())
      setActivity(await listHrActivity().catch(() => activity))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create leave request.')
    } finally {
      setSubmittingLeave(false)
    }
  }

  async function handleDecisionSubmit() {
    if (!decisionTarget) return
    setDeciding(true)
    try {
      await decideLeaveRequest(decisionTarget.leave.id, decisionTarget.status, decisionNote, decisionTarget.leave.requester_name)
      setDecisionTarget(null)
      setDecisionNote('')
      setLeaves(await listLeaveRequests())
      setActivity(await listHrActivity().catch(() => activity))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update leave request.')
    } finally {
      setDeciding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 page-fade-in pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-teal-600" /> HR &amp; Payroll
        </h1>
        <p className="text-text-secondary text-sm mt-1">Staff roster, salary statements, and leave management.</p>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="font-medium">{loadError}</p>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-gray-200 flex-wrap">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<PieChartIcon className="w-4 h-4" />} label="Overview" />
        <TabButton
          active={tab === 'leaves'}
          onClick={() => setTab('leaves')}
          icon={<CalendarDays className="w-4 h-4" />}
          label="Leave Requests"
          badge={metrics.pendingLeaves > 0 ? metrics.pendingLeaves : undefined}
        />
        <TabButton active={tab === 'staff'} onClick={() => setTab('staff')} icon={<Wallet className="w-4 h-4" />} label="Staff & Salary" />
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile icon={<Users className="w-4 h-4 text-blue-500" />} label="Total Staff" value={String(metrics.totalStaff)} accent="bg-blue-50" />
            <KpiTile icon={<UserCheck className="w-4 h-4 text-emerald-500" />} label="Active Staff" value={String(metrics.activeStaff)} accent="bg-emerald-50" />
            <KpiTile icon={<CalendarDays className="w-4 h-4 text-amber-500" />} label="On Leave Today" value={String(metrics.onLeaveToday)} accent="bg-amber-50" />
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 shadow-lg text-white">
              <div className="flex items-center gap-2 text-slate-300 mb-2">
                <Landmark className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-semibold uppercase tracking-wider">Net Payroll ({monthKey})</span>
              </div>
              <p className="text-2xl font-display font-bold font-mono">{formatBDT(metrics.netPayrollThisMonth)}</p>
              <p className="text-xs text-slate-400 mt-1">
                Paid {formatBDT(metrics.totalPaidThisMonth)} · Due {formatBDT(metrics.totalDueThisMonth)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              icon={<Wallet className="w-4 h-4" />}
              title="Payroll Summary"
              caption={`Base, bonus, deduction and advance across all staff for ${monthKey}. Generate the month in Staff & Salary if it's empty.`}
            >
              {!hasPayrollBreakdown ? (
                <ChartEmptyState message={`No salary rows generated for ${monthKey} yet`} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={payrollBreakdownData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} horizontal={false} />
                    <XAxis type="number" tickFormatter={formatBDTCompact} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                    <Tooltip formatter={(v: unknown) => formatBDT(Number(v))} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                    <Bar dataKey="value" name="Amount" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard icon={<Users className="w-4 h-4" />} title="Staff Mix" caption="Active staff grouped by designation.">
              {staffMixData.length === 0 ? (
                <ChartEmptyState message="No active staff yet" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={staffMixData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                    <Tooltip itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(74, 58, 167, 0.06)' }} />
                    <Bar dataKey="value" name="Staff" fill={CHART_COLORS.secondary} radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard icon={<Landmark className="w-4 h-4" />} title="Payroll Trend" caption="Net payable vs. paid, last 6 generated months.">
            {metrics.payrollTrend.every((p) => p.netPayable === 0 && p.paid === 0) ? (
              <ChartEmptyState message="No payroll history yet" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={metrics.payrollTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                  <YAxis tickFormatter={formatBDTCompact} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip formatter={(v: unknown) => formatBDT(Number(v))} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="netPayable" name="Net Payable" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="paid" name="Paid" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-display font-bold text-lg text-slate-900 mb-3 flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-teal-600" /> Recent HR Activity
            </h3>
            {activity.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No HR activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {activity.map((a) => (
                  <li key={a.id} className="py-2.5 text-sm flex items-start justify-between gap-4">
                    <div>
                      <span className="font-medium text-slate-800">{a.entity_label || a.entity_type}</span>
                      <span className="text-slate-500"> — {a.details || a.action}</span>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(a.occurred_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(['Pending', 'Approved', 'Rejected', 'All'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLeaveFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    leaveFilter === f ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-gray-200 text-slate-600 hover:border-teal-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => setAddLeaveOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
              <Plus className="w-4 h-4 mr-1.5" /> Add Leave For Staff
            </Button>
          </div>

          {visibleLeaves.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No {leaveFilter !== 'All' ? leaveFilter.toLowerCase() : ''} leave requests.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-5 py-3">Staff</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Duration</th>
                    <th className="px-5 py-3">Reason</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleLeaves.map((leave) => (
                    <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-900">{leave.requester_name}</td>
                      <td className="px-5 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {leave.leave_type}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-slate-700 font-medium">
                          {new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-slate-500">{leaveDays(leave.start_date, leave.end_date)} day(s)</p>
                      </td>
                      <td className="px-5 py-3 text-slate-500 max-w-[220px] truncate" title={leave.reason || ''}>
                        {leave.reason || '-'}
                      </td>
                      <td className="px-5 py-3">
                        <LeaveStatusBadge status={leave.status} />
                        {leave.decision_note && <p className="text-xs text-slate-400 mt-0.5">{leave.decision_note}</p>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {leave.status === 'Pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setDecisionTarget({ leave, status: 'Approved' })}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDecisionTarget({ leave, status: 'Rejected' })}
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{leave.decided_by ? `by ${leave.decided_by}` : '-'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'staff' && <StaffAnalyticsSection />}

      {/* Add leave (on behalf of staff) modal */}
      {addLeaveOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Add Leave For Staff</h2>
              <button type="button" onClick={() => setAddLeaveOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddLeaveSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Staff Member *</label>
                <select
                  required
                  value={leaveForm.staff_id}
                  onChange={(e) => setLeaveForm({ ...leaveForm, staff_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Select Staff...</option>
                  {staff.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type</label>
                <select
                  value={leaveForm.leave_type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value as LeaveType })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="Annual">Annual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Casual">Casual Leave</option>
                  <option value="Unpaid">Unpaid Leave</option>
                  <option value="Maternity">Maternity Leave</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <textarea
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setAddLeaveOpen(false)} disabled={submittingLeave}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submittingLeave}>
                  {submittingLeave ? 'Saving…' : 'Add Leave'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve/Reject decision modal */}
      {decisionTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">
                {decisionTarget.status} — {decisionTarget.leave.requester_name}
              </h2>
              <button type="button" onClick={() => setDecisionTarget(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">
                {decisionTarget.leave.leave_type} leave, {new Date(decisionTarget.leave.start_date).toLocaleDateString()} –{' '}
                {new Date(decisionTarget.leave.end_date).toLocaleDateString()} ({leaveDays(decisionTarget.leave.start_date, decisionTarget.leave.end_date)} day(s))
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">Note (optional)</label>
                <textarea
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDecisionTarget(null)} disabled={deciding}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleDecisionSubmit}
                  disabled={deciding}
                  className={decisionTarget.status === 'Approved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                >
                  {deciding ? 'Saving…' : `Confirm ${decisionTarget.status}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
        active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon} {label}
      {typeof badge === 'number' && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  )
}

function KpiTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-start justify-between relative overflow-hidden group">
      <div className={`absolute -right-4 -top-4 w-24 h-24 ${accent} rounded-full transition-transform group-hover:scale-150 duration-500 z-0`} />
      <div className="relative z-10 space-y-2">
        <div className="flex items-center gap-2 text-slate-500">
          {icon}
          <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-3xl font-display font-bold text-slate-900">{value}</p>
      </div>
    </div>
  )
}

function LeaveStatusBadge({ status }: { status: LeaveRequest['status'] }) {
  if (status === 'Pending') {
    return (
      <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold">
        <Clock className="w-3.5 h-3.5" /> Pending
      </span>
    )
  }
  if (status === 'Approved') {
    return (
      <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
        <Check className="w-3.5 h-3.5" /> Approved
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-red-600 text-xs font-bold">
      <X className="w-3.5 h-3.5" /> Rejected
    </span>
  )
}
