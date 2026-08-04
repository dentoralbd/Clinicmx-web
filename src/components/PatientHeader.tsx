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
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-light via-primary-surface to-white p-4 sm:p-6 text-text-primary shadow-glass border border-primary/10">
      {/* Ambient glass glows */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-highlight/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between z-10">
        <div className="flex items-start gap-4 sm:items-center">
          <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24" title={completenessTitle}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgba(13,148,136,0.15)" strokeWidth="5" />
              <circle
                cx="50"
                cy="50"
                r={RING_RADIUS}
                fill="none"
                stroke="#0D9488"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - completeness.percent / 100)}
              />
            </svg>
            <div className="absolute inset-[7px] overflow-hidden rounded-full ring-2 ring-white shadow-sm">
              {showImage ? (
                <img
                  src={avatarUrl}
                  alt={`${patient.first_name} ${patient.last_name}`}
                  className="h-full w-full object-cover"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary-bright text-xl font-bold text-white sm:text-2xl font-display">
                  {initials || <User className="h-8 w-8 text-white/90" />}
                </div>
              )}
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-px text-[10px] font-bold text-white shadow-sm border border-white">
              {completeness.percent}%
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl text-text-primary">
                {patient.first_name} {patient.last_name}
              </h1>
              {patient.patient_code && (
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-white/70 px-2.5 py-0.5 text-xs font-bold font-mono text-primary backdrop-blur-sm shadow-sm">
                  {patient.patient_code}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs sm:text-sm text-text-secondary font-medium">
              {age !== null && (
                <span className="bg-white/70 px-2.5 py-0.5 rounded-full border border-primary/10 shadow-sm">{age} yrs</span>
              )}
              {patient.gender && (
                <span className="bg-white/70 px-2.5 py-0.5 rounded-full border border-primary/10 shadow-sm">{patient.gender}</span>
              )}
              {patient.phone && (
                <a
                  href={`tel:${patient.phone}`}
                  className="inline-flex items-center gap-1.5 hover:text-primary font-mono bg-white/70 px-2.5 py-0.5 rounded-full border border-primary/10 shadow-sm transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {patient.phone}
                </a>
              )}
              {patient.email && (
                <a
                  href={`mailto:${patient.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-primary bg-white/70 px-2.5 py-0.5 rounded-full border border-primary/10 shadow-sm transition-colors"
                >
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
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${
                      alert.severity === 'critical'
                        ? 'bg-red-500 text-white'
                        : 'bg-amber-400 text-amber-950'
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
            <div key={stat.label} className="min-w-0 rounded-2xl bg-white/70 p-2 sm:p-3 backdrop-blur-sm border border-primary/10 shadow-sm">
              <div className="truncate text-[10px] uppercase tracking-wide text-text-secondary sm:text-xs">{stat.label}</div>
              <div className="mt-1 truncate text-sm font-semibold text-text-primary sm:text-lg">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
