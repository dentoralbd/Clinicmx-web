import { addDays, addMonths, addWeeks, isAfter, parseISO, set, setDay, subDays, subMonths, subWeeks } from 'date-fns'
import { supabase } from './supabase'

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

// Reminder settings used to live in localStorage (per-device). They're now a
// shared row in Supabase (backup_settings, a singleton table like
// invoice_settings) so every device — phone, laptop, whatever — reads and
// writes the SAME Daily/Weekly/Monthly schedule. Only one device needs to
// configure it; any device with the app open can act on it.
const SETTINGS_ROW_ID = 1
const LOCAL_SETTINGS_CACHE_KEY = 'clinicmx_backup_settings_cache'
const LAST_BACKUP_KEY = 'clinicmx_last_backup_at'
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

function normalizeSettings(raw: unknown): BackupSettings {
  const parsed = (raw ?? {}) as Record<string, unknown>
  return {
    daily: isValidSchedule(parsed.daily) ? (parsed.daily as ScheduleSettings) : { ...DEFAULT_SCHEDULE },
    weekly: isValidSchedule(parsed.weekly) ? (parsed.weekly as ScheduleSettings) : { ...DEFAULT_SCHEDULE },
    monthly: isValidSchedule(parsed.monthly) ? (parsed.monthly as ScheduleSettings) : { ...DEFAULT_SCHEDULE },
    updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : undefined,
  }
}

function readSettingsCache(): BackupSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_CACHE_KEY)
    return raw ? normalizeSettings(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeSettingsCache(settings: BackupSettings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_CACHE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

/**
 * Reads the shared schedule from Supabase (backup_settings, row id=1).
 * Falls back to the last-known cached copy (then hard defaults) if offline
 * or the table isn't reachable, so reminder checks still work without a
 * network hiccup breaking the app.
 */
export async function getBackupSettings(): Promise<BackupSettings> {
  try {
    const { data, error } = await (supabase as any)
      .from('backup_settings')
      .select('daily, weekly, monthly, updated_at')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle()
    if (error) throw error
    const settings = normalizeSettings(data)
    writeSettingsCache(settings)
    return settings
  } catch {
    return readSettingsCache() ?? { ...DEFAULT_BACKUP_SETTINGS }
  }
}

export async function saveBackupSettings(settings: Omit<BackupSettings, 'updated_at'>): Promise<BackupSettings> {
  const next: BackupSettings = { ...settings, updated_at: new Date().toISOString() }
  const { error } = await (supabase as any)
    .from('backup_settings')
    .upsert({ id: SETTINGS_ROW_ID, ...next }, { onConflict: 'id' })
  if (error) throw new Error(`Could not save backup schedule: ${error.message}`)
  writeSettingsCache(next)
  return next
}

/** "Last backup from this device" shown in Card 1 — deliberately per-device
 * (it answers "did I personally just back up from here", not the shared
 * fact — see deviceBackup.ts getDriveBackupStatus() for the shared truth
 * used by the Dashboard health tile and overdue detection). */
export function getLastBackupAt(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY)
    return raw ? parseISO(raw) : null
  } catch {
    return null
  }
}

/**
 * Stamp a completed device backup. Updates the local "last backup from this
 * device" timestamp and, when a category is given, clears this device's own
 * reminder markers so its banner/notification clears immediately (overdue
 * detection itself is Drive-based now, so other devices self-resolve too on
 * their next check — this is just for snappier same-device UI feedback).
 */
export function markBackupDone(category?: BackupCategory) {
  const now = new Date().toISOString()
  try {
    localStorage.setItem(LAST_BACKUP_KEY, now)
    if (category) {
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

/** Shape of deviceBackup.ts's DriveBackupStatus, duplicated here (not
 * imported) to avoid a circular dependency between the two modules. */
export interface DriveBackupTimes {
  lastBackupAt: Date | null
  perCategory: Record<BackupCategory, Date | null>
}

/**
 * Every category that is currently overdue (its scheduled instant passed
 * with no backup done for that category since), using Drive as the ground
 * truth for "was a backup actually done" — the shared fact every device
 * agrees on, not each device's own memory. Baselines against
 * settings.updated_at too, so enabling a schedule never instantly flags an
 * instant from before it was configured.
 */
export function getOverdueCategories(
  settings: BackupSettings,
  drive: DriveBackupTimes,
  now: Date = new Date()
): OverdueCategory[] {
  const settingsUpdated = settings.updated_at ? parseISO(settings.updated_at) : null
  const result: OverdueCategory[] = []

  for (const category of BACKUP_CATEGORIES) {
    const schedule = settings[category]
    if (!schedule.enabled) continue

    const prev = getPreviousScheduledInstant(category, schedule, now)
    // Any backup counts toward "am I overdue" — a plain manual Download/Upload
    // (untagged, or from any other device) reasonably satisfies a pending
    // Daily/Weekly/Monthly nudge too, not just a category-tagged one from
    // this same device. Baseline is the latest of: this category's own last
    // Drive backup, the overall last Drive backup, and when the schedule was
    // (re)configured.
    let baseline = drive.perCategory[category]
    if (drive.lastBackupAt && (!baseline || isAfter(drive.lastBackupAt, baseline))) baseline = drive.lastBackupAt
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

// --- Restore drill (P5): a backup you never test isn't a backup. -----------

const RESTORE_DRILL_KEY = 'clinicmx_last_restore_drill_at'
const DRILL_NUDGED_KEY = 'clinicmx_restore_drill_nudged_at'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** Stamped whenever a restore dry-run analysis completes (see analyzeRestore). */
export function markRestoreDrillDone() {
  try {
    localStorage.setItem(RESTORE_DRILL_KEY, new Date().toISOString())
  } catch {
    // ignore
  }
}

export function getLastRestoreDrillAt(): Date | null {
  try {
    const raw = localStorage.getItem(RESTORE_DRILL_KEY)
    return raw ? parseISO(raw) : null
  } catch {
    return null
  }
}

/** True when it's time for the monthly "try a restore dry-run" nudge. */
export function shouldNudgeRestoreDrill(now: Date = new Date()): boolean {
  if (!getLastBackupAt()) return false // nothing to drill against yet
  const drill = getLastRestoreDrillAt()
  if (drill && now.getTime() - drill.getTime() < THIRTY_DAYS_MS) return false
  try {
    const nudged = localStorage.getItem(DRILL_NUDGED_KEY)
    if (nudged && now.getTime() - parseISO(nudged).getTime() < THIRTY_DAYS_MS) return false
  } catch {
    // fall through
  }
  return true
}

export function markRestoreDrillNudged() {
  try {
    localStorage.setItem(DRILL_NUDGED_KEY, new Date().toISOString())
  } catch {
    // ignore
  }
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
