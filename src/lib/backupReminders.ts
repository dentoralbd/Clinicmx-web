import { addDays, addMonths, addWeeks, isAfter, parseISO, set, setDay, subDays, subMonths, subWeeks } from 'date-fns'

export type BackupFrequency = 'daily' | 'weekly' | 'monthly'

export interface BackupSettings {
  frequency: BackupFrequency
  /** 24h "HH:mm" local time */
  time: string
  remindersEnabled: boolean
  updated_at?: string
}

const SETTINGS_KEY = 'clinicmx_backup_settings'
const LAST_BACKUP_KEY = 'clinicmx_last_backup_at'
const NOTIFIED_FOR_KEY = 'clinicmx_backup_notified_for'
const BANNER_DISMISSED_FOR_KEY = 'clinicmx_backup_banner_dismissed_for'

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  frequency: 'daily',
  time: '23:30',
  remindersEnabled: false,
}

export function getBackupSettings(): BackupSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_BACKUP_SETTINGS }
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      ['daily', 'weekly', 'monthly'].includes(parsed.frequency) &&
      /^\d{2}:\d{2}$/.test(parsed.time)
    ) {
      return { ...DEFAULT_BACKUP_SETTINGS, ...parsed }
    }
    return { ...DEFAULT_BACKUP_SETTINGS }
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS }
  }
}

export function saveBackupSettings(settings: Omit<BackupSettings, 'updated_at'>) {
  const next: BackupSettings = { ...settings, updated_at: new Date().toISOString() }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable – silently skip
  }
  return next
}

export function getLastBackupAt(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY)
    return raw ? parseISO(raw) : null
  } catch {
    return null
  }
}

/** Stamp a completed device backup and reset the reminder markers. */
export function markBackupDone() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString())
    localStorage.removeItem(NOTIFIED_FOR_KEY)
    localStorage.removeItem(BANNER_DISMISSED_FOR_KEY)
  } catch {
    // ignore
  }
}

/**
 * The most recent scheduled backup instant at or before `now`.
 * Weekly is anchored to Mondays, monthly to the 1st (the UI labels say so).
 */
export function getPreviousScheduledInstant(settings: BackupSettings, now: Date = new Date()): Date {
  const [hours, minutes] = settings.time.split(':').map(Number)
  const atTime = { hours, minutes, seconds: 0, milliseconds: 0 }

  if (settings.frequency === 'daily') {
    const candidate = set(now, atTime)
    return isAfter(candidate, now) ? subDays(candidate, 1) : candidate
  }
  if (settings.frequency === 'weekly') {
    const candidate = set(setDay(now, 1, { weekStartsOn: 1 }), atTime)
    return isAfter(candidate, now) ? subWeeks(candidate, 1) : candidate
  }
  const candidate = set(now, { date: 1, ...atTime })
  return isAfter(candidate, now) ? subMonths(candidate, 1) : candidate
}

/** The next scheduled backup instant strictly after `now` (for settings feedback). */
export function getNextScheduledInstant(settings: BackupSettings, now: Date = new Date()): Date {
  const prev = getPreviousScheduledInstant(settings, now)
  if (settings.frequency === 'daily') return addDays(prev, 1)
  if (settings.frequency === 'weekly') return addWeeks(prev, 1)
  return addMonths(prev, 1)
}

/**
 * Returns the scheduled instant that is currently overdue (passed with no
 * backup since), or null. Baselines against settings.updated_at too, so
 * enabling reminders never instantly flags an instant from before the
 * feature was configured.
 */
export function getOverdueInstant(now: Date = new Date()): Date | null {
  const settings = getBackupSettings()
  if (!settings.remindersEnabled) return null

  const prev = getPreviousScheduledInstant(settings, now)
  const lastBackup = getLastBackupAt()
  const settingsUpdated = settings.updated_at ? parseISO(settings.updated_at) : null

  let baseline = lastBackup
  if (settingsUpdated && (!baseline || isAfter(settingsUpdated, baseline))) baseline = settingsUpdated

  if (!baseline) return prev
  return isAfter(prev, baseline) ? prev : null
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

export function shouldNotifyFor(instant: Date) {
  return readInstantMarker(NOTIFIED_FOR_KEY) !== instant.toISOString()
}

export function markNotified(instant: Date) {
  writeInstantMarker(NOTIFIED_FOR_KEY, instant)
}

export function isBannerDismissedFor(instant: Date) {
  return readInstantMarker(BANNER_DISMISSED_FOR_KEY) === instant.toISOString()
}

export function dismissBannerFor(instant: Date) {
  writeInstantMarker(BANNER_DISMISSED_FOR_KEY, instant)
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

export function fireBackupNotification() {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return
  try {
    const notification = new Notification('ClinicMx backup due', {
      body: 'Your scheduled backup has not been made yet. Open Backup & Restore to download one.',
    })
    notification.onclick = () => window.focus()
  } catch {
    // Some Android WebViews throw on the Notification constructor – banner is the fallback.
  }
}
