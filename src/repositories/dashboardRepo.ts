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

  // Pending Bills = any non-Merged invoice with a due balance (includes Partial);
  // Revenue = paid_amount collected on this month's invoices (matches FinancialReportsPanel)
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('total_amount, paid_amount, status, created_at')
    .neq('status', 'Merged')

  const allInvoices = (invoiceRows as Array<{ total_amount: number | null; paid_amount: number | null; created_at: string }> | null) || []
  const pendingCount = allInvoices.filter((inv) => (inv.total_amount || 0) - (inv.paid_amount || 0) > 0).length
  const revenue = allInvoices
    .filter((inv) => inv.created_at >= monthStart)
    .reduce((sum, inv) => sum + (inv.paid_amount || 0), 0)

  const { data: patients } = await supabase
    .from('patients')
    .select('*')
    .neq('patient_type', 'consultation')
    .order('created_at', { ascending: false })
    .limit(5)

  return {
    stats: {
      totalPatients: patientsCount || 0,
      todayAppointments: appointments?.length || 0,
      pendingInvoices: pendingCount || 0,
      monthRevenue: revenue,
    },
    todayAppointments: appointments || [],
    recentPatients: patients || [],
  }
}
