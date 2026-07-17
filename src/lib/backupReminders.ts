import { addDays, addMonths, addWeeks, isAfter, parseISO, set, setDay, subDays, subMonths, subWeeks } from 'date-fns'

export type BackupCategory = 'daily' | 'weekly' | 'monthly'
export const BACKUP_CATEGORIES: BackupCategory[] = ['daily', 'weekly', 'monthly']

export interface ScheduleSettings {
  enabled: boolean
  /** 24h "HH:mm" local time */
  time: string
  /** "Smart upload": automatically build + upload to Drive at the scheduled
   * time instead of just reminding the user to do it manually. */
  autoUpload: boolean
}

export interface BackupSettings {
  daily: ScheduleSettings
  weekly: ScheduleSettings
  monthly: ScheduleSettings
  updated_at?: string
}

const SETTINGS_KEY = 'clinicmx_backup_settings'
const LAST_BACKUP_KEY = 'clinicmx_last_backup_at'
const lastBackupCategoryKey = (c: BackupCategory) => `clinicmx_last_backup_at_${c}`
const notifiedForKey = (c: BackupCategory) => `clinicmx_backup_notified_for_${c}`
const bannerDismissedForKey = (c: BackupCategory) => `clinicmx_backup_banner_dismissed_for_${c}`

const DEFAULT_SCHEDULE: ScheduleSettings = { enabled: false, time: '23:30', autoUpload: false }

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  daily: { ...DEFAULT_SCHEDULE },
  weekly: { ...DEFAULT_SCHEDULE },
  monthly: { ...DEFAULT_SCHEDULE },
}

function isValidSchedule(value: unknown): value is ScheduleSettings {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ScheduleSettings).enabled === 'boolean' &&
    typeof (value as ScheduleSettings).autoUpload === 'boolean' &&
    /^\d{2}:\d{2}$/.test((value as ScheduleSettings).time)
  )
}

// Any older/malformed format (including the pre-multi-schedule single
// `frequency` shape) is treated as "not set" and falls back to defaults per
// category, rather than crashing or silently misreading it.
export function getBackupSettings(): BackupSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_BACKUP_SETTINGS }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_BACKUP_SETTINGS }
    return {
      daily: isValidSchedule(parsed.daily) ? parsed.daily : { ...DEFAULT_SCHEDULE },
      weekly: isValidSchedule(parsed.weekly) ? parsed.weekly : { ...DEFAULT_SCHEDULE },
      monthly: isValidSchedule(parsed.monthly) ? parsed.monthly : { ...DEFAULT_SCHEDULE },
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : undefined,
    }
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS }
  }
}

export function saveBackupSettings(settings: Omit<BackupSettings, 'updated_at'>): BackupSettings {
  const next: BackupSettings = { ...settings, updated_at: new Date().toISOString() }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable – silently skip
  }
  return next
}

/** Overall "last backup from this device" shown in Card 1, regardless of category. */
export function getLastBackupAt(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY)
    return raw ? parseISO(raw) : null
  } catch {
    return null
  }
}

export function getLastBackupAtForCategory(category: BackupCategory): Date | null {
  try {
    const raw = localStorage.getItem(lastBackupCategoryKey(category))
    return raw ? parseISO(raw) : null
  } catch {
    return null
  }
}

/**
 * Stamp a completed device backup. Always updates the overall "last backup"
 * timestamp; when a category is given (a scheduled daily/weekly/monthly
 * backup, auto or manual-but-tagged), also stamps that category specifically
 * and clears its reminder markers so it stops nagging for this instant.
 */
export function markBackupDone(category?: BackupCategory) {
  const now = new Date().toISOString()
  try {
    localStorage.setItem(LAST_BACKUP_KEY, now)
    if (category) {
      localStorage.setItem(lastBackupCategoryKey(category), now)
      localStorage.removeItem(notifiedForKey(category))
      localStorage.removeItem(bannerDismissedForKey(category))
    }
  } catch {
    // ignore
  }
}

/**
 * The most recent scheduled instant at or before `now` for one category.
 * Weekly is anchored to Mondays, monthly to the 1st (the UI labels say so).
 */
export function getPreviousScheduledInstant(
  category: BackupCategory,
  schedule: ScheduleSettings,
  now: Date = new Date()
): Date {
  const [hours, minutes] = schedule.time.split(':').map(Number)
  const atTime = { hours, minutes, seconds: 0, milliseconds: 0 }

  if (category === 'daily') {
    const candidate = set(now, atTime)
    return isAfter(candidate, now) ? subDays(candidate, 1) : candidate
  }
  if (category === 'weekly') {
    const candidate = set(setDay(now, 1, { weekStartsOn: 1 }), atTime)
    return isAfter(candidate, now) ? subWeeks(candidate, 1) : candidate
  }
  const candidate = set(now, { date: 1, ...atTime })
  return isAfter(candidate, now) ? subMonths(candidate, 1) : candidate
}

/** The next scheduled instant strictly after `now` (for settings feedback). */
export function getNextScheduledInstant(
  category: BackupCategory,
  schedule: ScheduleSettings,
  now: Date = new Date()
): Date {
  const prev = getPreviousScheduledInstant(category, schedule, now)
  if (category === 'daily') return addDays(prev, 1)
  if (category === 'weekly') return addWeeks(prev, 1)
  return addMonths(prev, 1)
}

export interface OverdueCategory {
  category: BackupCategory
  instant: Date
  autoUpload: boolean
}

/**
 * Every category that is currently overdue (its scheduled instant passed
 * with no backup done for that category since). Baselines against
 * settings.updated_at too, so enabling a schedule never instantly flags an
 * instant from before it was configured.
 */
export function getOverdueCategories(now: Date = new Date()): OverdueCategory[] {
  const settings = getBackupSettings()
  const settingsUpdated = settings.updated_at ? parseISO(settings.updated_at) : null
  const result: OverdueCategory[] = []

  for (const category of BACKUP_CATEGORIES) {
    const schedule = settings[category]
    if (!schedule.enabled) continue

    const prev = getPreviousScheduledInstant(category, schedule, now)
    // Any backup counts toward "am I overdue" — a plain manual Download/Upload
    // (untagged) reasonably satisfies a pending Daily/Weekly/Monthly nudge too,
    // not just a category-tagged one. Baseline is the latest of: this
    // category's own last tagged backup, the overall last-backup-at, and when
    // the schedule was (re)configured.
    let baseline = getLastBackupAtForCategory(category)
    const overallLastBackup = getLastBackupAt()
    if (overallLastBackup && (!baseline || isAfter(overallLastBackup, baseline))) baseline = overallLastBackup
    if (settingsUpdated && (!baseline || isAfter(settingsUpdated, baseline))) baseline = settingsUpdated

    if (!baseline || isAfter(prev, baseline)) {
      result.push({ category, instant: prev, autoUpload: schedule.autoUpload })
    }
  }
  return result
}

function readInstantMarker(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeInstantMarker(key: string, instant: Date) {
  try {
    localStorage.setItem(key, instant.toISOString())
  } catch {
    // ignore
  }
}

export function shouldNotifyFor(category: BackupCategory, instant: Date) {
  return readInstantMarker(notifiedForKey(category)) !== instant.toISOString()
}

export function markNotified(category: BackupCategory, instant: Date) {
  writeInstantMarker(notifiedForKey(category), instant)
}

export function isBannerDismissedFor(category: BackupCategory, instant: Date) {
  return readInstantMarker(bannerDismissedForKey(category)) === instant.toISOString()
}

export function dismissBannerFor(category: BackupCategory, instant: Date) {
  writeInstantMarker(bannerDismissedForKey(category), instant)
}

export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  return isNotificationSupported() ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function fireBrowserNotification(title: string, body: string) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return
  try {
    const notification = new Notification(title, { body })
    notification.onclick = () => window.focus()
  } catch {
    // Some Android WebViews throw on the Notification constructor – the
    // in-app notification bell / banner is the fallback channel.
  }
}
