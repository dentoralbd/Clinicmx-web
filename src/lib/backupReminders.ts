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
  /** Sitewide backup encryption — shared across every device (see
   * deviceBackup.ts getBackupEncryption/setBackupEncryption). Was previously
   * per-device (secureLocalStorage keyed to a random per-browser actor id),
   * which meant two devices could disagree on whether to encrypt and with
   * what passphrase — fixed 2026-08-10 by moving it into this same shared row. */
  encryptEnabled: boolean
  passphrase: string | null
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
  encryptEnabled: false,
  passphrase: null,
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
    // DB columns are snake_case (encrypt_enabled); the settings cache round-trips
    // through JSON.stringify of this same normalized (camelCase) shape, so both
    // spellings are accepted here.
    encryptEnabled:
      typeof parsed.encryptEnabled === 'boolean'
        ? parsed.encryptEnabled
        : typeof parsed.encrypt_enabled === 'boolean'
          ? (parsed.encrypt_enabled as boolean)
          : false,
    passphrase:
      typeof parsed.passphrase === 'string' && parsed.passphrase
        ? parsed.passphrase
        : null,
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
      .select('daily, weekly, monthly, encrypt_enabled, passphrase, updated_at')
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
  const { error } = await (supabase as any).from('backup_settings').upsert(
    {
      id: SETTINGS_ROW_ID,
      daily: next.daily,
      weekly: next.weekly,
      monthly: next.monthly,
      encrypt_enabled: next.encryptEnabled,
      passphrase: next.passphrase,
      updated_at: next.updated_at,
    },
    { onConflict: 'id' }
  )
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
      localStorage.removeItem(autoRetryKey(category))
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

// --- Auto-upload claim (prevents two sessions racing the same instant) -----

const DEVICE_ID_KEY = 'clinicmx_device_id'
// A claim older than this is stealable — recovers a category whose claiming
// session died mid-upload instead of wedging it forever. Same value as the
// offline-sync outbox's claimMutation() (offlineSync.ts) for consistency.
const CLAIM_STALE_MS = 10 * 60 * 1000
const CLAIM_RELEASED_AT = '1970-01-01T00:00:00Z'

/** Stable per-browser id, shared with offlineSync.ts (same localStorage key)
 * — diagnostics/claim-ownership only, never security-relevant (RLS never
 * checks this). */
function getDeviceId(): string {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return 'unknown'
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/**
 * Atomic compare-and-swap so two sessions (two tabs, two devices, admin +
 * operator) can never both auto-upload the same scheduled instant — replaces
 * a check-then-upload read, which is a race (both see "not done yet", both
 * upload). Postgres row-locks serialize concurrent claim attempts; the loser
 * sees zero rows updated and should skip the upload entirely (not just the
 * notification). True = this session now holds the claim, proceed. False =
 * someone else holds an active claim on this exact instant, or the claim
 * table is unreachable/predates migration 060 — fail closed (skip) rather
 * than risk a duplicate, since a missed auto-upload just means the plain
 * "overdue" reminder banner catches it on the next check cycle instead.
 */
export async function claimBackupUpload(category: BackupCategory, instant: Date): Promise<boolean> {
  try {
    const instantIso = instant.toISOString()
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
    const { data, error } = await (supabase as any)
      .from('backup_upload_claims')
      .update({ instant: instantIso, claimed_at: new Date().toISOString(), claimed_by_device: getDeviceId() })
      .eq('category', category)
      .or(`instant.neq.${instantIso},claimed_at.lt.${staleBefore}`)
      .select('category')
    if (error) return false
    return !!(data && data.length > 0)
  } catch {
    return false
  }
}

/**
 * Releases a claim this device took but then failed to upload, so a retry
 * (this device on its next check, or another device) isn't blocked by our
 * own claim until CLAIM_STALE_MS passes. Mirrors offlineSync.ts's
 * releaseClaim() for the same release-on-failure reasoning. Only clears the
 * row if this device is still the one holding it (claimed_by_device match)
 * — never steal/clear a claim another device has since taken. Best-effort;
 * never throws.
 *
 * claimed_at goes back to the epoch (migration 060's own seed value), NOT
 * null: the column is NOT NULL, so a null update is rejected outright and
 * the claim silently stays held. The epoch also satisfies claimBackupUpload's
 * `claimed_at.lt.<stale>` test, so the instant is re-claimable immediately.
 */
export async function releaseBackupClaim(category: BackupCategory, instant: Date): Promise<void> {
  try {
    const { error } = await (supabase as any)
      .from('backup_upload_claims')
      .update({ claimed_at: CLAIM_RELEASED_AT, claimed_by_device: null })
      .eq('category', category)
      .eq('instant', instant.toISOString())
      .eq('claimed_by_device', getDeviceId())
    if (error) console.warn('[BackupReminders] Could not release backup claim:', error.message)
  } catch (err) {
    console.warn('[BackupReminders] Could not release backup claim:', err)
  }
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
 *
 * Smart-upload (autoUpload) schedules only count their OWN category's
 * backups. Before 2026-10-01 any backup counted for every schedule, which
 * silently dropped failed scheduled uploads: on Monday 2026-09-28 the Daily
 * upload succeeded, the Weekly one right after it failed, and on the next
 * check that Daily file "satisfied" the Weekly — so it was never retried and
 * no weekly-tagged file (which upload-backup.ts retains separately, 5 deep)
 * was made that week. Reminder-only schedules keep "any backup counts": a
 * manual upload is a perfectly good answer to a "please back up" nudge.
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
    // Reminder-only schedules: any backup counts toward "am I overdue" — a
    // plain manual Download/Upload (untagged, or from any other device)
    // reasonably satisfies a pending Daily/Weekly/Monthly nudge too. Baseline
    // is the latest of: this category's own last Drive backup, the overall
    // last Drive backup, and when the schedule was (re)configured.
    // Smart-upload schedules skip the "overall last backup" term — see above.
    let baseline = drive.perCategory[category]
    if (
      !schedule.autoUpload &&
      drive.lastBackupAt &&
      (!baseline || isAfter(drive.lastBackupAt, baseline))
    ) {
      baseline = drive.lastBackupAt
    }
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

/**
 * Rolls back markNotified() when an auto-upload attempt fails after being
 * marked — without this, a transient failure (lost claim, thrown upload,
 * tab closed mid-request) permanently downgrades that scheduled instant to
 * manual-banner-only in this browser, since shouldNotifyFor() would
 * otherwise never see it as un-notified again. Found live 2026-08-22.
 */
export function clearNotified(category: BackupCategory) {
  try {
    localStorage.removeItem(notifiedForKey(category))
  } catch {
    // ignore
  }
}

// --- Smart-upload retry backoff --------------------------------------------
// A failed auto-upload is retried after 2, 5, 15 and 30 minutes (5 attempts
// in all), then gives up to the manual overdue banner. Without a cap, a
// lasting outage (Google down, clinic offline) retried — and posted a fresh
// "auto-upload failed" notification + browser push — every single minute.
// Per-browser state: each device backs off on its own; the claim (above)
// still stops two devices from uploading the same instant at once.

const AUTO_RETRY_DELAYS_MIN = [2, 5, 15, 30]
export const AUTO_UPLOAD_MAX_ATTEMPTS = AUTO_RETRY_DELAYS_MIN.length + 1
const autoRetryKey = (c: BackupCategory) => `clinicmx_backup_autoretry_${c}`

interface AutoRetryState {
  instant: string
  attempts: number
  nextAt: string | null
}

function readAutoRetry(category: BackupCategory, instant: Date): AutoRetryState | null {
  try {
    const raw = localStorage.getItem(autoRetryKey(category))
    const state = raw ? (JSON.parse(raw) as AutoRetryState) : null
    // State from an older scheduled instant is irrelevant to this one.
    return state && state.instant === instant.toISOString() ? state : null
  } catch {
    return null
  }
}

/** Failed attempts so far for this scheduled instant (0 if none). */
export function getAutoUploadAttempts(category: BackupCategory, instant: Date): number {
  return readAutoRetry(category, instant)?.attempts ?? 0
}

/** True unless an earlier attempt at this same instant failed and its backoff hasn't elapsed. */
export function isAutoRetryDue(category: BackupCategory, instant: Date, now: Date = new Date()): boolean {
  const state = readAutoRetry(category, instant)
  if (!state) return true
  if (!state.nextAt) return false // retries used up
  return now.getTime() >= new Date(state.nextAt).getTime()
}

/** Records one failed attempt. `nextAt` is when to try again, or null once
 * AUTO_UPLOAD_MAX_ATTEMPTS is reached (fall back to the manual banner). */
export function recordAutoUploadFailure(
  category: BackupCategory,
  instant: Date,
  now: Date = new Date()
): { attempts: number; nextAt: Date | null } {
  const attempts = getAutoUploadAttempts(category, instant) + 1
  const delayMin = AUTO_RETRY_DELAYS_MIN[attempts - 1]
  const nextAt = delayMin !== undefined ? new Date(now.getTime() + delayMin * 60_000) : null
  try {
    const state: AutoRetryState = {
      instant: instant.toISOString(),
      attempts,
      nextAt: nextAt ? nextAt.toISOString() : null,
    }
    localStorage.setItem(autoRetryKey(category), JSON.stringify(state))
  } catch {
    // ignore — without storage this device just retries on the next check
  }
  return { attempts, nextAt }
}

export function clearAutoRetry(category: BackupCategory) {
  try {
    localStorage.removeItem(autoRetryKey(category))
  } catch {
    // ignore
  }
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
