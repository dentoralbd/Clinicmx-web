import { format } from 'date-fns'
import { supabase } from './supabase'
import { getScopedStorageKey } from './appSession'
import { writeSecureJson } from './secureLocalStorage'
import { loadDoctorProfile, saveDoctorProfile, type DoctorProfileData } from './doctorProfile'
import { MEMORY_KEYS, getMemory } from './prescriptionMemory'
import {
  getComplaintTemplates,
  getExaminationTemplates,
  getInvestigationSectionTemplates,
  getMedicationSectionTemplates,
} from './prescriptionSectionTemplates'
import { markBackupDone, type BackupCategory } from './backupReminders'

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

export async function buildDeviceBackup(onProgress?: (p: BackupProgress) => void): Promise<DeviceBackup> {
  const tables: Record<string, Row[]> = {}
  const counts: Record<string, number> = {}

  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    const table = BACKUP_TABLES[i]
    onProgress?.({ table, index: i + 1, total: BACKUP_TABLES.length })
    const rows = await fetchAllRows(table)
    tables[table] = rows
    counts[table] = rows.length
  }

  const [doctorProfile, complaints, examinations, medications, investigations] = await Promise.all([
    loadDoctorProfile(),
    getComplaintTemplates(),
    getExaminationTemplates(),
    getMedicationSectionTemplates(),
    getInvestigationSectionTemplates(),
  ])

  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    app: 'clinicmx-web',
    created_at: new Date().toISOString(),
    counts,
    tables,
    local_settings: {
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
  }
}

// Manual backups (the plain Download/Upload buttons) stay untagged. Scheduled
// daily/weekly/monthly backups (auto or reminder-triggered) get a category
// segment so they can be told apart — during restore and for per-category
// retention (see functions/api/upload-backup.ts pruneOldUploads). The time
// (no colons — Windows forbids them in filenames) is included alongside the
// date so more than one backup on the same day never collides/overwrites.
export function backupFileName(date: Date = new Date(), category?: BackupCategory) {
  const stamp = format(date, 'yyyy-MM-dd-HHmmss')
  return category ? `clinicmx-backup-${category}-${stamp}.json` : `clinicmx-backup-${stamp}.json`
}

const FILENAME_PATTERN = /^clinicmx-backup-(?:(daily|weekly|monthly)-)?\d{4}-\d{2}-\d{2}-\d{6}\.json$/

/** Parses the category tag out of a backup filename, or 'manual' if untagged. */
export function parseBackupCategory(filename: string): BackupCategory | 'manual' {
  const match = FILENAME_PATTERN.exec(filename)
  return (match?.[1] as BackupCategory | undefined) ?? 'manual'
}

export function downloadDeviceBackup(backup: DeviceBackup, category?: BackupCategory) {
  const filename = backupFileName(new Date(), category)
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  markBackupDone(category)
  return filename
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

// Uploads via the same-origin Cloudflare Pages Function (functions/api/upload-backup.ts),
// which holds the Google credentials server-side — no Google login in the browser,
// so this also works inside the Android WebView APK where OAuth popups are blocked.
export async function uploadBackupToDrive(
  backup: DeviceBackup,
  category?: BackupCategory
): Promise<{ name: string; webViewLink?: string }> {
  const filename = backupFileName(new Date(), category)
  let response: Response
  try {
    response = await fetch('/api/upload-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, backup, prune: getAutoPruneEnabled() }),
    })
  } catch {
    throw new Error('Could not reach the upload service. Check your internet connection.')
  }
  let body: { ok?: boolean; name?: string; webViewLink?: string; error?: string } | null = null
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
  markBackupDone(category)
  return { name: body.name || filename, webViewLink: body.webViewLink }
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

// Fetches one Drive backup's content and wraps it as a File so it can feed
// straight into the same parseBackupFile/handleFileChosen path used for a
// locally-picked file — the rest of the restore flow needs no changes.
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
  const text = await response.text()
  return new File([text], name, { type: 'application/json' })
}

export type ParseResult =
  | { ok: true; backup: DeviceBackup; warnings: string[] }
  | { ok: false; error: string }

export async function parseBackupFile(file: File): Promise<ParseResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return { ok: false, error: 'This file is not valid JSON. Choose a clinicmx-backup-….json file.' }
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

  return { ok: true, backup, warnings }
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
