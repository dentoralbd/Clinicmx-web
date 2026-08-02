// Cloudflare Pages Function: server-to-server proxy for the DentOral ->
// ClinicMx booking bridge (src/components/DentoralBookingBridge.tsx, shown
// on the Appointments page for every operator/doctor, not an admin-only
// screen).
//
// Why this exists: DentOral's public appointments API
// (D:\Claude\AGY\functions\api\appointments.js) used to accept the bridge's
// GET/update_status calls with no credentials at all — the admin password
// was deliberately removed from that call site because it made every
// operator need admin rights just to see incoming web bookings. DentOral
// is being fixed to require a credential again, but it must be a
// booking-scoped one (list + update_status only, never delete), and it
// must never be typed by staff or bundled into ClinicMx's public
// `VITE_`-prefixed client bundle (anything in that bundle is public —
// verified by fetching the built JS cross-origin with no auth). So the
// credential lives here as a Cloudflare secret (DENTORAL_BRIDGE_TOKEN,
// distinct from DentOral's own CMS_ADMIN_PASSWORD), and the browser talks
// to this same-origin proxy instead of dentoralbd.pages.dev directly.
//
// Gated by requireStaffSession (_authLib.ts) — any signed-in staff
// member, matching where the panel actually lives. NOT requireAdminToken;
// that would recreate the exact friction this bridge exists to avoid.
//
// This proxy only ever forwards GET (list) and POST ?action=update_status.
// action=delete is not supported here at all, even if DentOral's own
// action=delete were ever mistakenly relaxed for the bridge token — this
// file is a second, independent place that would have to be changed
// before the bridge could be used to destroy a booking.

import { requireStaffSession } from './_authLib'

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  DENTORAL_BRIDGE_TOKEN?: string
}

const DENTORAL_APPOINTMENTS_URL = 'https://dentoralbd.pages.dev/api/appointments'

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const authError = await requireStaffSession(request, env)
  if (authError) return authError

  if (!env.DENTORAL_BRIDGE_TOKEN) {
    return json(500, { error: 'Bridge is not configured on the server.' })
  }

  try {
    const res = await fetch(`${DENTORAL_APPOINTMENTS_URL}?t=${Date.now()}`, {
      headers: { 'X-Bridge-Token': env.DENTORAL_BRIDGE_TOKEN },
      cf: { cacheTtl: 0 },
    })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch {
    return json(502, { error: 'Could not reach DentOral.' })
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const authError = await requireStaffSession(request, env)
  if (authError) return authError

  if (!env.DENTORAL_BRIDGE_TOKEN) {
    return json(500, { error: 'Bridge is not configured on the server.' })
  }

  const url = new URL(request.url)
  if (url.searchParams.get('action') !== 'update_status') {
    // Deliberately the only action this proxy forwards — see file header.
    return json(400, { error: 'Unsupported action.' })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }

  try {
    const res = await fetch(`${DENTORAL_APPOINTMENTS_URL}?action=update_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': env.DENTORAL_BRIDGE_TOKEN },
      body: JSON.stringify(body),
    })
    const responseBody = await res.text()
    return new Response(responseBody, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return json(502, { error: 'Could not reach DentOral.' })
  }
}
