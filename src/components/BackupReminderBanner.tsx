import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertTriangle, X } from 'lucide-react'
import { getAppRole } from '@/lib/appSession'
import {
  getOverdueCategories,
  isBannerDismissedFor,
  shouldNotifyFor,
  markNotified,
  dismissBannerFor,
  fireBrowserNotification,
  type BackupCategory,
} from '@/lib/backupReminders'
import { buildDeviceBackup, uploadBackupToDrive } from '@/lib/deviceBackup'
import { addNotification } from '@/lib/notifications'

const CATEGORY_LABEL: Record<BackupCategory, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

interface OverdueBanner {
  category: BackupCategory
  instant: Date
}

/**
 * Global admin-only banner + auto-upload runner for backup schedules.
 * Checks on mount (covers "missed while app was closed") and every minute
 * while open. For each overdue category: if "smart upload" is enabled it
 * silently backs up to Drive and posts a notification of the outcome; if
 * not, it shows this banner (and a browser notification) asking for a
 * manual backup. Each scheduled instant is only ever acted on once.
 */
export function BackupReminderBanner() {
  const [banners, setBanners] = useState<OverdueBanner[]>([])
  const isAdmin = getAppRole() === 'admin'
  const checking = useRef(false)

  useEffect(() => {
    if (!isAdmin) return

    const check = async () => {
      if (checking.current) return
      checking.current = true
      try {
        const overdue = getOverdueCategories()
        const visible: OverdueBanner[] = []

        for (const { category, instant, autoUpload } of overdue) {
          if (!shouldNotifyFor(category, instant)) {
            if (!isBannerDismissedFor(category, instant)) visible.push({ category, instant })
            continue
          }
          // Mark as attempted before the (possibly slow) upload runs, so an
          // overlapping tick can't fire the same scheduled instant twice.
          markNotified(category, instant)

          if (autoUpload) {
            try {
              const backup = await buildDeviceBackup()
              const result = await uploadBackupToDrive(backup, category)
              addNotification({
                title: `${CATEGORY_LABEL[category]} backup uploaded`,
                message: `Automatically backed up to Google Drive as ${result.name}.`,
                linkTo: '/backup',
              })
            } catch (error) {
              addNotification({
                title: `${CATEGORY_LABEL[category]} auto-upload failed`,
                message:
                  error instanceof Error
                    ? error.message
                    : 'Unknown error — back up manually from Backup & Restore.',
                linkTo: '/backup',
              })
              fireBrowserNotification(
                `${CATEGORY_LABEL[category]} backup failed`,
                'Automatic upload to Drive failed — open ClinicMx to back up manually.'
              )
              visible.push({ category, instant })
            }
          } else {
            addNotification({
              title: `${CATEGORY_LABEL[category]} backup overdue`,
              message: `No backup since the scheduled time (${format(instant, 'MMM d, HH:mm')}).`,
              linkTo: '/backup',
            })
            fireBrowserNotification(
              'ClinicMx backup due',
              `Your ${CATEGORY_LABEL[category].toLowerCase()} backup has not been made yet.`
            )
            visible.push({ category, instant })
          }
        }

        setBanners(visible)
      } finally {
        checking.current = false
      }
    }

    check()
    const interval = setInterval(check, 60_000)
    return () => clearInterval(interval)
  }, [isAdmin])

  if (!isAdmin || banners.length === 0) return null

  return (
    <div className="flex flex-col">
      {banners.map(({ category, instant }) => (
        <div
          key={category}
          className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2 flex items-center gap-2 text-sm"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            {CATEGORY_LABEL[category]} backup overdue — no backup since the scheduled time (
            {format(instant, 'MMM d, HH:mm')}).
          </span>
          <Link to="/backup" className="font-medium underline hover:text-amber-900 shrink-0">
            Back up now
          </Link>
          <button
            type="button"
            aria-label={`Dismiss ${category} backup reminder`}
            className="p-1 rounded hover:bg-amber-100 shrink-0"
            onClick={() => {
              dismissBannerFor(category, instant)
              setBanners((prev) => prev.filter((b) => b.category !== category))
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
