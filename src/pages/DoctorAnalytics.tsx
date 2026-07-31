import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getAppRole } from '@/lib/appSession'
import { RefreshCw, UserCheck } from 'lucide-react'
import { DoctorAnalyticsSection } from '@/components/analytics/DoctorAnalyticsSection'
import { loadDoctorProfile, type DoctorProfileData } from '@/lib/doctorProfile'

const PAGE_SIZE = 1000

async function fetchAllRowsSafe<T>(table: string, filter?: (q: any) => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1)
    if (filter) query = filter(query)
    const { data, error } = await query
    if (error) {
      console.warn(`Error fetching ${table}:`, error)
      break
    }
    const page = (data as T[]) || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

export function DoctorAnalytics() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [treatments, setTreatments] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (getAppRole() === 'admin') {
      loadData()
      loadDoctorProfile().then(setDoctorProfile, () => {})
    }
  }, [])

  async function loadData(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setLoadError(null)

      const [invoiceRows, treatmentRows, patientRows, paymentRows] = await Promise.all([
        fetchAllRowsSafe<any>('invoices', (q) => q.neq('status', 'Merged')),
        fetchAllRowsSafe<any>('treatments'),
        fetchAllRowsSafe<any>('patients'),
        fetchAllRowsSafe<any>('payments'),
      ])

      setInvoices(invoiceRows)
      setTreatments(treatmentRows)
      setPatients(patientRows)
      setPayments(paymentRows)
    } catch (error) {
      console.error('Error loading doctor analytics:', error)
      setLoadError('Could not load doctor financial data. Check your connection.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  if (getAppRole() !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  if (loading) {
    return (
      <div className="space-y-6 page-fade-in">
        <div>
          <div className="skeleton h-8 w-64 mb-2" />
          <div className="skeleton h-4 w-80" />
        </div>
        <div className="bg-card rounded-xl border border-gray-200/80 p-8 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading Doctor Financial Analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-teal-600" /> Doctor Analytics & Payouts
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Doctor work tracking, revenue share percentage calculations, and monthly salary statements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 text-teal-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-3 font-medium">
          {loadError}
        </div>
      )}

      <DoctorAnalyticsSection
        treatments={treatments}
        invoices={invoices}
        patients={patients}
        doctorProfile={doctorProfile}
      />
    </div>
  )
}
