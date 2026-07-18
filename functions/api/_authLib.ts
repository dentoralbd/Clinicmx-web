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
