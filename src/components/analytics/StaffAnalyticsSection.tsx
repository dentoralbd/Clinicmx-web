import { useEffect, useMemo, useState } from 'react'
import { Users, UserPlus, Pencil, Trash2, Power, DollarSign, FileSpreadsheet, FileText, RefreshCw, AlertTriangle, X, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import { sharePdf } from '@/lib/sharePdf'
import { supabase } from '@/lib/supabase'
import { listAppUsers, type AppUserRecord } from '@/lib/appUsers'
import { loadDoctorProfile, type DoctorProfileData } from '@/lib/doctorProfile'
import {
  listStaff,
  createStaff,
  updateStaff,
  setStaffActive,
  deleteStaff,
  listSalaryPayments,
  ensureMonthRows,
  updateSalaryPayment,
  calculateStaffSalarySummary,
  exportStaffSalaryCSV,
  generateStaffSalaryPDF,
  type StaffRecord,
  type StaffSalaryPayment,
  type StaffStatementRow,
  type SalaryPaymentInput,
} from '@/lib/staff'

function emptyStaffForm() {
  return { full_name: '', phone: '', designation: '', monthly_salary: '', app_user_id: '', joined_on: '', notes: '' }
}

function currentMonthKey() {
  return new Date().toISOString().substring(0, 7)
}

export function StaffAnalyticsSection() {
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [payments, setPayments] = useState<StaffSalaryPayment[]>([])
  const [appUsers, setAppUsers] = useState<AppUserRecord[]>([])
  const [treatmentDoctorNames, setTreatmentDoctorNames] = useState<string[]>([])
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [staffModal, setStaffModal] = useState<'create' | 'edit' | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffRecord | null>(null)
  const [staffForm, setStaffForm] = useState(emptyStaffForm())
  const [staffFormError, setStaffFormError] = useState('')
  const [staffSaving, setStaffSaving] = useState(false)

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('ALL')
  const [generating, setGenerating] = useState(false)

  const [paymentModal, setPaymentModal] = useState<StaffStatementRow | null>(null)
  const [paymentForm, setPaymentForm] = useState<SalaryPaymentInput>({
    bonus: 0,
    deduction: 0,
    advance: 0,
    amount_paid: 0,
    payment_date: null,
    notes: null,
  })
  const [paymentSaving, setPaymentSaving] = useState(false)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      setLoadError(null)
      const [staffRows, paymentRows, userRows] = await Promise.all([
        listStaff(),
        listSalaryPayments(),
        listAppUsers().catch(() => [] as AppUserRecord[]),
      ])
      setStaff(staffRows)
      setPayments(paymentRows)
      setAppUsers(userRows)
      loadDoctorProfile().then(setDoctorProfile, () => {})

      // Advisory double-pay check only — reads the same distinct-doctor-name
      // query PatientProfile.tsx already uses for its own dropdown. Never
      // filters or recalculates Doctor Analytics' own payout math.
      const { data: txs } = await supabase.from('treatments').select('doctor_name')
      const names = Array.from(new Set((txs || []).map((t: any) => (t.doctor_name || '').trim()).filter(Boolean)))
      setTreatmentDoctorNames(names)
    } catch (err) {
      console.error('Error loading staff analytics:', err)
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not load staff data. If the staff table does not exist yet, apply migration 045 in Supabase first.'
      )
    } finally {
      setLoading(false)
    }
  }

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff])

  const uniqueMonths = useMemo(() => {
    const set = new Set<string>(payments.map((p) => p.period_month))
    set.add(currentMonthKey())
    return Array.from(set).sort().reverse()
  }, [payments])

  const summary = useMemo(
    () => calculateStaffSalarySummary(staff, payments, selectedStaffFilter, selectedMonth),
    [staff, payments, selectedStaffFilter, selectedMonth]
  )

  const doublePayWarnings = useMemo(() => {
    const nameSet = new Set(treatmentDoctorNames.map((n) => n.toLowerCase()))
    return staff.filter((s) => s.is_active && nameSet.has(s.full_name.trim().toLowerCase()))
  }, [staff, treatmentDoctorNames])

  async function handleGenerateMonth() {
    try {
      setGenerating(true)
      await ensureMonthRows(selectedMonth, activeStaff)
      setPayments(await listSalaryPayments())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate month.')
    } finally {
      setGenerating(false)
    }
  }

  function openCreateStaff() {
    setStaffForm(emptyStaffForm())
    setSelectedStaff(null)
    setStaffFormError('')
    setStaffModal('create')
  }

  function openEditStaff(s: StaffRecord) {
    setSelectedStaff(s)
    setStaffForm({
      full_name: s.full_name,
      phone: s.phone || '',
      designation: s.designation || '',
      monthly_salary: String(s.monthly_salary),
      app_user_id: s.app_user_id || '',
      joined_on: s.joined_on || '',
      notes: s.notes || '',
    })
    setStaffFormError('')
    setStaffModal('edit')
  }

  async function handleStaffSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStaffFormError('')
    if (!staffForm.full_name.trim()) {
      setStaffFormError('Name is required.')
      return
    }
    const salary = parseFloat(staffForm.monthly_salary)
    if (isNaN(salary) || salary < 0) {
      setStaffFormError('Enter a valid monthly salary.')
      return
    }
    setStaffSaving(true)
    try {
      const input = {
        full_name: staffForm.full_name,
        phone: staffForm.phone || null,
        designation: staffForm.designation || null,
        monthly_salary: salary,
        app_user_id: staffForm.app_user_id || null,
        joined_on: staffForm.joined_on || null,
        notes: staffForm.notes || null,
      }
      if (staffModal === 'create') {
        await createStaff(input)
      } else if (staffModal === 'edit' && selectedStaff) {
        await updateStaff(selectedStaff.id, input)
      }
      setStaffModal(null)
      setStaff(await listStaff())
    } catch (err) {
      setStaffFormError(err instanceof Error ? err.message : 'Failed to save staff member.')
    } finally {
      setStaffSaving(false)
    }
  }

  async function handleToggleActive(s: StaffRecord) {
    const verb = s.is_active ? 'Mark inactive' : 'Mark active'
    if (!confirm(`${verb}: ${s.full_name}?`)) return
    try {
      await setStaffActive(s.id, !s.is_active, s.full_name)
      setStaff(await listStaff())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status.')
    }
  }

  async function handleDeleteStaff(s: StaffRecord) {
    if (!confirm(`Delete ${s.full_name}? This removes their salary history too.`)) return
    try {
      await deleteStaff(s.id, s.full_name)
      setStaff(await listStaff())
      setPayments(await listSalaryPayments())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete staff member.')
    }
  }

  function openPaymentModal(row: StaffStatementRow) {
    setPaymentModal(row)
    setPaymentForm({
      bonus: row.bonus,
      deduction: row.deduction,
      advance: row.advance,
      amount_paid: row.amountPaid,
      payment_date: row.paymentDate,
      notes: row.notes || null,
    })
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!paymentModal) return
    setPaymentSaving(true)
    try {
      await updateSalaryPayment(paymentModal.paymentId, paymentForm, paymentModal.fullName, selectedMonth)
      setPaymentModal(null)
      setPayments(await listSalaryPayments())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save payment.')
    } finally {
      setPaymentSaving(false)
    }
  }

  function handleDownloadCSV() {
    exportStaffSalaryCSV(summary)
  }

  async function handleDownloadPDF() {
    const doc = generateStaffSalaryPDF(summary, doctorProfile)
    const fileName = `Staff_Salary_${summary.staffLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${summary.periodLabel}.pdf`
    await sharePdf(doc, fileName, {
      subject: `Staff Salary Statement — ${summary.staffLabel} (${summary.periodLabel})`,
      text: `Staff salary statement for ${summary.staffLabel}, period ${summary.periodLabel}.`,
      docLabel: 'Salary Statement',
    })
  }

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-gray-200/80 p-8 text-center space-y-3">
        <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-500 font-medium">Loading Staff Analytics...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-3 font-medium">{loadError}</div>
      )}

      {doublePayWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Possible double payout: </span>
            {doublePayWarnings.map((s) => s.full_name).join(', ')} {doublePayWarnings.length === 1 ? 'is' : 'are'} on fixed
            salary here and also {doublePayWarnings.length === 1 ? 'has' : 'have'} treatments attributed to them in Doctor
            Analytics, where a revenue-share payout is still calculated separately. Review before paying — this is advisory
            only, nothing on either page has been changed.
          </div>
        </div>
      )}

      {/* Roster card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="font-display font-bold text-lg text-slate-900">Staff & Salary</h3>
              <p className="text-xs text-slate-500">Roster of salaried staff, including any fixed-salary doctors.</p>
            </div>
          </div>
          <Button size="sm" onClick={openCreateStaff} className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
            <UserPlus className="w-4 h-4 mr-1.5" /> Add Staff
          </Button>
        </div>

        {staff.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">No staff added yet.</div>
        ) : (
          <div className="overflow-auto max-h-[50vh]">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-800 text-white font-bold border-b sticky top-0 z-10">
                <tr>
                  <th className="p-2.5">Name</th>
                  <th className="p-2.5">Phone</th>
                  <th className="p-2.5">Designation</th>
                  <th className="p-2.5 text-right">Designated Salary</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-900">{s.full_name}</td>
                    <td className="p-2.5">{s.phone || '-'}</td>
                    <td className="p-2.5">{s.designation || '-'}</td>
                    <td className="p-2.5 text-right font-mono">{formatBDT(s.monthly_salary)}</td>
                    <td className="p-2.5 text-center">
                      {s.is_active ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditStaff(s)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-teal-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(s)}
                          title={s.is_active ? 'Mark inactive' : 'Mark active'}
                          className={`p-1.5 rounded-lg ${
                            s.is_active
                              ? 'text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                              : 'text-red-500 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStaff(s)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Salary statement card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" /> Monthly Salary Statement
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Generate the month, record payments, export a statement.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleDownloadCSV} className="text-xs" disabled={summary.rowCount === 0}>
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" /> Export Excel CSV
            </Button>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
              onClick={handleDownloadPDF}
              disabled={summary.rowCount === 0}
            >
              <FileText className="w-4 h-4 mr-1.5" /> PDF Statement
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-teal-600" /> Month:
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
            >
              {uniqueMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Staff:</label>
            <select
              value={selectedStaffFilter}
              onChange={(e) => setSelectedStaffFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
            >
              <option value="ALL">👥 All Staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button size="sm" variant="outline" onClick={handleGenerateMonth} disabled={generating} className="w-full text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating…' : `Generate ${selectedMonth}`}
            </Button>
          </div>
        </div>

        {summary.rowCount === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            ✨ No salary rows for {selectedMonth} yet. Click "Generate {selectedMonth}" to seed rows for every active staff
            member.
          </div>
        ) : (
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-800 text-white font-bold border-b sticky top-0 z-10">
                <tr>
                  <th className="p-2.5">Staff</th>
                  <th className="p-2.5">Designation</th>
                  <th className="p-2.5 text-right">Base Salary</th>
                  <th className="p-2.5 text-right">Bonus</th>
                  <th className="p-2.5 text-right">Deduction</th>
                  <th className="p-2.5 text-right">Advance</th>
                  <th className="p-2.5 text-right font-bold text-amber-300">Net Payable</th>
                  <th className="p-2.5 text-right bg-emerald-900 text-emerald-200">Paid</th>
                  <th className="p-2.5 text-right bg-red-900 text-red-200">Due</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.items.map((r) => (
                  <tr key={r.paymentId} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-900">{r.fullName}</td>
                    <td className="p-2.5">{r.designation || '-'}</td>
                    <td className="p-2.5 text-right font-mono">{formatBDT(r.baseSalary)}</td>
                    <td className="p-2.5 text-right font-mono text-emerald-700">{formatBDT(r.bonus)}</td>
                    <td className="p-2.5 text-right font-mono text-red-700">{formatBDT(r.deduction)}</td>
                    <td className="p-2.5 text-right font-mono text-amber-700">{formatBDT(r.advance)}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900">{formatBDT(r.netPayable)}</td>
                    <td className="p-2.5 text-right font-mono text-emerald-700 bg-emerald-50/40 font-semibold">
                      {formatBDT(r.amountPaid)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-red-700 bg-red-50/40 font-semibold">{formatBDT(r.due)}</td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          r.status === 'Paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'Partial'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => openPaymentModal(r)}
                        className="text-teal-700 hover:text-teal-900 font-semibold text-[11px] underline"
                      >
                        Record
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold border-t text-xs">
                <tr>
                  <td colSpan={2} className="p-3 text-right uppercase text-[11px] tracking-wider text-slate-300">
                    TOTALS:
                  </td>
                  <td className="p-3 text-right font-mono">{formatBDT(summary.totalBase)}</td>
                  <td className="p-3 text-right font-mono">{formatBDT(summary.totalBonus)}</td>
                  <td className="p-3 text-right font-mono">{formatBDT(summary.totalDeduction)}</td>
                  <td className="p-3 text-right font-mono">{formatBDT(summary.totalAdvance)}</td>
                  <td className="p-3 text-right font-mono">{formatBDT(summary.totalNetPayable)}</td>
                  <td className="p-3 text-right font-mono text-emerald-300">{formatBDT(summary.totalPaid)}</td>
                  <td className="p-3 text-right font-mono text-red-300">{formatBDT(summary.totalDue)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Staff create/edit modal */}
      {staffModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{staffModal === 'create' ? 'Add Staff' : `Edit ${selectedStaff?.full_name}`}</h2>
              <button type="button" onClick={() => setStaffModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleStaffSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  value={staffForm.full_name}
                  onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="text"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Designation</label>
                  <input
                    type="text"
                    value={staffForm.designation}
                    onChange={(e) => setStaffForm({ ...staffForm, designation: e.target.value })}
                    placeholder="e.g. Receptionist"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Monthly Salary (BDT) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={staffForm.monthly_salary}
                    onChange={(e) => setStaffForm({ ...staffForm, monthly_salary: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Joined On</label>
                  <input
                    type="date"
                    value={staffForm.joined_on}
                    onChange={(e) => setStaffForm({ ...staffForm, joined_on: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Linked App Account (optional)</label>
                <select
                  value={staffForm.app_user_id}
                  onChange={(e) => setStaffForm({ ...staffForm, app_user_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">None</option>
                  {appUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">For staff who also log into the app — avoids entering their name twice.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={staffForm.notes}
                  onChange={(e) => setStaffForm({ ...staffForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {staffFormError && <p className="text-sm text-red-600">{staffFormError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setStaffModal(null)} disabled={staffSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={staffSaving}>
                  {staffSaving ? 'Saving…' : staffModal === 'create' ? 'Add Staff' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment record modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Record Payment — {paymentModal.fullName}</h2>
              <button type="button" onClick={() => setPaymentModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-5 space-y-3">
              <p className="text-xs text-slate-500">
                Base salary for {selectedMonth}: <span className="font-bold text-slate-800">{formatBDT(paymentModal.baseSalary)}</span>
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Bonus</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={paymentForm.bonus}
                    onChange={(e) => setPaymentForm({ ...paymentForm, bonus: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Deduction</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={paymentForm.deduction}
                    onChange={(e) => setPaymentForm({ ...paymentForm, deduction: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Advance</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={paymentForm.advance}
                    onChange={(e) => setPaymentForm({ ...paymentForm, advance: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Amount Paid</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={paymentForm.amount_paid}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date || ''}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value || null })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <textarea
                  value={paymentForm.notes || ''}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value || null })}
                  rows={2}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setPaymentModal(null)} disabled={paymentSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={paymentSaving}>
                  {paymentSaving ? 'Saving…' : 'Save Payment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
