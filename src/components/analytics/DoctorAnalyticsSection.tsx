import { useState, useMemo, useEffect } from 'react'
import {
  DollarSign,
  FileSpreadsheet,
  FileText,
  UserCheck,
  Calendar,
  Activity,
  CheckCircle2,
  TrendingUp,
  Scissors,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import { getAppRole, getAppUser } from '@/lib/appSession'
import {
  calculateDoctorFinancialSummary,
  exportFinancialStatementCSV,
  generateFinancialStatementPDF,
  bulkAssignDefaultDoctor,
  type DoctorFinancialSummary,
} from '@/lib/doctorAnalytics'
import type { DoctorProfileData } from '@/lib/doctorProfile'

// Sentinel for "role is doctor but we haven't resolved which doctor yet"
// (e.g. doctorProfile still loading, or the app_users row has no
// full_name). Must never fall through to 'ALL' — that would show a
// doctor every other doctor's payout and the clinic's total income
// while the UI still claims "My Appointed Work".
const UNRESOLVED = '__UNRESOLVED__'

interface DoctorAnalyticsSectionProps {
  treatments: any[]
  invoices: any[]
  patients: any[]
  payments?: any[]
  labWorks?: any[]
  doctorProfile: DoctorProfileData | null
  /** Called after a successful bulk doctor assignment so the caller can
   * re-fetch treatments — this component only has the snapshot it was
   * given as props, not a way to refresh it itself. */
  onDataChanged?: () => void
}

export function DoctorAnalyticsSection({
  treatments,
  invoices,
  patients,
  payments = [],
  labWorks = [],
  doctorProfile,
  onDataChanged,
}: DoctorAnalyticsSectionProps) {
  const role = getAppRole()
  const isAdmin = role === 'admin'
  const appUser = getAppUser()
  const isDoctorOnly = role === 'doctor'

  // Determine current doctor identity if role is 'doctor'
  const currentDoctorName = useMemo(() => {
    if (appUser?.name) return appUser.name
    if (doctorProfile?.full_name) return doctorProfile.full_name
    return ''
  }, [appUser, doctorProfile])

  // Unique doctors list
  const uniqueDoctors = useMemo(() => {
    const set = new Set<string>()
    if (doctorProfile?.full_name) set.add(doctorProfile.full_name)
    treatments.forEach((t) => {
      if (t.doctor_name && t.doctor_name.trim()) {
        set.add(t.doctor_name.trim())
      }
    })
    return Array.from(set)
  }, [treatments, doctorProfile])

  // Unique months list — union of every date Work Done or Collections can
  // bucket by, so a month with only a payment (no treatment activity) or
  // only treatment activity (no payment yet) still appears in the picker.
  const uniqueMonths = useMemo(() => {
    const set = new Set<string>()
    treatments.forEach((t) => {
      const bucket = t.completed_at || t.created_at
      if (bucket) set.add(String(bucket).substring(0, 7))
    })
    payments.forEach((p) => {
      const bucket = p.payment_date || p.created_at
      if (bucket) set.add(String(bucket).substring(0, 7))
    })
    return Array.from(set).sort().reverse()
  }, [treatments, payments])

  const [selectedDoctor, setSelectedDoctor] = useState<string>(
    isDoctorOnly ? (currentDoctorName || UNRESOLVED) : 'ALL'
  )
  const [selectedMonth, setSelectedMonth] = useState<string>(
    uniqueMonths[0] || new Date().toISOString().substring(0, 7)
  )
  const [searchFilter, setSearchFilter] = useState('')

  useEffect(() => {
    if (isDoctorOnly) {
      setSelectedDoctor(currentDoctorName || UNRESOLVED)
    }
  }, [isDoctorOnly, currentDoctorName])

  const identityUnresolved = isDoctorOnly && selectedDoctor === UNRESOLVED

  const summary: DoctorFinancialSummary = useMemo(() => {
    const doctorArg = identityUnresolved ? UNRESOLVED : selectedDoctor
    return calculateDoctorFinancialSummary(treatments, invoices, patients, labWorks, payments, doctorArg, selectedMonth)
  }, [treatments, invoices, patients, labWorks, payments, selectedDoctor, selectedMonth, identityUnresolved])

  const filteredWorkRows = useMemo(() => {
    if (!searchFilter.trim()) return summary.workRows
    const q = searchFilter.toLowerCase()
    return summary.workRows.filter(
      (r) =>
        r.patientName.toLowerCase().includes(q) ||
        r.sourceOfIncome.toLowerCase().includes(q) ||
        (r.patientCode && r.patientCode.toLowerCase().includes(q)) ||
        r.refBy.toLowerCase().includes(q)
    )
  }, [summary.workRows, searchFilter])

  const filteredCollectionRows = useMemo(() => {
    if (!searchFilter.trim()) return summary.collectionRows
    const q = searchFilter.toLowerCase()
    return summary.collectionRows.filter(
      (r) =>
        r.patientName.toLowerCase().includes(q) ||
        (r.patientCode && r.patientCode.toLowerCase().includes(q)) ||
        r.refBy.toLowerCase().includes(q)
    )
  }, [summary.collectionRows, searchFilter])

  const handleDownloadPDF = () => {
    const doc = generateFinancialStatementPDF(summary, doctorProfile)
    doc.save(`Financial_Statement_${summary.doctorName.replace(/[^a-zA-Z0-9]/g, '_')}_${summary.periodLabel}.pdf`)
  }

  // Bulk-fix for the most common Needs Attention cause: historical
  // treatments with no doctor_name at all. Counted across ALL treatments
  // (not just the current period/doctor filter) since the fix should
  // clear every blank, not just the ones currently in view.
  const blankDoctorCount = useMemo(() => treatments.filter((t) => !(t.doctor_name || '').trim()).length, [treatments])
  const [bulkDoctorChoice, setBulkDoctorChoice] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)

  async function handleBulkAssign() {
    if (!bulkDoctorChoice) return
    const ok = confirm(
      `Assign "${bulkDoctorChoice}" as the doctor for ${blankDoctorCount} treatment(s) that currently have no doctor set?\n\n` +
        `Each one is individually revertible afterward via its edit history, but there is no single bulk undo for this action.`
    )
    if (!ok) return
    setBulkAssigning(true)
    try {
      const { updatedCount } = await bulkAssignDefaultDoctor(treatments, patients, bulkDoctorChoice)
      alert(`Assigned ${updatedCount} treatment(s) to ${bulkDoctorChoice}.`)
      setBulkDoctorChoice('')
      onDataChanged?.()
    } catch (err) {
      console.error('Bulk doctor assignment failed:', err)
      alert('Failed to bulk-assign a doctor. Please try again.')
    } finally {
      setBulkAssigning(false)
    }
  }

  const handleDownloadCSV = () => {
    exportFinancialStatementCSV(summary)
  }

  // Fail closed, not open: if we can't pin down which doctor this session
  // belongs to (doctorProfile still loading, or the app_users row has no
  // full_name), never fall through to showing every doctor's payout and
  // the clinic's total income. Show nothing until identity resolves.
  if (identityUnresolved) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-8 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <h3 className="font-display font-bold text-base text-slate-900">
          Could not determine which doctor you are
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Your account isn't linked to a doctor name yet, so financial statements
          can't be scoped safely to your work. Contact the admin to set your full
          name in Doctor Profile or your staff account.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Bar Filters & Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-teal-600" />
              Doctor Financial Analytics & Statement
              {isDoctorOnly && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  <Lock className="w-3 h-3 text-teal-600" /> My Appointed Work
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isDoctorOnly
                ? `Showing financial performance and statement for ${currentDoctorName || 'your appointed treatments'}`
                : 'Work performed and payments collected, kept as two separate logs — payout is calculated from real payments only.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleDownloadCSV} className="text-xs">
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" /> Export Excel CSV
            </Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs" onClick={handleDownloadPDF}>
              <FileText className="w-4 h-4 mr-1.5" /> PDF Financial Statement
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-teal-600" /> Period / Month:
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
            >
              <option value="ALL">📅 All Time (Cumulative)</option>
              {uniqueMonths.map((m) => (
                <option key={m} value={m}>
                  📆 {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-teal-600" /> Ref By / Attending Doctor:
            </label>
            {isDoctorOnly ? (
              <div className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-bold text-teal-800 bg-slate-100 flex items-center justify-between">
                <span>👨‍⚕️ {currentDoctorName || 'My Appointed Work'}</span>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              </div>
            ) : (
              <select
                value={selectedDoctor}
                onChange={(e) => setSelectedDoctor(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50"
              >
                <option value="ALL">👨‍⚕️ All Doctors</option>
                {uniqueDoctors.map((doc) => (
                  <option key={doc} value={doc}>
                    👨‍⚕️ {doc}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Filter List:</label>
            <input
              type="text"
              placeholder="Search patient, procedure, note..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Top Financial Summary KPI Block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Work Done</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{formatBDT(summary.totalWorkDone)}</div>
          <div className="text-[11px] text-slate-500 mt-1">{summary.workRowCount} Treatment Entries</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Collected</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{formatBDT(summary.totalPaid)}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">{summary.collectionRowCount} real payments</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Clinic Cost (TxC)</span>
            <Scissors className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-700">{formatBDT(summary.totalTxC)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Lab work & direct expenses</div>
        </div>

        <div className="bg-gradient-to-br from-teal-600 to-teal-800 text-white rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between opacity-80 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Dr. Income</span>
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold">{formatBDT(summary.totalDrIncome)}</div>
          <div className="text-[11px] opacity-90 mt-1">From real payments collected</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Clinic Income</span>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl font-bold text-teal-800">{formatBDT(summary.totalClinicIncome)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Clinic Net Share after payout</div>
        </div>
      </div>

      {/* Needs Attention */}
      {summary.flaggedRows.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-amber-200 bg-amber-100/60 flex items-center justify-between flex-wrap gap-2">
            <h4 className="font-bold text-sm text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Needs Attention ({summary.flaggedRows.length}) — not included in any total above
            </h4>
            <span className="text-xs font-semibold text-amber-800 bg-amber-200/60 px-2.5 py-1 rounded-full">
              {formatBDT(summary.flaggedTotal)}
            </span>
          </div>

          {isAdmin && blankDoctorCount > 0 && (
            <div className="p-3 border-b border-amber-200 bg-amber-50 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-amber-900">
                {blankDoctorCount} treatment(s) across all time have no doctor set. Assign a default:
              </span>
              <select
                value={bulkDoctorChoice}
                onChange={(e) => setBulkDoctorChoice(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-amber-300 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="">Select doctor...</option>
                {uniqueDoctors.map((doc) => (
                  <option key={doc} value={doc}>
                    {doc}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
                disabled={!bulkDoctorChoice || bulkAssigning}
                onClick={handleBulkAssign}
              >
                {bulkAssigning ? 'Assigning...' : `Assign to all ${blankDoctorCount}`}
              </Button>
            </div>
          )}

          <div className="overflow-auto max-h-[30vh]">
            <table className="w-full text-xs text-left text-amber-900">
              <thead className="bg-amber-200/50 font-bold border-b border-amber-200 sticky top-0">
                <tr>
                  <th className="p-2.5 whitespace-nowrap">Date</th>
                  <th className="p-2.5">Patient Name</th>
                  <th className="p-2.5 text-right">Amount</th>
                  <th className="p-2.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/60">
                {summary.flaggedRows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2.5 whitespace-nowrap font-mono text-[11px]">{r.date || '—'}</td>
                    <td className="p-2.5 font-semibold whitespace-nowrap">{r.patientName}</td>
                    <td className="p-2.5 text-right font-mono font-semibold">{formatBDT(r.amount)}</td>
                    <td className="p-2.5">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Work Done */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            Work Done ({filteredWorkRows.length} records)
          </h4>
          <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
            Ref By: {summary.doctorName} &middot; {summary.periodLabel}
          </span>
        </div>

        {filteredWorkRows.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">✨ No matching treatment records found.</div>
        ) : (
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-800 text-white font-bold border-b sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 whitespace-nowrap">Date</th>
                  <th className="p-2.5">Patient Name</th>
                  <th className="p-2.5">Ref By</th>
                  <th className="p-2.5">Source Of Income</th>
                  <th className="p-2.5 text-right">Amount</th>
                  <th className="p-2.5">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWorkRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 whitespace-nowrap font-mono text-[11px] text-slate-600">{r.date}</td>
                    <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">
                      {r.patientName}
                      {r.patientCode && (
                        <span className="ml-1 text-[10px] text-slate-400 font-mono font-normal">({r.patientCode})</span>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-700 whitespace-nowrap">{r.refBy}</td>
                    <td className="p-2.5 font-medium text-slate-900">{r.sourceOfIncome}</td>
                    <td className="p-2.5 text-right font-mono font-semibold">{formatBDT(r.amount)}</td>
                    <td className="p-2.5 text-slate-500 italic max-w-[160px] truncate">{r.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold border-t text-xs">
                <tr>
                  <td colSpan={4} className="p-3 text-right uppercase text-[11px] tracking-wider text-slate-300">
                    TOTAL WORK DONE:
                  </td>
                  <td className="p-3 text-right font-mono text-white">{formatBDT(summary.totalWorkDone)}</td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Collections */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-teal-600" />
            Collections ({filteredCollectionRows.length} payments)
          </h4>
          <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
            Ref By: {summary.doctorName} &middot; {summary.periodLabel}
          </span>
        </div>

        {filteredCollectionRows.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">✨ No matching payment records found.</div>
        ) : (
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-800 text-white font-bold border-b sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 whitespace-nowrap">Date</th>
                  <th className="p-2.5">Patient Name</th>
                  <th className="p-2.5">Ref By</th>
                  <th className="p-2.5 text-right bg-slate-700">Total Paid</th>
                  <th className="p-2.5 text-right">TxC</th>
                  <th className="p-2.5 text-right font-bold text-amber-300">Net A</th>
                  <th className="p-2.5 text-center">%</th>
                  <th className="p-2.5 text-right bg-teal-900 text-teal-200">Clinic Income</th>
                  <th className="p-2.5 text-right bg-teal-950 text-emerald-300 font-bold">Dr. Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCollectionRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 whitespace-nowrap font-mono text-[11px] text-slate-600">{r.date}</td>
                    <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">
                      {r.patientName}
                      {r.patientCode && (
                        <span className="ml-1 text-[10px] text-slate-400 font-mono font-normal">({r.patientCode})</span>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-700 whitespace-nowrap">{r.refBy}</td>
                    <td className="p-2.5 text-right font-mono text-emerald-700 bg-emerald-50/40 font-semibold">
                      {formatBDT(r.totalPaid)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-amber-700">{formatBDT(r.txC)}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900">{formatBDT(r.netA)}</td>
                    <td className="p-2.5 text-center font-bold text-teal-700">{r.doctorSharePct}%</td>
                    <td className="p-2.5 text-right font-mono font-semibold text-teal-900 bg-teal-50/50">
                      {formatBDT(r.clinicIncome)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-emerald-800 bg-emerald-100/60 text-sm">
                      {formatBDT(r.drIncome)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold border-t text-xs">
                <tr>
                  <td colSpan={3} className="p-3 text-right uppercase text-[11px] tracking-wider text-slate-300">
                    STATEMENT TOTALS:
                  </td>
                  <td className="p-3 text-right font-mono text-emerald-300 bg-slate-800">{formatBDT(summary.totalPaid)}</td>
                  <td className="p-3 text-right font-mono text-amber-300">{formatBDT(summary.totalTxC)}</td>
                  <td className="p-3 text-right font-mono text-white">{formatBDT(summary.totalNetA)}</td>
                  <td className="p-3 text-center">-</td>
                  <td className="p-3 text-right font-mono text-teal-200 bg-slate-800">{formatBDT(summary.totalClinicIncome)}</td>
                  <td className="p-3 text-right font-mono text-emerald-300 bg-teal-950 text-sm">
                    {formatBDT(summary.totalDrIncome)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
