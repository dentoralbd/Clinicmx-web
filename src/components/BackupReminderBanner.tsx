import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertTriangle, X } from 'lucide-react'
import { getAppRole } from '@/lib/appSession'
import {
  getBackupSettings,
  getOverdueCategories,
  isBannerDismissedFor,
  shouldNotifyFor,
  markNotified,
  clearNotified,
  dismissBannerFor,
  fireBrowserNotification,
  shouldNudgeRestoreDrill,
  markRestoreDrillNudged,
  claimBackupUpload,
  releaseBackupClaim,
  isAutoRetryDue,
  getAutoUploadAttempts,
  recordAutoUploadFailure,
  clearAutoRetry,
  type BackupCategory,
} from '@/lib/backupReminders'
import {
  buildSerializedBackup,
  uploadSerializedBackup,
  getDriveBackupStatus,
  describeBackupError,
} from '@/lib/deviceBackup'
import { addNotification, addNotificationOnce } from '@/lib/notifications'

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
 * Global banner + auto-upload runner for backup schedules, for admin and
 * operator accounts (opened to operator 2026-08-03, matching admin — was
 * admin-only). Checks on mount (covers "missed while app was closed") and
 * every minute while open. For each overdue category: if "smart upload" is
 * enabled it silently backs up to Drive and posts a notification of the
 * outcome; if not, it shows this banner (and a browser notification) asking
 * for a manual backup. Each scheduled instant is only ever acted on once.
 */
export function BackupReminderBanner() {
  const [banners, setBanners] = useState<OverdueBanner[]>([])
  const appRole = getAppRole()
  const canManageBackups = appRole === 'admin' || appRole === 'operator'
  const checking = useRef(false)

  useEffect(() => {
    if (!canManageBackups) return

    const check = async () => {
      if (checking.current) return
      checking.current = true
      try {
        // Both reads are shared/system-wide (Supabase schedule + Drive's
        // actual last-backup times) so every device computes the same
        // overdue set — whichever device happens to be open handles it. If
        // Drive is briefly unreachable, skip this cycle rather than risk a
        // false "overdue" (or a spurious auto-upload) from stale/missing data.
        let overdue: ReturnType<typeof getOverdueCategories> = []
        try {
          const [settings, drive] = await Promise.all([getBackupSettings(), getDriveBackupStatus()])
          overdue = getOverdueCategories(settings, drive)
        } catch {
          return
        }
        const visible: OverdueBanner[] = []

        for (const { category, instant, autoUpload } of overdue) {
          if (!shouldNotifyFor(category, instant)) {
            if (!isBannerDismissedFor(category, instant)) visible.push({ category, instant })
            continue
          }

          if (autoUpload) {
            // An earlier attempt at this same instant failed and its backoff
            // (2/5/15/30 min, see backupReminders.ts) hasn't elapsed yet —
            // keep showing the overdue banner, but don't claim or upload.
            if (!isAutoRetryDue(category, instant)) {
              if (!isBannerDismissedFor(category, instant)) visible.push({ category, instant })
              continue
            }

            // Cross-session guard: without this, two sessions that both see
            // "not done yet" in the same poll window both build + upload —
            // found live 2026-08-12 (two near-identical files 10s apart).
            // Losing the claim means another session already has it; skip
            // entirely, no notification (it'll post its own on success).
            if (!(await claimBackupUpload(category, instant))) continue

            // Marked only now (claim in hand), not before — markNotified()
            // used to run unconditionally before this block, so losing the
            // claim, a thrown upload, or the tab closing mid-request
            // permanently downgraded this instant to manual-banner-only in
            // this browser (shouldNotifyFor() would never see it un-notified
            // again). Found live 2026-08-22. The catch block below rolls
            // this back on failure — while retries remain — so a later check
            // tick genuinely retries; once AUTO_UPLOAD_MAX_ATTEMPTS is used
            // up the marker stays and the instant falls back to the banner.
            markNotified(category, instant)
            const priorFailures = getAutoUploadAttempts(category, instant)

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
              clearAutoRetry(category)
              const retryNote = priorFailures > 0 ? ` Succeeded on retry ${priorFailures}.` : ''
              addNotification({
                title: `${CATEGORY_LABEL[category]} backup uploaded${result.verified ? ' ✓ verified' : ''}`,
                message: result.verified
                  ? `Automatically backed up to Google Drive as ${result.name} (integrity verified).${retryNote}`
                  : `Automatically backed up to Google Drive as ${result.name}, but integrity could not be verified — consider re-uploading manually.${retryNote}`,
                linkTo: '/backup',
              })
            } catch (error) {
              const reason = describeBackupError(error)
              const retry = recordAutoUploadFailure(category, instant)
              await releaseBackupClaim(category, instant)
              if (retry.nextAt) {
                // Retries remain: roll back the local marker so the check
                // tick after the backoff treats this instant as un-notified
                // again. Only the FIRST failure posts — the follow-up retries
                // stay quiet (no per-minute notification/push spam), and
                // addNotificationOnce keyed by the instant dedups across
                // devices too.
                clearNotified(category)
                if (retry.attempts === 1) {
                  void addNotificationOnce(
                    {
                      title: `${CATEGORY_LABEL[category]} auto-upload failed — retrying`,
                      message: `${reason} Retrying automatically — next try around ${format(retry.nextAt, 'HH:mm')}.`,
                      linkTo: '/backup',
                    },
                    instant.toISOString()
                  )
                }
              } else {
                // Retries used up: leave the marker set so this instant falls
                // back to the manual overdue banner, and alert loudly once.
                void addNotificationOnce(
                  {
                    title: `${CATEGORY_LABEL[category]} auto-upload failed`,
                    message: `${reason} Gave up after ${retry.attempts} attempts — back up manually from Backup & Restore.`,
                    linkTo: '/backup',
                  },
                  instant.toISOString()
                )
                fireBrowserNotification(
                  `${CATEGORY_LABEL[category]} backup failed`,
                  'Automatic upload to Drive failed — open ClinicMx to back up manually.'
                )
              }
              visible.push({ category, instant })
            }
          } else {
            // Marked here (not before the if/else split) — see the comment
            // above the autoUpload branch's own markNotified() for why.
            markNotified(category, instant)
            // addNotificationOnce: two devices open at the same overdue
            // instant both reach this branch — dedup by title+instant so
            // only one shared row gets posted, not one per device.
            addNotificationOnce(
              {
                title: `${CATEGORY_LABEL[category]} backup overdue`,
                message: `No backup since the scheduled time (${format(instant, 'MMM d, HH:mm')}).`,
                linkTo: '/backup',
              },
              instant.toISOString()
            )
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
  }, [canManageBackups])

  if (!canManageBackups || banners.length === 0) return null

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
