// Cloudflare Pages Function: sanitised, read-only queue feed for the
// patient-facing board on dentoralbd.com/queue (AGY repo, functions/api/queue.js
// proxies to this). Mirrors the DentOral booking bridge's cross-site pattern
// (dentoral-bridge.ts) in the opposite direction: there, ClinicMx pulls
// bookings FROM DentOral with a bearer token; here, DentOral pulls the queue
// FROM ClinicMx with a bearer token.
//
// Why this exists instead of the browser reading queue_entries directly:
// the sandbox this feature was ported from granted `anon` SELECT on
// queue_entries so a waiting-room TV could read without login — since the
// anon key is VITE_-bundled (public), that made a named patient roster +
// procedures readable by anyone holding the compiled JS, directly reversing
// the RLS lockdown (039_rls_lockdown.sql). This Function holds the
// service_role key server-side instead: the browser never sees any
// Supabase credential, and queue_entries keeps zero anon grants.
//
// Two response shapes, gated by QUEUE_BOARD_TOKEN (constant-time compare,
// same safeEqual as _authLib.ts):
//   - valid token  -> full payload, names per queue_settings.privacy_mode
//   - missing/bad  -> masked fallback (serial + position only, NEVER a name)
// Never an error response for a missing/bad token — that would let a probe
// distinguish "wrong token" from "service down", and more importantly an
// error is a worse failure mode for a public waiting-room board than a
// degraded-but-safe view.

import { createClient } from '@supabase/supabase-js'
import { safeEqual } from './_authLib'

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  QUEUE_BOARD_TOKEN?: string
}

interface QueueEntryRow {
  id: string
  patient_name: string
  serial_number: number
  sort_key: number
  status: string
  room_number: string | null
  procedure_name: string | null
  hold_reason: string | null
  priority: string
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function computeCanonicalOrder(rows: QueueEntryRow[]): QueueEntryRow[] {
  return [...rows].sort((a, b) => {
    const aUrgent = a.priority === 'urgent' ? 1 : 0
    const bUrgent = b.priority === 'urgent' ? 1 : 0
    if (aUrgent !== bUrgent) return bUrgent - aUrgent
    return a.sort_key - b.sort_key
  })
}

function formatDisplay(row: QueueEntryRow, privacyMode: string): string {
  switch (privacyMode) {
    case 'token_only':
      return `Token #${row.serial_number}`
    case 'masked': {
      const parts = row.patient_name.trim().split(/\s+/)
      const last = parts[parts.length - 1] ?? ''
      const initial = last ? `${last[0].toUpperCase()}.` : ''
      const firstPart = parts.slice(0, -1).join(' ')
      return `#${row.serial_number} · ${firstPart ? `${firstPart} ${initial}` : initial}`.trim()
    }
    case 'full':
    default:
      return `#${row.serial_number} ${row.patient_name}`
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: 'Queue board is not configured on the server.' })
  }

  const suppliedToken = request.headers.get('X-Bridge-Token') || new URL(request.url).searchParams.get('t') || ''
  const hasValidToken = Boolean(env.QUEUE_BOARD_TOKEN) && (await safeEqual(suppliedToken, env.QUEUE_BOARD_TOKEN as string))

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const today = new Date()
  const queueDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [{ data: entries, error: entriesError }, { data: settings }] = await Promise.all([
    supabase
      .from('queue_entries')
      .select('id, patient_name, serial_number, sort_key, status, room_number, procedure_name, hold_reason, priority')
      .eq('queue_date', queueDate),
    supabase.from('queue_settings').select('*').eq('id', true).single(),
  ])

  if (entriesError) {
    return json(502, { error: 'Could not load the queue.' })
  }

  const ordered = computeCanonicalOrder((entries as QueueEntryRow[]) || [])
  // Untokened requests never see names, room numbers, or procedures,
  // regardless of what privacy_mode is set to — that setting only governs
  // the tokened (real board) response.
  const privacyMode = hasValidToken ? settings?.privacy_mode ?? 'full' : 'token_only'
  const infotainmentEnabled = hasValidToken ? (settings?.infotainment_enabled ?? true) : false
  const infotainmentIntervalSecs = settings?.infotainment_interval_secs ?? 12

  const serving = ordered
    .filter((e) => e.status === 'serving')
    .map((e) => ({ id: e.id, display: formatDisplay(e, privacyMode), room: hasValidToken ? e.room_number : null, procedure: hasValidToken ? e.procedure_name : null }))

  const onHold = ordered
    .filter((e) => e.status === 'on_hold')
    .map((e) => ({ id: e.id, display: formatDisplay(e, privacyMode), reason: hasValidToken ? e.hold_reason : null }))

  const waiting = ordered
    .filter((e) => e.status === 'waiting')
    .map((e, i) => ({ id: e.id, display: formatDisplay(e, privacyMode), position: i + 1, procedure: hasValidToken ? e.procedure_name : null }))

  return json(200, {
    queueDate,
    serving,
    onHold,
    waiting,
    infotainmentEnabled,
    infotainmentIntervalSecs,
    gated: !hasValidToken,
  })
}
