import { Navigate } from 'react-router-dom'
import { canAccessDoctorAnalytics } from '@/lib/appSession'
import { PieChart } from 'lucide-react'
import { DoctorAnalytics } from '@/pages/DoctorAnalytics'

// Doctor payout analytics only — Staff Analytics (roster + salary
// statements) moved into the admin-only HR & Payroll page (/hr-payroll).
// Doctors keep their existing direct "Doctor Analytics" sidebar entry
// (self-locked to their own work) — unrelated to this page.
export function FinancialAnalysis() {
  if (!canAccessDoctorAnalytics()) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="space-y-6 page-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <PieChart className="w-6 h-6 text-teal-600" /> Financial Analysis
        </h1>
        <p className="text-text-secondary text-sm mt-1">Doctor payouts in one place.</p>
      </div>

      <DoctorAnalytics />
    </div>
  )
}
