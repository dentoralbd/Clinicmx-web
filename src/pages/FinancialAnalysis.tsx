import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getAppRole } from '@/lib/appSession'
import { PieChart, UserCheck, Users } from 'lucide-react'
import { DoctorAnalytics } from '@/pages/DoctorAnalytics'

type FinancialTab = 'doctor' | 'staff'

// Admin-only container. Doctors keep their existing direct "Doctor
// Analytics" sidebar entry (self-locked to their own work) — this page
// and its Staff Analytics tab are not part of that flow.
export function FinancialAnalysis() {
  const role = getAppRole()
  const [tab, setTab] = useState<FinancialTab>('doctor')

  if (role !== 'admin') {
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

      {tab === 'doctor' && <DoctorAnalytics />}

      {tab === 'staff' && (
        <div className="bg-white rounded-xl border border-gray-200/80 p-8 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="font-display font-bold text-base text-slate-900">Staff Analytics — coming soon</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Staff performance tracking will appear here once the metrics to track are defined.
          </p>
        </div>
      )}
    </div>
  )
}
