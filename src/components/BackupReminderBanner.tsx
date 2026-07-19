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
  shouldNudgeRestoreDrill,
  markRestoreDrillNudged,
  type BackupCategory,
} from '@/lib/backupReminders'
import { buildSerializedBackup, uploadSerializedBackup } from '@/lib/deviceBackup'
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
              // Smart upload runs unattended: a suspicious count drop can't ask
              // anyone, so it warns via notification but still backs up — a
              // suspicious backup beats no backup.
              const serialized = await buildSerializedBackup({
                category,
                onAnomaly: async (drops) => {
                  const detail = drops.map((d) => `${d.table}: ${d.from} → ${d.to}`).join(', ')
                  addNotification({
                    title: 'Backup data shrank unexpectedly',
                    message: `Core records dropped since the last backup (${detail}). If you didn't delete these on purpose, investigate now — older backups are in Drive.`,
                    linkTo: '/backup',
                    audience: 'admin',
                  })
                  fireBrowserNotification(
                    'ClinicMx: data shrank unexpectedly',
                    `Records dropped since the last backup (${detail}).`
                  )
                  return true
                },
              })
              if (!serialized) throw new Error('Backup was cancelled.')
              const result = await uploadSerializedBackup(serialized, category)
              addNotification({
                title: `${CATEGORY_LABEL[category]} backup uploaded${result.verified ? ' ✓ verified' : ''}`,
                message: result.verified
                  ? `Automatically backed up to Google Drive as ${result.name} (integrity verified).`
                  : `Automatically backed up to Google Drive as ${result.name}, but integrity could not be verified — consider re-uploading manually.`,
                linkTo: '/backup',
                audience: 'admin',
              })
            } catch (error) {
              addNotification({
                title: `${CATEGORY_LABEL[category]} auto-upload failed`,
                message:
                  error instanceof Error
                    ? error.message
                    : 'Unknown error — back up manually from Backup & Restore.',
                linkTo: '/backup',
                audience: 'admin',
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
              audience: 'admin',
            })
            fireBrowserNotification(
              'ClinicMx backup due',
              `Your ${CATEGORY_LABEL[category].toLowerCase()} backup has not been made yet.`
            )
            visible.push({ category, instant })
          }
        }

        // Monthly restore-drill nudge (P5): backups you never test aren't backups.
        if (shouldNudgeRestoreDrill()) {
          markRestoreDrillNudged()
          addNotification({
            title: 'Monthly restore drill',
            message:
              "It's been a while since you tested a restore. Open Backup & Restore and run a dry-run — it writes nothing, but proves your backups actually work.",
            linkTo: '/backup',
            audience: 'admin',
          })
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
          className="bg-amber-500/[0.14] border-b border-amber-500/[0.35] text-amber-800 px-4 py-2 flex items-center gap-2 text-sm"
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
