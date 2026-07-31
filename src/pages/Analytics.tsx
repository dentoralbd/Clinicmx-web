import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getAppRole } from '@/lib/appSession'
import { formatBDT } from '@/lib/utils'
import { RefreshCw, TrendingUp, DollarSign, UserPlus, CheckCircle2, FileSpreadsheet, Printer, FileText } from 'lucide-react'
import {
  buildMonthAxis,
  filterByRange,
  monthlyRevenue,
  newPatientsPerMonth,
  procedureCountsByType,
  avgCostByType,
  returningVsNewByMonth,
  revenueByTreatmentType,
  revenueSummary,
  topRevenueSources,
  treatmentConversion,
  exportClinicAnalyticsCSV,
  generateClinicAnalyticsPDF,
  type AnalyticsAppointment,
  type AnalyticsInvoice,
  type AnalyticsPatient,
  type AnalyticsPayment,
  type AnalyticsRange,
  type AnalyticsTreatment,
} from '@/lib/analytics'
import { RevenueCalendar } from '@/components/analytics/RevenueCalendar'
import { RevenueSection } from '@/components/analytics/RevenueSection'
import { PatientSection } from '@/components/analytics/PatientSection'
import { TreatmentMixSection } from '@/components/analytics/TreatmentMixSection'

const PAGE_SIZE = 1000

/** Reads all rows of a select in 1000-row pages (Supabase caps a single select at 1000). */
async function fetchAllRows<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1)
    if (filter) query = filter(query)
    const { data, error } = await query
    if (error) throw error
    const page = (data as T[]) || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' },
  { value: 'all', label: 'All' },
]

export function Analytics() {
  const [invoices, setInvoices] = useState<AnalyticsInvoice[]>([])
  const [treatments, setTreatments] = useState<AnalyticsTreatment[]>([])
  const [patients, setPatients] = useState<AnalyticsPatient[]>([])
  const [appointments, setAppointments] = useState<AnalyticsAppointment[]>([])
  const [payments, setPayments] = useState<AnalyticsPayment[]>([])
  const [range, setRange] = useState<AnalyticsRange>('12m')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    // Non-admins are redirected below; skip the data load entirely for them.
    if (getAppRole() === 'admin') {
      loadAnalytics()
    }
  }, [])

  async function loadAnalytics(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setLoadError(null)

      const [invoiceRows, treatmentRows, patientRows, appointmentRows, paymentRows] = await Promise.all([
        fetchAllRows<AnalyticsInvoice>(
          'invoices',
          'id, patient_id, items, total_amount, paid_amount, status, created_at',
          (q) => q.neq('status', 'Merged')
        ),
        fetchAllRows<AnalyticsTreatment>('treatments', 'id, treatment_type, status, cost, created_at'),
        fetchAllRows<AnalyticsPatient>('patients', 'id, first_name, last_name, created_at, patient_type'),
        fetchAllRows<AnalyticsAppointment>('appointments', 'patient_id, date_time, status'),
        fetchAllRows<AnalyticsPayment>('payments', 'invoice_id, amount, payment_date'),
      ])

      setInvoices(invoiceRows)
      setTreatments(treatmentRows)
      setPatients(patientRows)
      setAppointments(appointmentRows)
      setPayments(paymentRows)
    } catch (error) {
      console.error('Error loading analytics:', error)
      setLoadError('Could not load analytics data. Check your connection and try refreshing.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // `patients` includes consultation-only walk-ins so revenue attribution
  // (Top Revenue Sources, the Daily Earnings breakdown) can still resolve
  // their name instead of showing "Unknown Patient". New-patient counts are
  // the one place that should exclude them until they convert.
  const fullPatients = useMemo(() => patients.filter((p) => p.patient_type !== 'consultation'), [patients])

  const rangeInvoices = useMemo(() => filterByRange(invoices, (inv) => inv.created_at, range), [invoices, range])
  const rangeTreatments = useMemo(() => filterByRange(treatments, (t) => t.created_at, range), [treatments, range])
  const rangePatients = useMemo(() => filterByRange(fullPatients, (p) => p.created_at, range), [fullPatients, range])

  const monthAxis = useMemo(
    () =>
      buildMonthAxis(range, [
        ...invoices.map((inv) => inv.created_at),
        ...patients.map((p) => p.created_at),
        ...appointments.map((a) => a.date_time || ''),
      ]),
    [range, invoices, patients, appointments]
  )

  const summary = useMemo(() => revenueSummary(rangeInvoices), [rangeInvoices])
  const monthly = useMemo(() => monthlyRevenue(rangeInvoices, monthAxis), [rangeInvoices, monthAxis])
  // All treatments (not range-filtered) so items linking to older treatments still resolve a type.
  const byType = useMemo(() => revenueByTreatmentType(rangeInvoices, treatments), [rangeInvoices, treatments])
  const topSources = useMemo(() => topRevenueSources(rangeInvoices, patients), [rangeInvoices, patients])
  const newPerMonth = useMemo(() => newPatientsPerMonth(fullPatients, monthAxis), [fullPatients, monthAxis])
  // Full appointment history: first-ever visits must be computed across all time.
  const returningVsNew = useMemo(() => returningVsNewByMonth(appointments, monthAxis), [appointments, monthAxis])
  const counts = useMemo(() => procedureCountsByType(rangeTreatments), [rangeTreatments])
  const avgCosts = useMemo(() => avgCostByType(rangeTreatments), [rangeTreatments])
  const conversion = useMemo(() => treatmentConversion(rangeTreatments), [rangeTreatments])

  if (getAppRole() !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  if (loading) {
    return (
      <div className="space-y-6 page-fade-in">
        <div>
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl shadow-elevation-low border border-gray-200/80 p-6">
              <div className="skeleton h-4 w-32 mb-3" />
              <div className="skeleton h-8 w-20" />
            </div>
          ))}
        </div>
        <div className="bg-card rounded-xl shadow-elevation-low border border-gray-200/80 p-6">
          <div className="skeleton h-4 w-40 mb-4" />
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Clinic Analytics</h1>
          <p className="text-text-secondary text-sm mt-1">Revenue, patient, and treatment trends.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setRange(option.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                  range === option.value
                    ? 'bg-primary text-white shadow-elevation-low'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportClinicAnalyticsCSV(rangeInvoices, patients, range)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
            title="Export Invoices & Revenue CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => generateClinicAnalyticsPDF(rangeInvoices, patients, monthly, topSources, counts, range)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
            title="Download PDF Financial Report"
          >
            <FileText className="w-4 h-4 text-teal-600" />
            <span className="hidden sm:inline">PDF Report</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
            title="Print Analytics Page"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Print Page</span>
          </button>
          <button
            onClick={() => loadAnalytics(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{loadError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard
          title="Total Collected"
          value={formatBDT(summary.totalCollected)}
          icon={<TrendingUp className="w-6 h-6" />}
          color="green"
        />
        <SummaryCard
          title="Outstanding"
          value={formatBDT(summary.totalOutstanding)}
          icon={<DollarSign className="w-6 h-6" />}
          color="orange"
        />
        <SummaryCard
          title="New Patients"
          value={rangePatients.length.toString()}
          icon={<UserPlus className="w-6 h-6" />}
          color="blue"
        />
        <SummaryCard
          title="Completion Rate"
          value={
            conversion.planned + conversion.inProgress + conversion.completed > 0
              ? `${Math.round(conversion.completionRate * 100)}%`
              : '—'
          }
          icon={<CheckCircle2 className="w-6 h-6" />}
          color="purple"
        />
      </div>

      <RevenueCalendar payments={payments} invoices={invoices} patients={patients} />
      <RevenueSection monthly={monthly} byType={byType} topSources={topSources} />
      <PatientSection newPerMonth={newPerMonth} returningVsNew={returningVsNew} />
      <TreatmentMixSection counts={counts} avgCosts={avgCosts} conversion={conversion} />
    </div>
  )
}

function SummaryCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: 'blue' | 'green' | 'orange' | 'purple' }) {
  const chips: Record<string, string> = {
    blue: 'bg-gradient-to-br from-blue-500/10 to-blue-500/20 text-blue-600',
    green: 'bg-gradient-to-br from-green-500/10 to-green-500/20 text-green-600',
    orange: 'bg-gradient-to-br from-orange-500/10 to-orange-500/20 text-orange-600',
    purple: 'bg-gradient-to-br from-purple-500/10 to-purple-500/20 text-purple-600',
  }
  return (
    <div className="bg-card rounded-xl shadow-elevation-low border border-gray-200/80 p-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{title}</p>
          <p className="text-2xl font-bold tracking-tight mt-1.5 truncate">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl ${chips[color]} flex items-center justify-center shadow-elevation-low flex-shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
