// Cloudflare Pages Functions middleware — runs before every /api/* request.
//
// Purpose: let the Tauri desktop build of the app (D:\Claude\Clinicmx-web-redesign,
// packaged as a Windows exe) call this deployment's /api/* endpoints. The exe
// serves its UI from the Tauri custom-protocol origin (http://tauri.localhost
// in dev, https://tauri.localhost in a release build), which is a different
// origin than clinicmx-web.pages.dev, so without CORS the browser blocks the
// fetch before it ever reaches these functions. No other origin is allowed —
// normal same-origin browser/APK usage is unaffected, and cross-origin
// requests from anywhere else still fail as before. This is a transport-layer
// allowance only; every endpoint's existing auth (PIN, device token, Supabase
// session) still gates the actual request the same way it does today.

const ALLOWED_ORIGINS = new Set(['http://tauri.localhost', 'https://tauri.localhost'])

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ClinicMx-Auth',
  'Access-Control-Max-Age': '86400',
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context
  const origin = request.headers.get('Origin')
  const allowed = origin && ALLOWED_ORIGINS.has(origin)

  if (request.method === 'OPTIONS') {
    if (!allowed) return new Response(null, { status: 204 })
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin', ...CORS_HEADERS },
    })
  }

  const response = await context.next()
  if (!allowed) return response

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', origin!)
  headers.append('Vary', 'Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
