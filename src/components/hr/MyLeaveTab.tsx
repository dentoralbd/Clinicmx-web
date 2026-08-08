import { useEffect, useState } from 'react'
import { CalendarDays, Clock, Check, X, Plus, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  listMyLeaveRequests,
  createLeaveRequest,
  cancelMyLeaveRequest,
  getMyLeaveBalance,
  leaveDays,
  type LeaveRequest,
  type LeaveType,
  type LeaveBalance,
} from '@/lib/hr'

function emptyLeaveForm() {
  return { leave_type: 'Annual' as LeaveType, start_date: '', end_date: '', reason: '' }
}

export function MyLeaveTab() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyLeaveForm())
  const [submitting, setSubmitting] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      setLoadError(null)
      setLeaves(await listMyLeaveRequests())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your leave requests.')
    } finally {
      setLoading(false)
    }
    // Separate from the requests load: a missing quota (migration 053 not
    // yet applied, or this account not linked to a staff roster row) is
    // never fatal to the rest of the tab, so it fails silently to null.
    setBalance(await getMyLeaveBalance().catch(() => null))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start_date || !form.end_date) {
      alert('Please choose a start and end date.')
      return
    }
    setSubmitting(true)
    try {
      await createLeaveRequest({
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || null,
      })
      setFormOpen(false)
      setForm(emptyLeaveForm())
      setLeaves(await listMyLeaveRequests())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit leave request.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancel this leave request?')) return
    setCancellingId(id)
    try {
      await cancelMyLeaveRequest(id)
      setLeaves(await listMyLeaveRequests())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel request.')
    } finally {
      setCancellingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="font-medium">{loadError}</p>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-teal-600" /> My Leave
        </h3>
        <Button size="sm" onClick={() => setFormOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
          <Plus className="w-4 h-4 mr-1.5" /> Request Leave
        </Button>
      </div>

      {balance && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Leave</p>
            <p className="text-2xl font-display font-bold text-slate-900 mt-1">{balance.quotaDays}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Used ({new Date().getFullYear()})</p>
            <p className="text-2xl font-display font-bold text-slate-900 mt-1">{balance.usedDays}</p>
          </div>
          <div className="bg-teal-50 rounded-xl border border-teal-200 shadow-sm p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">Leave Left</p>
            <p className="text-2xl font-display font-bold text-teal-700 mt-1">{balance.remainingDays}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {leaves.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">You haven't requested any leave yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaves.map((leave) => (
                  <tr key={leave.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {leave.leave_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700 font-medium">
                        {new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-slate-500">{leaveDays(leave.start_date, leave.end_date)} day(s)</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate" title={leave.reason || ''}>
                      {leave.reason || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {leave.status === 'Pending' && (
                        <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold">
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}
                      {leave.status === 'Approved' && (
                        <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                          <Check className="w-3.5 h-3.5" /> Approved
                        </span>
                      )}
                      {leave.status === 'Rejected' && (
                        <span className="flex items-center gap-1.5 text-red-600 text-xs font-bold">
                          <X className="w-3.5 h-3.5" /> Rejected
                        </span>
                      )}
                      {leave.decision_note && <p className="text-xs text-slate-400 mt-0.5">{leave.decision_note}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {leave.status === 'Pending' ? (
                        <button
                          type="button"
                          onClick={() => handleCancel(leave.id)}
                          disabled={cancellingId === leave.id}
                          className="text-xs font-semibold text-red-600 hover:text-red-800 underline disabled:opacity-50"
                        >
                          {cancellingId === leave.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Request Leave</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type</label>
                <select
                  value={form.leave_type}
                  onChange={(e) => setForm({ ...form, leave_type: e.target.value as LeaveType })}
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
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Optional details..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setFormOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
