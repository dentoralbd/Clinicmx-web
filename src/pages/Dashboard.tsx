import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { getPatientDobOrAge, safeFormat, formatBDT } from '@/lib/utils'
import { Users, Calendar, DollarSign, TrendingUp, RefreshCw, ArrowRight } from 'lucide-react'

interface Stats {
  totalPatients: number
  todayAppointments: number
  pendingInvoices: number
  monthRevenue: number
}

interface Invoice {
  total_amount: number
}

export function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0,
    todayAppointments: 0,
    pendingInvoices: 0,
    monthRevenue: 0,
  })
  const [todayAppointments, setTodayAppointments] = useState<any[]>([])
  const [recentPatients, setRecentPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')

      const { count: patientsCount } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })

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

      const { count: pendingCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Pending')

      const { data: invoices } = await supabase
        .from('invoices')
        .select('total_amount')
        .gte('created_at', monthStart)
        .eq('status', 'Paid')

      const revenue = (invoices as Invoice[] || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0)

      const { data: patients } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)

      setStats({
        totalPatients: patientsCount || 0,
        todayAppointments: appointments?.length || 0,
        pendingInvoices: pendingCount || 0,
        monthRevenue: revenue,
      })
      setTodayAppointments(appointments || [])
      setRecentPatients(patients || [])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 page-fade-in">
        <div>
          <div className="skeleton h-8 w-40 mb-2" />
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="skeleton h-4 w-32 mb-3" />
              <div className="skeleton h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-text-secondary mt-1">Welcome back! Here's your clinic overview.</p>
        </div>
        <button
          onClick={() => loadDashboardData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Today's Appointments"
          value={stats.todayAppointments.toString()}
          icon={<Calendar className="w-6 h-6" />}
          color="blue"
          onClick={() => navigate('/appointments')}
        />
        <StatCard
          title="Total Patients"
          value={stats.totalPatients.toString()}
          icon={<Users className="w-6 h-6" />}
          color="green"
          onClick={() => navigate('/patients')}
        />
        <StatCard
          title="Pending Bills"
          value={stats.pendingInvoices.toString()}
          icon={<DollarSign className="w-6 h-6" />}
          color="orange"
          onClick={() => navigate('/billing')}
        />
        <StatCard
          title="Revenue (Month)"
          value={`${formatBDT(stats.monthRevenue)}`}
          icon={<TrendingUp className="w-6 h-6" />}
          color="purple"
          onClick={() => navigate('/billing')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Today's Appointments</h3>
            <button
              onClick={() => navigate('/appointments')}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary-hover transition-colors"
            >
              View all <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {todayAppointments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-text-secondary text-sm">No appointments today</p>
              <button
                onClick={() => navigate('/appointments')}
                className="mt-3 text-sm text-primary hover:underline"
              >
                Schedule one →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {todayAppointments.map((apt) => (
                <AppointmentItem
                  key={apt.id}
                  time={safeFormat(apt.date_time, 'h:mm a')}
                  patient={`${apt.patients?.first_name ?? ''} ${apt.patients?.last_name ?? ''}`.trim() || 'Unknown Patient'}
                  patientMeta={getPatientDobOrAge(apt.patients?.date_of_birth, apt.patients?.age, '')}
                  type={apt.type}
                  status={apt.status}
                />
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Patients</h3>
            <button
              onClick={() => navigate('/patients')}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary-hover transition-colors"
            >
              View all <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {recentPatients.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-text-secondary text-sm">No patients yet</p>
              <button
                onClick={() => navigate('/patients')}
                className="mt-3 text-sm text-primary hover:underline"
              >
                Add a patient →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPatients.map((patient) => (
                <PatientItem
                  key={patient.id}
                  id={patient.id}
                  name={`${patient.first_name} ${patient.last_name}`}
                  lastVisit={safeFormat(patient.created_at, 'MMM d, yyyy')}
                  onClick={() => navigate(`/patients/${patient.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color, onClick }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <button
      onClick={onClick}
      className="bg-card rounded-lg shadow-sm border border-gray-200 p-6 text-left w-full hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 group"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-lg ${colors[color]} flex items-center justify-center group-hover:scale-110 transition-transform duration-150`}>
          {icon}
        </div>
      </div>
    </button>
  )
}

const statusColors: Record<string, string> = {
  Scheduled: 'bg-blue-100 text-blue-700',
  Confirmed: 'bg-green-100 text-green-700',
  Completed: 'bg-gray-100 text-gray-600',
  Cancelled: 'bg-red-100 text-red-700',
}

function AppointmentItem({ time, patient, patientMeta, type, status }: any) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
      <div>
        <p className="font-medium">{patient}</p>
        {patientMeta && <p className="text-xs text-text-secondary">{patientMeta}</p>}
        <p className="text-sm text-text-secondary">{type}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-medium text-primary">{time}</span>
        {status && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusColors[status] || 'bg-gray-100'}`}>
            {status}
          </span>
        )}
      </div>
    </div>
  )
}

const avatarColors = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
]

function PatientItem({ id, name, lastVisit, onClick }: any) {
  const colorIndex = id ? id.charCodeAt(0) % avatarColors.length : 0
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg w-full text-left hover:bg-blue-50 hover:shadow-sm transition-all group"
    >
      <div className={`w-10 h-10 ${avatarColors[colorIndex]} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
        {name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate group-hover:text-primary transition-colors">{name}</p>
        <p className="text-sm text-text-secondary">Added: {lastVisit}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0" />
    </button>
  )
}
