import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getAppRole } from '@/lib/appSession'
import { formatBDT } from '@/lib/utils'
import { RefreshCw, TrendingUp, DollarSign, UserPlus, CheckCircle2 } from 'lucide-react'
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
    if (getAppRole() === 'admin') loadAnalytics()
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
    <div className="space-y-6 page-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Clinic Analytics</h1>
          <p className="text-text-secondary mt-1">Revenue, patient, and treatment trends.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-card p-0.5" role="group" aria-label="Time range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setRange(option.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  range === option.value
                    ? 'bg-primary text-white shadow-elevation-low'
                    : 'text-text-secondary hover:text-primary hover:bg-primary/5'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => loadAnalytics(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
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
