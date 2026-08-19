import { supabase } from './supabase'
import { getAdminDeviceToken } from './adminOtp'

// Data access for the Admin -> Integrity tab (src/components/admin/IntegrityTab.tsx).
// Findings/runs are read straight from Supabase under RLS
// (integrity_findings_select / integrity_scan_runs_select, migration 064 --
// admin and doctor can read, operator cannot). Not audit-tracked: this is
// scan output, not clinical/financial data, so there's no logEdit/
// entityTables.ts entry for it, matching the config-like-data precedent in
// catalog.ts.

export type IntegritySeverity = 'info' | 'warning' | 'critical'

export interface IntegrityFinding {
  id: string
  check_name: string
  severity: IntegritySeverity
  entity_table: string
  entity_id: string
  details: Record<string, unknown>
  first_detected_at: string
  last_seen_at: string
  resolved_at: string | null
  reviewed: boolean
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface IntegrityScanRun {
  id: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'failed'
  triggered_by: string | null
  counts: { critical: number; warning: number; info: number; resolved_this_run: number } | null
  error: string | null
}

export interface IntegrityScanCounts {
  critical: number
  warning: number
  info: number
  resolved_this_run: number
}

export interface ListFindingsFilter {
  severity?: IntegritySeverity
  checkName?: string
  reviewed?: boolean
  includeResolved?: boolean
}

export async function listFindings(filter: ListFindingsFilter = {}): Promise<IntegrityFinding[]> {
  let query = supabase
    .from('integrity_findings')
    .select('*')
    .order('severity', { ascending: true })
    .order('last_seen_at', { ascending: false })

  if (!filter.includeResolved) query = query.is('resolved_at', null)
  if (filter.severity) query = query.eq('severity', filter.severity)
  if (filter.checkName) query = query.eq('check_name', filter.checkName)
  if (filter.reviewed !== undefined) query = query.eq('reviewed', filter.reviewed)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as IntegrityFinding[]
}

export async function markFindingReviewed(id: string, reviewedByUserId: string | null): Promise<void> {
  const { error } = await supabase
    .from('integrity_findings')
    .update({ reviewed: true, reviewed_by: reviewedByUserId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getLastScanRun(): Promise<IntegrityScanRun | null> {
  const { data, error } = await supabase
    .from('integrity_scan_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as IntegrityScanRun | null) ?? null
}

// Header name mirrors functions/api/_authLib.ts's ADMIN_TOKEN_HEADER --
// kept as a literal here (rather than importing across the app/functions
// boundary) since functions/ isn't part of the app's TS project. Same
// duplication as src/lib/deviceBackup.ts and src/lib/appUsers.ts.
const ADMIN_TOKEN_HEADER = 'X-ClinicMx-Auth'

/** Admin-only: triggers functions/api/integrity-scan.ts, which runs
 * run_integrity_scan() with the service_role key server-side. Returns the
 * fresh counts on success. */
export async function runScan(): Promise<IntegrityScanCounts> {
  const res = await fetch('/api/integrity-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ADMIN_TOKEN_HEADER]: getAdminDeviceToken() ?? '' },
  })
  let data: Record<string, unknown>
  try {
    data = await res.json()
  } catch {
    throw new Error(`Request failed (HTTP ${res.status}).`)
  }
  if (res.status === 401) throw new Error('Your device trust expired — log out and log in as admin again to refresh it.')
  if (!res.ok || data.ok !== true) throw new Error((data.error as string) || `Request failed (HTTP ${res.status}).`)
  return data.counts as IntegrityScanCounts
}
