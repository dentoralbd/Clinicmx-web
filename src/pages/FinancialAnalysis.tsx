import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { canAccessDoctorAnalytics, canAccessStaffAnalytics } from '@/lib/appSession'
import { PieChart, UserCheck, Users } from 'lucide-react'
import { DoctorAnalytics } from '@/pages/DoctorAnalytics'
import { StaffAnalyticsSection } from '@/components/analytics/StaffAnalyticsSection'

type FinancialTab = 'doctor' | 'staff'

// Admin sees both tabs by default. Non-admins reach this page only with an
// explicit per-account permission (Admin -> Users) for one tab, the other,
// or both — each tab's button/panel is independently gated so a user with
// just one permission never sees so much as a dead button for the other.
// Doctors keep their existing direct "Doctor Analytics" sidebar entry
// (self-locked to their own work) — unrelated to this page.
export function FinancialAnalysis() {
  const canDoctor = canAccessDoctorAnalytics()
  const canStaff = canAccessStaffAnalytics()
  const [tab, setTab] = useState<FinancialTab>(canDoctor ? 'doctor' : 'staff')

  if (!canDoctor && !canStaff) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="space-y-6 page-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <PieChart className="w-6 h-6 text-teal-600" /> Financial Analysis
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Doctor payouts and staff performance in one place.
        </p>
      </div>

      {canDoctor && canStaff && (
        <div className="flex items-center gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab('doctor')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'doctor'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserCheck className="w-4 h-4" /> Doctor Analytics
          </button>
          <button
            type="button"
            onClick={() => setTab('staff')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'staff'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users className="w-4 h-4" /> Staff Analytics
          </button>
        </div>
      )}

      {tab === 'doctor' && canDoctor && <DoctorAnalytics />}

      {tab === 'staff' && canStaff && <StaffAnalyticsSection />}
    </div>
  )
}
