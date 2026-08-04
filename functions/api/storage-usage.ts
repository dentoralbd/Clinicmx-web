// Cloudflare Pages Function: backs the Dashboard "Storage Health" tile
// (src/pages/Dashboard.tsx, admin/operator only) — reports Supabase
// database size and `patient-files` bucket size against configurable plan
// limits, so the clinic gets a quota warning without opening the Supabase
// dashboard.
//
// Gated by requireStaffSession (any signed-in staff member), same as
// list-backups.ts: this only returns aggregate byte counts, nothing
// patient-specific, and it feeds a tile visible to both admin and operator.
// The actual query runs via supabase/migrations/051_storage_usage_stats.sql's
// get_storage_usage_stats() RPC, which is service_role-only — that key lives
// here as a Cloudflare secret and must never reach the browser.
//
// GET /api/storage-usage -> { ok: true, databaseBytes, patientFilesBytes,
//   databaseLimitBytes, storageLimitBytes }

import { createClient } from '@supabase/supabase-js'
import { requireStaffSession } from './_authLib'

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  // Optional plan-quota overrides (MB), set as Cloudflare Pages env vars.
  // Default to the Supabase Free tier (500 MB DB / 1 GB storage) so the
  // tile shows a sensible warning threshold even if these are never set.
  SUPABASE_PLAN_DB_LIMIT_MB?: string
  SUPABASE_PLAN_STORAGE_LIMIT_MB?: string
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const DEFAULT_DB_LIMIT_MB = 500
const DEFAULT_STORAGE_LIMIT_MB = 1024

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const authError = await requireStaffSession(request, env)
  if (authError) return authError

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { ok: false, error: 'Storage usage is not configured on the server yet.' })
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('get_storage_usage_stats').single<{
    database_bytes: number
    patient_files_bytes: number
  }>()

  if (error || !data) {
    return json(502, { ok: false, error: error?.message || 'Could not read storage usage.' })
  }

  const dbLimitMb = Number(env.SUPABASE_PLAN_DB_LIMIT_MB) || DEFAULT_DB_LIMIT_MB
  const storageLimitMb = Number(env.SUPABASE_PLAN_STORAGE_LIMIT_MB) || DEFAULT_STORAGE_LIMIT_MB

  return json(200, {
    ok: true,
    databaseBytes: data.database_bytes,
    patientFilesBytes: data.patient_files_bytes,
    databaseLimitBytes: dbLimitMb * 1024 * 1024,
    storageLimitBytes: storageLimitMb * 1024 * 1024,
  })
}
