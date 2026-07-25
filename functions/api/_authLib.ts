// Shared auth helpers for functions/api/admin-otp.ts (and future auth
// endpoints). No onRequest* export, so Cloudflare Pages never binds a route
// to this file directly (same trick as _lib.ts).
//
// Secrets involved (Cloudflare Pages encrypted vars):
//   ADMIN_PIN            — server-side copy of the admin login PIN
//   ADMIN_AUTH_SECRET    — HMAC key for trusted-device tokens (random 32+ chars)
//   ADMIN_RECOVERY_CODE  — long passphrase accepted instead of an OTP
//   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — OTP delivery (see _otpChannels.ts)
// KV binding: ADMIN_AUTH — OTP hashes + per-IP rate-limit counters.

import { createClient } from '@supabase/supabase-js'

// Minimal KV surface we use — avoids a dependency on @cloudflare/workers-types
// (functions/ isn't covered by tsconfig; wrangler bundles these on deploy).
export interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface AuthEnv {
  ADMIN_PIN?: string
  ADMIN_AUTH_SECRET?: string
  ADMIN_RECOVERY_CODE?: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  OTP_CHANNEL?: string
  ADMIN_AUTH?: KVNamespace
  // Phase 2 (SECURITY-HARDENING.md) — mints a real Supabase Auth session for
  // the admin so RLS (migration 039) has something to check. See
  // mintAdminSupabaseTokenHash below and admin-otp.ts.
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  ADMIN_SUPABASE_EMAIL?: string
}

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Constant-time string comparison — hash both sides first so length
 * differences don't leak timing either. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Trusted-device token: `<expiryEpochMs>.<hex HMAC-SHA256(expiry, secret)>`. */
export async function mintDeviceToken(secret: string, ttlMs: number): Promise<string> {
  const expiry = String(Date.now() + ttlMs)
  return `${expiry}.${await hmacHex(expiry, secret)}`
}

export async function verifyDeviceToken(token: string, secret: string): Promise<boolean> {
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expiry = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false
  return safeEqual(mac, await hmacHex(expiry, secret))
}

/** Sliding per-IP counter in KV. Returns true when the caller is over the
 * limit. First hit creates the key with the given TTL; later hits increment
 * it (resetting the TTL — acceptable for an auth limiter). */
export async function isRateLimited(
  kv: KVNamespace,
  key: string,
  limit: number,
  ttlSeconds: number
): Promise<boolean> {
  const current = Number((await kv.get(key)) || '0')
  if (current >= limit) return true
  await kv.put(key, String(current + 1), { expirationTtl: ttlSeconds })
  return false
}

/** Header the client sends its trusted-device token on for endpoints gated
 * by requireAdminToken — kept distinct from Authorization so nothing (proxy,
 * browser extension, framework) ever attaches or strips it unexpectedly. */
export const ADMIN_TOKEN_HEADER = 'X-ClinicMx-Auth'

/**
 * Gate for the backup endpoints (list/download/upload-backup.ts): requires a
 * valid, unexpired trusted-device token — the same one minted by
 * admin-otp.ts's `verify`/`trusted` responses — on the ADMIN_TOKEN_HEADER
 * header. Returns null when the token is valid (caller proceeds); otherwise
 * a ready-to-return 401 Response.
 *
 * Fails CLOSED: a missing ADMIN_AUTH_SECRET (misconfiguration) rejects the
 * request rather than letting it through, unlike admin-otp.ts's deploy-safe
 * `unconfigured` bootstrap — that fallback exists so the *first* deploy of
 * 2FA can never lock the admin out of login, but these are pre-existing
 * data endpoints, not the login path, so there's no equivalent bootstrap
 * need and failing open would defeat the point of gating them.
 */
export async function requireAdminToken(
  request: Request,
  env: { ADMIN_AUTH_SECRET?: string }
): Promise<Response | null> {
  if (!env.ADMIN_AUTH_SECRET) {
    return json(500, { ok: false, error: 'Admin auth is not configured on the server.' })
  }
  const token = request.headers.get(ADMIN_TOKEN_HEADER)
  if (!token || !(await verifyDeviceToken(token, env.ADMIN_AUTH_SECRET))) {
    return json(401, { ok: false, error: 'Admin sign-in required.' })
  }
  return null
}

/**
 * Mints a real Supabase Auth session for the admin's dedicated Auth user
 * (service_role, invisible to the client) so the admin's browser can
 * satisfy RLS policies once migration 039 lands. The PIN/OTP screens the
 * admin sees are completely unchanged — this runs after they succeed.
 *
 * Mechanism: generateLink({type:'magiclink'}) returns a hashed_token the
 * client redeems via supabase.auth.verifyOtp({token_hash, type:'magiclink'}),
 * which yields a normal persisted session — no email is sent, no password
 * exists for the admin to manage.
 *
 * NEVER THROWS and never fails the caller's response — a misconfigured or
 * unreachable Supabase project must not block admin login. Before
 * migration 039 is applied, the app works fine with no Supabase session at
 * all (the anon key still satisfies the allow-all policies), so a null
 * return here just means "no session minted this time, proceed with the
 * legacy flow" rather than an error. (Once 039 is live, a null return
 * effectively means an empty app for the admin — that's a signal to check
 * these three secrets are set correctly, not a code path to add error
 * handling for here.)
 */
export async function mintAdminSupabaseTokenHash(env: AuthEnv): Promise<string | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.ADMIN_SUPABASE_EMAIL) return null
  try {
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: env.ADMIN_SUPABASE_EMAIL,
    })
    if (error || !data?.properties?.hashed_token) {
      console.error('mintAdminSupabaseTokenHash failed:', JSON.stringify(error))
      return null
    }
    return data.properties.hashed_token
  } catch (err) {
    console.error('mintAdminSupabaseTokenHash threw:', err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err))
    return null
  }
}
