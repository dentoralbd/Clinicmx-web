// Cloudflare Pages Function: backs the "Run scan" button on the Admin ->
// Integrity tab (src/components/admin/IntegrityTab.tsx, via
// src/lib/integrity.ts). Runs supabase/migrations/064_integrity_findings.sql's
// run_integrity_scan() RPC, which is service_role-only -- that key lives
// here as a Cloudflare secret and must never reach the browser, same
// pattern as storage-usage.ts.
//
// Gated by requireAdminToken (_authLib.ts), not requireStaffSession: this
// is a write action (it upserts into integrity_findings and can insert an
// app_notifications row), unlike storage-usage.ts's read-only aggregate.
// Doctors read findings straight from Supabase under RLS
// (integrity_findings_select policy) -- they never call this endpoint.
//
// POST /api/integrity-scan -> { ok: true, counts: { critical, warning, info, resolved_this_run } }

import { createClient } from '@supabase/supabase-js'
import { requireAdminToken } from './_authLib'

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  ADMIN_AUTH_SECRET?: string
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const authError = await requireAdminToken(request, env)
  if (authError) return authError

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { ok: false, error: 'Integrity scan is not configured on the server yet.' })
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('run_integrity_scan', {
    p_triggered_by: 'admin-panel',
    p_dry_run: false,
  })

  if (error) {
    return json(502, { ok: false, error: error.message || 'Could not run the integrity scan.' })
  }

  return json(200, { ok: true, counts: data })
}
