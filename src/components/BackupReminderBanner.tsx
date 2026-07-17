import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertTriangle, X } from 'lucide-react'
import { getAppRole } from '@/lib/appSession'
import {
  getOverdueInstant,
  isBannerDismissedFor,
  shouldNotifyFor,
  markNotified,
  dismissBannerFor,
  fireBackupNotification,
} from '@/lib/backupReminders'

/**
 * Global admin-only banner shown when a scheduled device backup is overdue.
 * Checks on mount (covers "backup was missed while app was closed") and every
 * minute while the app stays open (covers the scheduled time passing live).
 */
export function BackupReminderBanner() {
  const [overdueInstant, setOverdueInstant] = useState<Date | null>(null)
  const isAdmin = getAppRole() === 'admin'

  useEffect(() => {
    if (!isAdmin) return

    const check = () => {
      const instant = getOverdueInstant()
      if (!instant) {
        setOverdueInstant(null)
        return
      }
      if (shouldNotifyFor(instant)) {
        fireBackupNotification()
        markNotified(instant)
      }
      setOverdueInstant(isBannerDismissedFor(instant) ? null : instant)
    }

    check()
    const interval = setInterval(check, 60_000)
    return () => clearInterval(interval)
  }, [isAdmin])

  if (!isAdmin || !overdueInstant) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2 flex items-center gap-2 text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        Backup overdue — no backup since the scheduled time ({format(overdueInstant, 'MMM d, HH:mm')}).
      </span>
      <Link to="/backup" className="font-medium underline hover:text-amber-900 shrink-0">
        Back up now
      </Link>
      <button
        type="button"
        aria-label="Dismiss backup reminder"
        className="p-1 rounded hover:bg-amber-100 shrink-0"
        onClick={() => {
          dismissBannerFor(overdueInstant)
          setOverdueInstant(null)
        }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
