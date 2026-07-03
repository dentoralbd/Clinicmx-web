import { useState } from 'react'
import { AlertTriangle, Mail, Phone, User } from 'lucide-react'

interface PatientHeaderProps {
  patient: any
  avatarUrl: string | null
  age: number | null
  alerts: Array<{ label: string; severity: 'warning' | 'critical' }>
  completeness: { percent: number; missing: string[] }
  stats: Array<{ label: string; value: string }>
}

const RING_RADIUS = 46
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function PatientHeader({ patient, avatarUrl, age, alerts, completeness, stats }: PatientHeaderProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const initials = `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase()
  const showImage = avatarUrl && !imgFailed
  const completenessTitle = completeness.missing.length > 0
    ? `Profile ${completeness.percent}% complete. Missing: ${completeness.missing.join(', ')}`
    : 'Profile complete'

  return (
    <div className="rounded-3xl bg-gradient-to-br from-primary via-primary/80 to-slate-900 p-4 sm:p-6 text-white shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4 sm:items-center">
          <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24" title={completenessTitle}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="5" />
              <circle
                cx="50"
                cy="50"
                r={RING_RADIUS}
                fill="none"
                stroke="#6ee7b7"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - completeness.percent / 100)}
              />
            </svg>
            <div className="absolute inset-[7px] overflow-hidden rounded-full ring-2 ring-white/40">
              {showImage ? (
                <img
                  src={avatarUrl}
                  alt={`${patient.first_name} ${patient.last_name}`}
                  className="h-full w-full object-cover"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/20 text-xl font-bold sm:text-2xl">
                  {initials || <User className="h-8 w-8" />}
                </div>
              )}
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 px-1.5 py-px text-[10px] font-bold text-emerald-950 shadow-sm">
              {completeness.percent}%
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold leading-tight sm:text-2xl">
                {patient.first_name} {patient.last_name}
              </h1>
              {patient.patient_code && (
                <span className="inline-flex items-center rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-xs font-bold backdrop-blur-sm">
                  {patient.patient_code}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
              {age !== null && <span>{age} yrs</span>}
              {patient.gender && <span>{patient.gender}</span>}
              {patient.phone && (
                <a href={`tel:${patient.phone}`} className="inline-flex items-center gap-1 hover:text-white hover:underline">
                  <Phone className="h-3.5 w-3.5" />
                  {patient.phone}
                </a>
              )}
              {patient.email && (
                <a href={`mailto:${patient.email}`} className="inline-flex items-center gap-1 hover:text-white hover:underline">
                  <Mail className="h-3.5 w-3.5" />
                  {patient.email}
                </a>
              )}
            </div>

            {alerts.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {alerts.map((alert) => (
                  <span
                    key={alert.label}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      alert.severity === 'critical'
                        ? 'bg-red-500/90 text-white'
                        : 'bg-amber-400/90 text-amber-950'
                    }`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {alert.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 rounded-2xl bg-white/10 p-2 sm:p-3 backdrop-blur-sm">
              <div className="truncate text-[10px] uppercase tracking-wide text-white/70 sm:text-xs">{stat.label}</div>
              <div className="mt-1 truncate text-sm font-semibold sm:text-lg">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
