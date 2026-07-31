import { useEffect, useState } from 'react'
import { Printer, X, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBDT, safeFormat } from '@/lib/utils'
import { loadDoctorProfile, type DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource } from '@/lib/logoImage'
import { exportClinicAnalyticsCSV, generateClinicAnalyticsPDF, type AnalyticsInvoice, type AnalyticsPatient, type MonthlyRevenueRow, type TopRevenueSourceRow, type ProcedureCountRow } from '@/lib/analytics'

interface ClinicAnalyticsReportPrintModalProps {
  invoices: AnalyticsInvoice[]
  patients: AnalyticsPatient[]
  monthly: MonthlyRevenueRow[]
  topSources: TopRevenueSourceRow[]
  counts: ProcedureCountRow[]
  rangeLabel: string
  onClose: () => void
}

export function ClinicAnalyticsReportPrintModal({
  invoices,
  patients,
  monthly,
  topSources,
  counts,
  rangeLabel,
  onClose,
}: ClinicAnalyticsReportPrintModalProps) {
  const [doctor, setDoctor] = useState<DoctorProfileData | null>(null)

  useEffect(() => {
    loadDoctorProfile().then(setDoctor)
  }, [])

  const patientMap = new Map<string, string>()
  patients.forEach((p) => {
    patientMap.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient')
  })

  let totalBilled = 0
  let totalPaid = 0
  invoices.forEach((inv) => {
    totalBilled += inv.total_amount || 0
    totalPaid += inv.paid_amount || 0
  })
  const totalDue = Math.max(0, totalBilled - totalPaid)
  const logoSrc = cleanLogoSource(doctor?.logo_url)

  function handlePrint() {
    window.print()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto p-4 sm:p-6 flex flex-col items-center analytics-report-modal-backdrop">
      {/* Top Floating Control Bar (Hidden on Print) */}
      <div className="w-full max-w-4xl bg-slate-900 text-white rounded-xl p-4 mb-4 flex items-center justify-between gap-4 shadow-xl no-print">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-teal-400" />
          <div>
            <h3 className="font-bold text-sm">Clinic Revenue Statement & Invoice Ledger</h3>
            <p className="text-xs text-slate-400">{invoices.length} Invoices · Filter: {rangeLabel.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportClinicAnalyticsCSV(invoices, patients, rangeLabel)}
            className="text-xs text-slate-200 border-slate-700 hover:bg-slate-800"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1 text-emerald-400" /> Export CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateClinicAnalyticsPDF(invoices, patients, monthly, topSources, counts, rangeLabel)}
            className="text-xs text-slate-200 border-slate-700 hover:bg-slate-800"
          >
            <FileText className="w-4 h-4 mr-1 text-teal-400" /> Download PDF
          </Button>
          <Button size="sm" onClick={handlePrint} className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
            <Printer className="w-4 h-4 mr-1" /> Print Report
          </Button>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Sheet View */}
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl p-8 sm:p-10 text-slate-900 analytics-report-print-overlay">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6 gap-4">
          <div>
            <h1 className="font-bold text-xl text-slate-900">{doctor?.clinic_name || 'ClinicMx Dental Care'}</h1>
            <p className="text-xs text-slate-500">{doctor?.full_name || 'Dental Clinic Management System'}</p>
            <p className="text-xs text-slate-500">{doctor?.address || ''} {doctor?.phone ? `· ${doctor.phone}` : ''}</p>
          </div>
          <div className="text-right">
            <h2 className="font-bold text-sm text-teal-700 tracking-wider uppercase">Revenue & Invoice Statement</h2>
            <p className="text-xs text-slate-500 mt-1">Period: <span className="font-semibold text-slate-800">{rangeLabel.toUpperCase()}</span></p>
            <p className="text-xs text-slate-500">Date: {safeFormat(new Date().toISOString(), 'dd MMM yyyy')}</p>
          </div>
        </div>

        {/* Top Summary Block */}
        <div className="grid grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-center">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Total Billed</p>
            <p className="text-base font-bold text-slate-900 mt-0.5">{formatBDT(totalBilled)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Total Collected</p>
            <p className="text-base font-bold text-emerald-700 mt-0.5">{formatBDT(totalPaid)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Outstanding Due</p>
            <p className="text-base font-bold text-amber-700 mt-0.5">{formatBDT(totalDue)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Collection Rate</p>
            <p className="text-base font-bold text-teal-700 mt-0.5">
              {totalBilled > 0 ? `${Math.round((totalPaid / totalBilled) * 100)}%` : '100%'}
            </p>
          </div>
        </div>

        {/* Top Revenue Sources Table */}
        {topSources && topSources.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-xs uppercase text-slate-700 tracking-wider mb-3">Top Revenue Sources (Patients)</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
                  <th className="py-2 px-2.5 font-bold">#</th>
                  <th className="py-2 px-2.5 font-bold">Patient Name</th>
                  <th className="py-2 px-2.5 font-bold text-right">Invoices</th>
                  <th className="py-2 px-2.5 font-bold text-right">Total Billed</th>
                  <th className="py-2 px-2.5 font-bold text-right">Total Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {topSources.slice(0, 10).map((pt, idx) => (
                  <tr key={pt.patientId || idx} className="hover:bg-slate-50">
                    <td className="py-2 px-2.5 text-slate-500 font-mono">{idx + 1}</td>
                    <td className="py-2 px-2.5 font-semibold text-slate-800">{pt.name}</td>
                    <td className="py-2 px-2.5 text-right text-slate-600">{pt.invoiceCount}</td>
                    <td className="py-2 px-2.5 text-right font-medium text-slate-900">{formatBDT(pt.totalBilled || 0)}</td>
                    <td className="py-2 px-2.5 text-right font-medium text-emerald-700">{formatBDT(pt.totalPaid || pt.collected || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Invoice Itemized Table */}
        <div className="mb-6">
          <h3 className="font-bold text-xs uppercase text-slate-700 tracking-wider mb-3">Itemized Invoices ({invoices.length})</h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
                <th className="py-2 px-2.5 font-bold">Date</th>
                <th className="py-2 px-2.5 font-bold">Patient Name</th>
                <th className="py-2 px-2.5 font-bold">Invoice Ref</th>
                <th className="py-2 px-2.5 font-bold text-right">Billed</th>
                <th className="py-2 px-2.5 font-bold text-right">Paid</th>
                <th className="py-2 px-2.5 font-bold text-right">Due</th>
                <th className="py-2 px-2.5 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoices.map((inv) => {
                const dateStr = inv.created_at ? safeFormat(inv.created_at, 'dd MMM yyyy') : '-'
                const ptName = inv.patient_id ? patientMap.get(inv.patient_id) || 'Patient' : 'Patient'
                const billed = inv.total_amount || 0
                const paid = inv.paid_amount || 0
                const due = Math.max(0, billed - paid)
                const status = inv.status || (due <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid')
                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-2 px-2.5 text-slate-600">{dateStr}</td>
                    <td className="py-2 px-2.5 font-semibold text-slate-800">{ptName}</td>
                    <td className="py-2 px-2.5 font-mono text-[11px] text-slate-500">#{inv.id.slice(0, 8).toUpperCase()}</td>
                    <td className="py-2 px-2.5 text-right font-medium text-slate-900">{formatBDT(billed)}</td>
                    <td className="py-2 px-2.5 text-right font-medium text-emerald-700">{formatBDT(paid)}</td>
                    <td className="py-2 px-2.5 text-right font-medium text-amber-700">{formatBDT(due)}</td>
                    <td className="py-2 px-2.5 text-center">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : status === 'Partial' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-bold bg-slate-50 text-slate-900">
                <td colSpan={3} className="py-2.5 px-2.5">TOTALS</td>
                <td className="py-2.5 px-2.5 text-right text-slate-900">{formatBDT(totalBilled)}</td>
                <td className="py-2.5 px-2.5 text-right text-emerald-700">{formatBDT(totalPaid)}</td>
                <td className="py-2.5 px-2.5 text-right text-amber-700">{formatBDT(totalDue)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer info */}
        <div className="pt-6 border-t border-slate-200 text-[11px] text-slate-400 flex justify-between items-center">
          <p>ClinicMx Dental Management System · Official Financial Statement</p>
          <p>Page 1 of 1</p>
        </div>
      </div>
    </div>
  )
}
