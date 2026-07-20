import { format } from 'date-fns'
import { supabase } from './supabase'
import { getScopedStorageKey } from './appSession'
import { readSecureJson, writeSecureJson } from './secureLocalStorage'
import { loadDoctorProfile, saveDoctorProfile, type DoctorProfileData } from './doctorProfile'
import { MEMORY_KEYS, getMemory } from './prescriptionMemory'
import {
  getComplaintTemplates,
  getExaminationTemplates,
  getInvestigationSectionTemplates,
  getMedicationSectionTemplates,
} from './prescriptionSectionTemplates'
import { markBackupDone, markRestoreDrillDone, type BackupCategory } from './backupReminders'
import { sha256Hex } from './backupCrypto'

/**
 * All backed-up tables in foreign-key dependency order (parents first), same
 * ordering as scripts/backup/lib.mjs TABLES_IN_DEPENDENCY_ORDER minus
 * doctor_profiles (unreadable with the anon key; its localStorage copy is
 * backed up in local_settings instead).
 */
export const BACKUP_TABLES = [
  'patients',
  'medication_templates',
  'investigation_templates',
  'inventory_items',
  'invoice_templates',
  'payment_methods',
  'invoice_settings',
  'app_users',
  'authorized_ips',
  'delete_history',
  'edit_history',
  'activity_log',
  'appointments',
  'patient_visits',
  'patient_files',
  'dental_records',
  'prescriptions',
  'invoices',
  'treatments',
  'lab_work',
  'payments',
  'payment_plans',
  'invoice_history',
  'inventory_movements',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

export const BACKUP_KIND = 'clinicmx-device-backup'
export const BACKUP_VERSION = 1

type Row = Record<string, unknown> & { id: string | number }

// Section keys match the private storage-key suffixes in
// prescriptionSectionTemplates.ts (STORAGE_PREFIX ':' section).
const TEMPLATE_SECTIONS = ['chief_complaint', 'on_examination', 'medications', 'investigations'] as const
type TemplateSection = (typeof TEMPLATE_SECTIONS)[number]
const PRESCRIPTION_TEMPLATES_PREFIX = 'clinicmx_prescription_templates'

export interface DeviceBackup {
  kind: typeof BACKUP_KIND
  version: number
  app: string
  created_at: string
  counts: Record<string, number>
  tables: Record<string, Row[]>
  local_settings: {
    doctor_profile: DoctorProfileData | null
    prescription_memory: Record<string, string[]>
    prescription_templates: Record<TemplateSection, unknown[]>
  }
}

export type BackupProgress = { table: string; index: number; total: number }

export async function fetchAllRows(table: string, onPage?: (fetched: number) => void): Promise<Row[]> {
  const pageSize = 1000
  const rows: Row[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`)
    rows.push(...(data as Row[]))
    onPage?.(rows.length)
    if ((data as Row[]).length < pageSize) break
  }
  return rows
}

// ---------------------------------------------------------------------------
// Encryption setting (P3). The passphrase lives ONLY in this device's
// encrypted secureLocalStorage; losing it makes encrypted backups unreadable.

const ENCRYPT_ENABLED_KEY = 'clinicmx_backup_encrypt'
const PASSPHRASE_STORAGE_KEY = 'clinicmx_backup_passphrase'

export async function getBackupEncryption(): Promise<{ enabled: boolean; passphrase: string | null }> {
  // Defaults to true on a device that's never touched this setting (nudges
  // toward encryption being the norm), but a passphrase still has to be set
  // before anything is actually encrypted — see buildSerializedBackup's
  // `enabled && passphrase` check. An explicit 'false' (the user turned it
  // off) is respected and distinguished from "never set".
  let enabled = true
  try {
    const raw = localStorage.getItem(ENCRYPT_ENABLED_KEY)
    if (raw !== null) enabled = raw === 'true'
  } catch {
    // ignore
  }
  const stored = await readSecureJson<{ passphrase: string }>(getScopedStorageKey(PASSPHRASE_STORAGE_KEY))
  return { enabled, passphrase: stored?.passphrase ?? null }
}

export async function setBackupEncryption(enabled: boolean, passphrase?: string) {
  try {
    localStorage.setItem(ENCRYPT_ENABLED_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore
  }
  if (passphrase !== undefined) {
    await writeSecureJson(getScopedStorageKey(PASSPHRASE_STORAGE_KEY), { passphrase })
  }
}

// ---------------------------------------------------------------------------
// Anomaly tripwire (P2): remember each successful backup's row counts and
// flag suspicious shrinkage of core tables before the next backup is written.

const LAST_COUNTS_KEY = 'clinicmx_last_backup_counts'
const CORE_TABLES = ['patients', 'appointments', 'treatments', 'prescriptions', 'invoices', 'payments']

export interface CountDrop {
  table: string
  from: number
  to: number
}

export function detectCountDrops(counts: Record<string, number>): CountDrop[] {
  let previous: { counts?: Record<string, number> } | null = null
  try {
    previous = JSON.parse(localStorage.getItem(LAST_COUNTS_KEY) || 'null')
  } catch {
    return []
  }
  if (!previous?.counts) return []
  const drops: CountDrop[] = []
  for (const table of CORE_TABLES) {
    const from = previous.counts[table]
    const to = counts[table]
    if (typeof from === 'number' && typeof to === 'number' && from - to >= 3 && to < from * 0.8) {
      drops.push({ table, from, to })
    }
  }
  return drops
}

function saveLastBackupCounts(counts: Record<string, number>) {
  try {
    localStorage.setItem(LAST_COUNTS_KEY, JSON.stringify({ counts, at: new Date().toISOString() }))
  } catch {
    // ignore
  }
}

/** Fast head-only count of every table (parallel) — powers the anomaly check
 * and the backup header without fetching any row data. */
export async function fetchTableCounts(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    BACKUP_TABLES.map(async (table) => {
      const { count, error } = await (supabase as any)
        .from(table)
        .select('id', { count: 'exact', head: true })
      if (error) throw new Error(`Failed to count ${table}: ${error.message}`)
      return [table, count ?? 0] as const
    })
  )
  return Object.fromEntries(entries)
}

// ---------------------------------------------------------------------------
// Serialization (P3 + scalability): all CPU-heavy work (stringify, gzip,
// encrypt, hash) happens in a Web Worker so the UI never freezes, and the
// JSON is streamed into the compressor table-by-table so peak memory stays
// bounded even at 3000+ patients. See src/workers/backupWorker.ts.

function spawnBackupWorker(): Worker {
  return new Worker(new URL('../workers/backupWorker.ts', import.meta.url), { type: 'module' })
}

export interface SerializedBackup {
  bytes: Uint8Array
  filename: string
  sha256: string
  counts: Record<string, number>
  encrypted: boolean
}

/**
 * Fetches all tables (paginated, network-bound — non-blocking) and streams
 * them into the worker for serialization. Returns null if `onAnomaly`
 * declined to continue after a suspicious count drop.
 */
export async function buildSerializedBackup(options?: {
  category?: BackupCategory
  onProgress?: (p: BackupProgress) => void
  onAnomaly?: (drops: CountDrop[]) => Promise<boolean>
}): Promise<SerializedBackup | null> {
  const counts = await fetchTableCounts()

  const drops = detectCountDrops(counts)
  if (drops.length > 0 && options?.onAnomaly) {
    const proceed = await options.onAnomaly(drops)
    if (!proceed) return null
  }

  const { enabled, passphrase } = await getBackupEncryption()
  const activePassphrase = enabled && passphrase ? passphrase : null

  const worker = spawnBackupWorker()
  try {
    let failed = false
    const done = new Promise<{ buffer: ArrayBuffer; sha256: string; encrypted: boolean }>((resolve, reject) => {
      worker.onmessage = (e) => {
        const d = e.data
        if (d.type === 'serialized') resolve(d)
        else if (d.type === 'error') reject(new Error(d.message))
      }
      worker.onerror = () => reject(new Error('Backup worker crashed.'))
    })
    done.catch(() => {
      failed = true
    })

    worker.postMessage({
      type: 'serialize-start',
      meta: {
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        app: 'clinicmx-web',
        created_at: new Date().toISOString(),
        counts,
      },
      passphrase: activePassphrase,
    })

    for (let i = 0; i < BACKUP_TABLES.length && !failed; i++) {
      const table = BACKUP_TABLES[i]
      options?.onProgress?.({ table, index: i + 1, total: BACKUP_TABLES.length })
      const rows = await fetchAllRows(table)
      worker.postMessage({ type: 'serialize-table', table, rows })
    }

    const [doctorProfile, complaints, examinations, medications, investigations] = await Promise.all([
      loadDoctorProfile(),
      getComplaintTemplates(),
      getExaminationTemplates(),
      getMedicationSectionTemplates(),
      getInvestigationSectionTemplates(),
    ])
    worker.postMessage({
      type: 'serialize-finish',
      localSettings: {
        doctor_profile: doctorProfile ?? null,
        prescription_memory: {
          [MEMORY_KEYS.COMPLAINTS]: getMemory(MEMORY_KEYS.COMPLAINTS),
          [MEMORY_KEYS.EXAMINATIONS]: getMemory(MEMORY_KEYS.EXAMINATIONS),
          [MEMORY_KEYS.MEDICATIONS]: getMemory(MEMORY_KEYS.MEDICATIONS),
          [MEMORY_KEYS.INVESTIGATIONS]: getMemory(MEMORY_KEYS.INVESTIGATIONS),
        },
        prescription_templates: {
          chief_complaint: complaints,
          on_examination: examinations,
          medications,
          investigations,
        },
      },
    })

    const { buffer, sha256, encrypted } = await done
    return {
      bytes: new Uint8Array(buffer),
      filename: backupFileName(new Date(), options?.category, encrypted),
      sha256,
      counts,
      encrypted,
    }
  } finally {
    worker.terminate()
  }
}

// Manual backups (the plain Download/Upload buttons) stay untagged. Scheduled
// daily/weekly/monthly backups (auto or reminder-triggered) get a category
// segment so they can be told apart — during restore and for per-category
// retention (see functions/api/upload-backup.ts pruneOldUploads). The time
// (no colons — Windows forbids them in filenames) is included alongside the
// date so more than one backup on the same day never collides/overwrites.
// New backups are gzipped (.json.gz) or encrypted (.json.enc); plain .json
// stays accepted everywhere for older backups.
export function backupFileName(date: Date = new Date(), category?: BackupCategory, encrypted = false) {
  const stamp = format(date, 'yyyy-MM-dd-HHmmss')
  const ext = encrypted ? '.json.enc' : '.json.gz'
  return category ? `clinicmx-backup-${category}-${stamp}${ext}` : `clinicmx-backup-${stamp}${ext}`
}

const FILENAME_PATTERN =
  /^clinicmx-backup-(?:(daily|weekly|monthly)-)?\d{4}-\d{2}-\d{2}-\d{6}\.json(?:\.gz|\.enc)?$/

/** Parses the category tag out of a backup filename, or 'manual' if untagged. */
export function parseBackupCategory(filename: string): BackupCategory | 'manual' {
  const match = FILENAME_PATTERN.exec(filename)
  return (match?.[1] as BackupCategory | undefined) ?? 'manual'
}

export function downloadSerializedBackup(serialized: SerializedBackup, category?: BackupCategory) {
  const blob = new Blob([serialized.bytes as BlobPart], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = serialized.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  markBackupDone(category)
  saveLastBackupCounts(serialized.counts)
  return serialized.filename
}

const AUTO_PRUNE_KEY = 'clinicmx_backup_autoprune'

// Off by default — deleting Drive files is a one-way action, so this only
// takes effect once the user explicitly opts in from the Backup & Restore page.
export function getAutoPruneEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_PRUNE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setAutoPruneEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_PRUNE_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore (e.g. private browsing / storage disabled)
  }
}

export interface UploadResult {
  name: string
  webViewLink?: string
  /** true when the re-downloaded bytes hash-matched what we sent (P2). */
  verified: boolean
}

// Uploads via the same-origin Cloudflare Pages Function (functions/api/upload-backup.ts),
// which holds the Google credentials server-side — no Google login in the browser,
// so this also works inside the Android WebView APK where OAuth popups are blocked.
// Sends the serialized bytes raw (gzip/encrypted), then re-downloads and
// SHA-256-compares them to verify the backup actually landed intact.
export async function uploadSerializedBackup(
  serialized: SerializedBackup,
  category?: BackupCategory
): Promise<UploadResult> {
  const params = new URLSearchParams({ filename: serialized.filename })
  if (getAutoPruneEnabled()) params.set('prune', '1')

  let response: Response
  try {
    response = await fetch(`/api/upload-backup?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: serialized.bytes as unknown as BodyInit,
    })
  } catch {
    throw new Error('Could not reach the upload service. Check your internet connection.')
  }
  let body: { ok?: boolean; name?: string; webViewLink?: string; id?: string; error?: string } | null = null
  try {
    body = await response.json()
  } catch {
    // Non-JSON response (e.g. 404 HTML when the function isn't deployed)
  }
  if (!response.ok || !body?.ok) {
    if (response.status === 404) {
      throw new Error('Upload service not available on this deployment.')
    }
    throw new Error(body?.error || `Upload failed (HTTP ${response.status}).`)
  }

  // Verification (P2): re-download by id and compare hashes. Best-effort — a
  // verification hiccup doesn't undo a successful upload, it just reports
  // verified: false so the UI/notification can flag it.
  let verified = false
  if (body.id) {
    try {
      const check = await fetch(`/api/download-backup?id=${encodeURIComponent(body.id)}`)
      if (check.ok) {
        const echoed = new Uint8Array(await check.arrayBuffer())
        verified = (await sha256Hex(echoed)) === serialized.sha256
      }
    } catch {
      // leave verified = false
    }
  }

  markBackupDone(category)
  saveLastBackupCounts(serialized.counts)
  return { name: body.name || serialized.filename, webViewLink: body.webViewLink, verified }
}

export interface DriveBackupFile {
  id: string
  name: string
  size: number
  modifiedTime?: string
}

// Lists backups in Drive's device-backups folder via the same-origin
// Cloudflare Pages Function (functions/api/list-backups.ts) — newest first.
export async function listBackupsFromDrive(): Promise<DriveBackupFile[]> {
  let response: Response
  try {
    response = await fetch('/api/list-backups')
  } catch {
    throw new Error('Could not reach Google Drive. Check your internet connection.')
  }
  let body: { ok?: boolean; files?: DriveBackupFile[]; error?: string } | null = null
  try {
    body = await response.json()
  } catch {
    // Non-JSON response (e.g. 404 HTML when the function isn't deployed)
  }
  if (!response.ok || !body?.ok) {
    if (response.status === 404) {
      throw new Error('Backup listing is not available on this deployment.')
    }
    throw new Error(body?.error || `Listing backups failed (HTTP ${response.status}).`)
  }
  return body.files || []
}

export interface DriveBackupStatus {
  /** Most recent backup of any kind, anywhere — the one true "last backup"
   * every device agrees on (unlike getLastBackupAt(), which is per-device
   * localStorage and only knows about backups *this browser* made). */
  lastBackupAt: Date | null
  perCategory: Record<BackupCategory, Date | null>
}

/**
 * Ground-truth backup freshness, read directly from Drive instead of
 * localStorage. Two browsers/devices checking this always see the same
 * answer, because it reflects what's actually in the shared Drive folder —
 * not which device happened to run the upload.
 */
export async function getDriveBackupStatus(): Promise<DriveBackupStatus> {
  const files = await listBackupsFromDrive()
  const perCategory: Record<BackupCategory, Date | null> = { daily: null, weekly: null, monthly: null }
  let lastBackupAt: Date | null = null

  for (const f of files) {
    if (!f.modifiedTime) continue
    const modified = new Date(f.modifiedTime)
    if (!lastBackupAt || modified > lastBackupAt) lastBackupAt = modified
    const category = parseBackupCategory(f.name)
    if (category !== 'manual' && (!perCategory[category] || modified > perCategory[category]!)) {
      perCategory[category] = modified
    }
  }

  return { lastBackupAt, perCategory }
}

// Fetches one Drive backup's content and wraps it as a File so it can feed
// straight into the same parseBackupFile/handleFileChosen path used for a
// locally-picked file — the rest of the restore flow needs no changes.
// Must preserve raw bytes (gzip/encrypted formats), so no text() here.
export async function fetchBackupFromDrive(id: string, name: string): Promise<File> {
  let response: Response
  try {
    response = await fetch(`/api/download-backup?id=${encodeURIComponent(id)}`)
  } catch {
    throw new Error('Could not reach Google Drive. Check your internet connection.')
  }
  if (!response.ok) {
    let error: string | undefined
    try {
      error = (await response.json())?.error
    } catch {
      // ignore
    }
    throw new Error(error || `Downloading backup failed (HTTP ${response.status}).`)
  }
  const bytes = await response.arrayBuffer()
  return new File([bytes], name, { type: 'application/octet-stream' })
}

export type ParseResult =
  | { ok: true; backup: DeviceBackup; warnings: string[]; encrypted: boolean }
  | { ok: false; error: string; needsPassphrase?: boolean }

/**
 * Decodes any backup format (legacy plain .json, gzipped .json.gz, encrypted
 * .json.enc) in the Web Worker — decrypt/gunzip/JSON.parse never block the
 * UI, even for 100 MB+ files. When the file is encrypted and no working
 * passphrase is available, returns needsPassphrase so the UI can ask.
 */
export async function parseBackupFile(file: File, passphraseOverride?: string): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const passphrase = passphraseOverride ?? (await getBackupEncryption()).passphrase

  const worker = spawnBackupWorker()
  let parsed: unknown
  let encrypted = false
  try {
    const result = await new Promise<{ backup?: unknown; encrypted?: boolean; needsPassphrase?: boolean }>(
      (resolve, reject) => {
        worker.onmessage = (e) => {
          const d = e.data
          if (d.type === 'parsed') resolve({ backup: d.backup, encrypted: d.encrypted })
          else if (d.type === 'needs-passphrase') resolve({ needsPassphrase: true })
          else if (d.type === 'error') reject(new Error(d.message))
        }
        worker.onerror = () => reject(new Error('Backup worker crashed.'))
        worker.postMessage({ type: 'parse', buffer, passphrase }, [buffer])
      }
    )
    if (result.needsPassphrase) {
      return { ok: false, needsPassphrase: true, error: 'This backup is encrypted — enter its passphrase to continue.' }
    }
    parsed = result.backup
    encrypted = !!result.encrypted
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read this file.'
    if (message.includes('passphrase')) {
      return { ok: false, needsPassphrase: true, error: message }
    }
    return { ok: false, error: 'This file is not a readable ClinicMx backup. Choose a clinicmx-backup-… file.' }
  } finally {
    worker.terminate()
  }

  const backup = parsed as DeviceBackup
  if (!backup || typeof backup !== 'object' || backup.kind !== BACKUP_KIND) {
    return { ok: false, error: 'This file is not a ClinicMx device backup.' }
  }
  if (typeof backup.version !== 'number' || !backup.tables || typeof backup.tables !== 'object') {
    return { ok: false, error: 'This backup file is malformed (missing version or tables).' }
  }

  const warnings: string[] = []
  if (backup.version > BACKUP_VERSION) {
    warnings.push(
      `This backup was made by a newer app version (format v${backup.version} vs v${BACKUP_VERSION}) — restore may skip data it doesn't understand.`
    )
  }

  const knownTables = new Set<string>(BACKUP_TABLES)
  for (const [name, rows] of Object.entries(backup.tables)) {
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || !('id' in r))) {
      return { ok: false, error: `This backup file is malformed (table "${name}" is not a list of records).` }
    }
    if (!knownTables.has(name)) {
      warnings.push(`Table "${name}" in the backup is unknown to this app version and will be skipped.`)
    }
  }

  return { ok: true, backup, warnings, encrypted }
}

export interface TableAnalysis {
  table: BackupTable
  inBackup: number
  existing: number
  missing: number
  missingRows: Row[]
  allRows: Row[]
}

export interface RestoreAnalysis {
  backup: DeviceBackup
  tables: TableAnalysis[]
  hasLocalSettings: boolean
}

const CHUNK = 500

/**
 * Bulk-fetches every id currently in `table` (paginated, same cheap pattern
 * as fetchAllRows). This scales with table size, not backup size — a table
 * with 50,000 rows takes ~50 requests total, vs. checking backup ids via
 * .in() in small batches (which also risks 400s once enough uuids overflow
 * the URL). Cost is comparable to the table's own `id` column, not its
 * full row width, so it stays fast as clinics grow to thousands of patients.
 */
async function fetchAllIds(table: string): Promise<Set<string>> {
  const ids = new Set<string>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to check existing records in ${table}: ${error.message}`)
    for (const row of data as Array<{ id: string | number }>) ids.add(String(row.id))
    if ((data as unknown[]).length < pageSize) break
  }
  return ids
}

export async function analyzeRestore(
  backup: DeviceBackup,
  onProgress?: (p: BackupProgress) => void
): Promise<RestoreAnalysis> {
  const analyses: TableAnalysis[] = []
  const present = BACKUP_TABLES.filter((t) => Array.isArray(backup.tables[t]))

  for (let i = 0; i < present.length; i++) {
    const table = present[i]
    onProgress?.({ table, index: i + 1, total: present.length })
    const allRows = backup.tables[table] as Row[]
    const existingIds = await fetchAllIds(table)
    const missingRows = allRows.filter((r) => !existingIds.has(String(r.id)))
    const existingCount = allRows.length - missingRows.length
    analyses.push({
      table,
      inBackup: allRows.length,
      existing: existingCount,
      missing: missingRows.length,
      missingRows,
      allRows,
    })
  }

  const ls = backup.local_settings
  const hasLocalSettings = Boolean(
    ls && typeof ls === 'object' && (ls.doctor_profile || ls.prescription_memory || ls.prescription_templates)
  )

  // A completed dry-run counts as a restore drill (P5) — the point is that
  // the admin regularly exercises the restore path and sees it working.
  markRestoreDrillDone()

  return { backup, tables: analyses, hasLocalSettings }
}

export type RestoreMode = 'insert-missing' | 'overwrite'

export interface TableRestoreResult {
  table: string
  attempted: number
  written: number
  skippedExisting: number
  droppedColumns: string[]
  error?: string
}

export interface RestoreOutcome {
  tables: TableRestoreResult[]
  localSettings?: { restored: string[]; error?: string }
}

/**
 * Extracts the column name from PostgREST/Postgres unknown-column errors so a
 * backup made on a different schema version can be restored by dropping the
 * unknown column and retrying (runtime equivalent of a sanitize allowlist).
 */
function unknownColumnFrom(error: { code?: string; message?: string }): string | null {
  const message = error.message || ''
  if (error.code === 'PGRST204') {
    const m = message.match(/Could not find the '([^']+)' column/)
    if (m) return m[1]
  }
  if (error.code === '42703') {
    const m = message.match(/column "([^"]+)"/)
    if (m) return m[1]
  }
  return null
}

async function upsertChunked(
  table: string,
  rows: Row[],
  ignoreDuplicates: boolean
): Promise<{ droppedColumns: string[] }> {
  const droppedColumns: string[] = []
  let working = rows

  for (let i = 0; i < working.length; i += CHUNK) {
    let chunk = working.slice(i, i + CHUNK)
    // Bounded strip-and-retry for schema drift (unknown columns in old/new backups).
    for (let attempt = 0; ; attempt++) {
      const { error } = await (supabase as any)
        .from(table)
        .upsert(chunk, { onConflict: 'id', ignoreDuplicates })
      if (!error) break
      const badColumn = attempt < 15 ? unknownColumnFrom(error) : null
      if (!badColumn) throw new Error(error.message || 'Unknown error')
      droppedColumns.push(badColumn)
      working = working.map((r) => {
        const { [badColumn]: _dropped, ...rest } = r
        return rest as Row
      })
      chunk = working.slice(i, i + CHUNK)
    }
  }
  return { droppedColumns }
}

async function restoreLocalSettingsFrom(backup: DeviceBackup): Promise<{ restored: string[]; error?: string }> {
  const restored: string[] = []
  const ls = backup.local_settings
  try {
    if (ls?.doctor_profile && typeof ls.doctor_profile === 'object' && ls.doctor_profile.full_name !== undefined) {
      await saveDoctorProfile(ls.doctor_profile)
      restored.push('doctor profile')
    }
    if (ls?.prescription_memory && typeof ls.prescription_memory === 'object') {
      const validKeys = Object.values(MEMORY_KEYS)
      for (const [key, value] of Object.entries(ls.prescription_memory)) {
        if (validKeys.includes(key) && Array.isArray(value) && value.every((v) => typeof v === 'string')) {
          localStorage.setItem(key, JSON.stringify(value))
        }
      }
      restored.push('prescription memory')
    }
    if (ls?.prescription_templates && typeof ls.prescription_templates === 'object') {
      for (const section of TEMPLATE_SECTIONS) {
        const templates = (ls.prescription_templates as Record<string, unknown>)[section]
        if (Array.isArray(templates)) {
          await writeSecureJson(getScopedStorageKey(`${PRESCRIPTION_TEMPLATES_PREFIX}:${section}`), templates)
        }
      }
      restored.push('prescription templates')
    }
    return { restored }
  } catch (error) {
    return { restored, error: error instanceof Error ? error.message : 'Failed to restore app settings' }
  }
}

export async function executeRestore(
  analysis: RestoreAnalysis,
  mode: RestoreMode,
  options: { restoreLocalSettings: boolean },
  onProgress?: (p: BackupProgress) => void
): Promise<RestoreOutcome> {
  const results: TableRestoreResult[] = []

  for (let i = 0; i < analysis.tables.length; i++) {
    const t = analysis.tables[i]
    onProgress?.({ table: t.table, index: i + 1, total: analysis.tables.length })

    const rows = mode === 'overwrite' ? t.allRows : t.missingRows
    const result: TableRestoreResult = {
      table: t.table,
      attempted: rows.length,
      written: 0,
      skippedExisting: mode === 'overwrite' ? 0 : t.existing,
      droppedColumns: [],
    }
    if (rows.length > 0) {
      try {
        // ignoreDuplicates in insert-missing mode makes re-runs and dry-run→execute
        // races harmless; overwrite mode intentionally replaces existing rows.
        const { droppedColumns } = await upsertChunked(t.table, rows, mode === 'insert-missing')
        result.written = rows.length
        result.droppedColumns = [...new Set(droppedColumns)]
      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Unknown error'
      }
    }
    results.push(result)
  }

  const outcome: RestoreOutcome = { tables: results }
  if (options.restoreLocalSettings && analysis.hasLocalSettings) {
    outcome.localSettings = await restoreLocalSettingsFrom(analysis.backup)
  }
  return outcome
}
