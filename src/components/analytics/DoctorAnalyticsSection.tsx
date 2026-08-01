import { useState, useMemo, useEffect } from 'react'
import { DollarSign, FileSpreadsheet, FileText, UserCheck, Calendar, Activity, CheckCircle2, TrendingUp, Scissors, Lock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import { getAppRole, getAppUser } from '@/lib/appSession'
import {
  calculateDoctorFinancialSummary,
  exportFinancialStatementCSV,
  generateFinancialStatementPDF,
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
  labWorks?: any[]
  doctorProfile: DoctorProfileData | null
}

export function DoctorAnalyticsSection({
  treatments,
  invoices,
  patients,
  labWorks = [],
  doctorProfile,
}: DoctorAnalyticsSectionProps) {
  const role = getAppRole()
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

  // Unique months list
  const uniqueMonths = useMemo(() => {
    const set = new Set<string>()
    treatments.forEach((t) => {
      if (t.created_at) {
        set.add(t.created_at.substring(0, 7))
      }
    })
    return Array.from(set).sort().reverse()
  }, [treatments])

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
    if (identityUnresolved) {
      return calculateDoctorFinancialSummary(treatments, invoices, patients, labWorks, UNRESOLVED, selectedMonth)
    }
    return calculateDoctorFinancialSummary(treatments, invoices, patients, labWorks, selectedDoctor, selectedMonth)
  }, [treatments, invoices, patients, labWorks, selectedDoctor, selectedMonth, identityUnresolved])

  const filteredDisplayItems = useMemo(() => {
    if (!searchFilter.trim()) return summary.items
    const q = searchFilter.toLowerCase()
    return summary.items.filter(
      (item) =>
        item.patientName.toLowerCase().includes(q) ||
        item.sourceOfIncome.toLowerCase().includes(q) ||
        (item.patientCode && item.patientCode.toLowerCase().includes(q)) ||
        item.refBy.toLowerCase().includes(q)
    )
  }, [summary.items, searchFilter])

  const handleDownloadPDF = () => {
    const doc = generateFinancialStatementPDF(summary, doctorProfile)
    doc.save(`Financial_Statement_${summary.doctorName.replace(/[^a-zA-Z0-9]/g, '_')}_${summary.periodLabel}.pdf`)
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
                : 'Comprehensive doctor workflow, payment collection, treatment cost (TxC) deductions & net income splits'}
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
            <span className="text-xs font-bold uppercase tracking-wider">Total Workflow</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{formatBDT(summary.totalWorkflow)}</div>
          <div className="text-[11px] text-slate-500 mt-1">{summary.rowCount} Treatment Entries</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Paid</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{formatBDT(summary.totalPaid)}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">Cash collected from patients</div>
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
          <div className="text-[11px] opacity-90 mt-1">Cumulative Doctor Share</div>
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

      {/* Main Financial Statement Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-teal-600" />
            Financial Statement Log ({filteredDisplayItems.length} records)
          </h4>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
              Ref By: {summary.doctorName} &middot; {summary.periodLabel}
            </span>
          </div>
        </div>

        {filteredDisplayItems.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">
            ✨ No matching financial statement records found.
          </div>
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
                  <th className="p-2.5 text-right bg-slate-700">Total Paid</th>
                  <th className="p-2.5 text-right">TxC</th>
                  <th className="p-2.5 text-right font-bold text-amber-300">Net A</th>
                  <th className="p-2.5 text-center">%</th>
                  <th className="p-2.5 text-right bg-teal-900 text-teal-200">Clinic Income</th>
                  <th className="p-2.5 text-right bg-teal-950 text-emerald-300 font-bold">Dr. Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDisplayItems.map((r) => (
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
                    <td className="p-2.5 text-slate-500 italic max-w-[120px] truncate">{r.note || '-'}</td>
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
                  <td colSpan={4} className="p-3 text-right uppercase text-[11px] tracking-wider text-slate-300">
                    STATEMENT TOTALS:
                  </td>
                  <td className="p-3 text-right font-mono text-white">{formatBDT(summary.totalWorkflow)}</td>
                  <td className="p-3"></td>
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
