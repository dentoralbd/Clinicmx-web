import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

export interface DashboardData {
  stats: {
    totalPatients: number
    todayAppointments: number
    pendingInvoices: number
    monthRevenue: number
  }
  todayAppointments: any[]
  recentPatients: any[]
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')

  const { count: patientsCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .neq('patient_type', 'consultation')

  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      *,
      patients (first_name, last_name, date_of_birth)
    `)
    .gte('date_time', todayStart.toISOString())
    .lte('date_time', todayEnd.toISOString())
    .order('date_time')
    .limit(5)

  const { count: todayAppointmentsCount } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .gte('date_time', todayStart.toISOString())
    .lte('date_time', todayEnd.toISOString())
    .neq('status', 'Cancelled')

  // Pending Bills = any non-Merged invoice with a due balance (includes Partial).
  // Revenue = payments ledger rows dated this month, i.e. cash actually collected
  // this month regardless of when the invoice was raised (matches the Analytics
  // "Daily Earnings" calendar's dailyCollected() logic in src/lib/analytics.ts).
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, total_amount, paid_amount, status, created_at')
    .neq('status', 'Merged')

  const allInvoices =
    (invoiceRows as Array<{ id: string; total_amount: number | null; paid_amount: number | null; created_at: string }> | null) || []
  const pendingCount = allInvoices.filter((inv) => (inv.total_amount || 0) - (inv.paid_amount || 0) > 0).length
  const activeInvoiceIds = new Set(allInvoices.map((inv) => inv.id))

  const { data: paymentRows } = await supabase
    .from('payments')
    .select('invoice_id, amount, payment_date')
    .gte('payment_date', monthStart)

  const revenue = ((paymentRows as Array<{ invoice_id: string; amount: number | null; payment_date: string }> | null) || [])
    .filter((p) => activeInvoiceIds.has(p.invoice_id))
    .reduce((sum, p) => sum + (p.amount || 0), 0)

  const { data: patients } = await supabase
    .from('patients')
    .select('*')
    .neq('patient_type', 'consultation')
    .order('created_at', { ascending: false })
    .limit(5)

  return {
    stats: {
      totalPatients: patientsCount || 0,
      todayAppointments: todayAppointmentsCount || 0,
      pendingInvoices: pendingCount || 0,
      monthRevenue: revenue,
    },
    todayAppointments: appointments || [],
    recentPatients: patients || [],
  }
}
