import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { canAccessDoctorAnalytics, getAppRole } from '@/lib/appSession'
import { PieChart, UserCheck, Receipt } from 'lucide-react'
import { DoctorAnalytics } from '@/pages/DoctorAnalytics'
import { ClinicExpensesSection } from '@/components/analytics/ClinicExpensesSection'

// Doctor payout analytics + (admin-only) clinic-wide expense/profit-loss
// tracking, as two in-page tabs. Staff Analytics (roster + salary
// statements) lives separately in the admin-only HR & Payroll page
// (/hr-payroll). Doctors keep their existing direct "Doctor Analytics"
// sidebar entry (self-locked to their own work) — unrelated to this page.
type FATab = 'doctor' | 'expenses'

export function FinancialAnalysis() {
  const isAdmin = getAppRole() === 'admin'
  const canDoctorTab = canAccessDoctorAnalytics()

  if (!canDoctorTab && !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  const [tab, setTab] = useState<FATab>(canDoctorTab ? 'doctor' : 'expenses')

  return (
    <div className="space-y-6 page-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <PieChart className="w-6 h-6 text-teal-600" /> Financial Analysis
        </h1>
        <p className="text-text-secondary text-sm mt-1">Doctor payouts and clinic expenses in one place.</p>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200 flex-wrap">
        {canDoctorTab && (
          <TabButton active={tab === 'doctor'} onClick={() => setTab('doctor')} icon={<UserCheck className="w-4 h-4" />} label="Doctor Analytics & Payouts" />
        )}
        {isAdmin && (
          <TabButton active={tab === 'expenses'} onClick={() => setTab('expenses')} icon={<Receipt className="w-4 h-4" />} label="Clinic Expenses" />
        )}
      </div>

      {tab === 'doctor' && canDoctorTab && <DoctorAnalytics />}
      {tab === 'expenses' && isAdmin && <ClinicExpensesSection />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
        active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon} {label}
    </button>
  )
}
