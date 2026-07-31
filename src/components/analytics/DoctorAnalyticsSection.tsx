import { useState, useMemo } from 'react'
import { DollarSign, Download, FileSpreadsheet, FileText, UserCheck, Calendar, Activity, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import {
  calculateDoctorMonthlyStats,
  exportDoctorSalaryCSV,
  generateDoctorSalaryPDF,
  type DoctorMonthlySummary,
} from '@/lib/doctorAnalytics'
import type { DoctorProfileData } from '@/lib/doctorProfile'

interface DoctorAnalyticsSectionProps {
  treatments: any[]
  invoices: any[]
  patients: any[]
  doctorProfile: DoctorProfileData | null
}

export function DoctorAnalyticsSection({
  treatments,
  invoices,
  patients,
  doctorProfile,
}: DoctorAnalyticsSectionProps) {
  // Extract list of unique doctors
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

  // Extract list of unique months (YYYY-MM)
  const uniqueMonths = useMemo(() => {
    const set = new Set<string>()
    treatments.forEach((t) => {
      if (t.created_at) {
        set.add(t.created_at.substring(0, 7))
      }
    })
    const sorted = Array.from(set).sort().reverse()
    return sorted
  }, [treatments])

  const [selectedDoctor, setSelectedDoctor] = useState<string>('ALL')
  const [selectedMonth, setSelectedMonth] = useState<string>(
    uniqueMonths[0] || new Date().toISOString().substring(0, 7)
  )
  const [searchFilter, setSearchFilter] = useState('')

  const summary: DoctorMonthlySummary = useMemo(() => {
    return calculateDoctorMonthlyStats(treatments, invoices, patients, selectedDoctor, selectedMonth)
  }, [treatments, invoices, patients, selectedDoctor, selectedMonth])

  const filteredDisplayItems = useMemo(() => {
    if (!searchFilter.trim()) return summary.items
    const q = searchFilter.toLowerCase()
    return summary.items.filter(
      (item) =>
        item.patientName.toLowerCase().includes(q) ||
        item.treatment_type.toLowerCase().includes(q) ||
        (item.patientCode && item.patientCode.toLowerCase().includes(q)) ||
        (item.doctor_name && item.doctor_name.toLowerCase().includes(q))
    )
  }, [summary.items, searchFilter])

  const handleDownloadPDF = () => {
    const doc = generateDoctorSalaryPDF(summary, doctorProfile)
    doc.save(`Doctor_Salary_Statement_${summary.doctorName.replace(/[^a-zA-Z0-9]/g, '_')}_${summary.periodLabel}.pdf`)
  }

  const handleDownloadCSV = () => {
    exportDoctorSalaryCSV(summary)
  }

  return (
    <div className="space-y-6">
      {/* Top Control Bar: Filters & Export Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-teal-600" />
              Doctor Financial Analytics & Salary Statements
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Doctor revenue share percentage calculations, cumulative monthly earnings, and payout exports
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleDownloadCSV} className="text-xs">
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" /> Export CSV
            </Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs" onClick={handleDownloadPDF}>
              <FileText className="w-4 h-4 mr-1.5" /> Download PDF Statement
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
              <UserCheck className="w-3.5 h-3.5 text-teal-600" /> Attending Doctor:
            </label>
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
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Search Patient / Procedure:</label>
            <input
              type="text"
              placeholder="Filter list..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Procedures Count</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{summary.totalProcedures}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.completedProcedures} Completed ({((summary.completedProcedures / (summary.totalProcedures || 1)) * 100).toFixed(0)}%)
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Total Work Billed</span>
            <DollarSign className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{formatBDT(summary.totalBilledCost)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Total treatment value</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Cash Collected</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{formatBDT(summary.totalCollectedCash)}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">
            {summary.totalBilledCost > 0
              ? `${((summary.totalCollectedCash / summary.totalBilledCost) * 100).toFixed(0)}% collected`
              : '0% collected'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-teal-600 to-teal-800 text-white rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between opacity-80 mb-2">
            <span className="text-xs font-semibold">Doctor Earned Salary</span>
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold">{formatBDT(summary.cumulativeCollectedSalary)}</div>
          <div className="text-[11px] opacity-90 mt-1">
            Cash Payout (Billed: {formatBDT(summary.cumulativeBilledSalary)})
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Clinic Net Margin</span>
            <DollarSign className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl font-bold text-teal-800">{formatBDT(summary.clinicNetShare)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Clinic share after doctor payout</div>
        </div>
      </div>

      {/* Itemized Procedure Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
          <h4 className="font-bold text-sm text-slate-800">
            Procedure Breakdown & Salary Attribution ({filteredDisplayItems.length} records)
          </h4>
          <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
            {summary.doctorName} &middot; {summary.periodLabel}
          </span>
        </div>

        {filteredDisplayItems.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-500">
            ✨ No matching treatment records found for the selected period / doctor filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Attending Doctor</th>
                  <th className="p-3">Procedure</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Cost</th>
                  <th className="p-3 text-right">Collected</th>
                  <th className="p-3 text-center">Share %</th>
                  <th className="p-3 text-right">Doctor Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDisplayItems.map((item) => {
                  const collectedShare = item.collectedAmount * (item.doctor_share_pct / 100)
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 whitespace-nowrap font-mono text-[11px]">
                        {item.created_at ? item.created_at.substring(0, 10) : ''}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">
                        {item.patientName}
                        {item.patientCode && (
                          <span className="ml-1 text-[10px] text-slate-500 font-mono">({item.patientCode})</span>
                        )}
                      </td>
                      <td className="p-3 font-medium text-slate-700">
                        👨‍⚕️ {item.doctor_name || 'Unassigned'}
                      </td>
                      <td className="p-3 font-medium text-slate-900">
                        {item.treatment_type}
                        {item.tooth_number && ` (#${item.tooth_number})`}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'In Progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono">{formatBDT(item.cost)}</td>
                      <td className="p-3 text-right font-mono text-emerald-700">{formatBDT(item.collectedAmount)}</td>
                      <td className="p-3 text-center font-bold text-teal-700">{item.doctor_share_pct}%</td>
                      <td className="p-3 text-right font-bold text-teal-800 font-mono">
                        {formatBDT(collectedShare)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t text-slate-900">
                <tr>
                  <td colSpan={5} className="p-3 text-right uppercase text-[11px] text-slate-600">
                    Cumulative Monthly Totals:
                  </td>
                  <td className="p-3 text-right font-mono text-slate-900">{formatBDT(summary.totalBilledCost)}</td>
                  <td className="p-3 text-right font-mono text-emerald-700">{formatBDT(summary.totalCollectedCash)}</td>
                  <td className="p-3 text-center">-</td>
                  <td className="p-3 text-right font-mono text-teal-900 text-sm">
                    {formatBDT(summary.cumulativeCollectedSalary)}
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
