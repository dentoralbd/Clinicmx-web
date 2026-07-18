// Cloudflare Pages Function: second factor for the admin login.
//
// The app's admin PIN alone (checked client-side) is no longer enough to
// log in as admin on an unknown device: this endpoint verifies the PIN
// server-side, sends a 6-digit code via Telegram (see _otpChannels.ts),
// and on successful verification returns a signed trusted-device token
// (7 days) so daily logins skip the OTP.
//
// Deploy-safe bootstrap: while the secrets / KV binding are missing, the
// `request` action answers { unconfigured: true } and the client proceeds
// PIN-only exactly as before this feature existed. Setting the env vars in
// the Cloudflare dashboard is what switches 2FA on.
//
// POST /api/admin-otp
//   { action: 'request', pin, deviceToken? }
//     → { unconfigured: true } | { trusted: true } | { otpRequired: true, nonce }
//       | { otpRequired: true, nonce: null, sendError: true }  (delivery failed →
//         client offers the recovery-code path immediately)
//   { action: 'verify', pin, nonce, code } or { action: 'verify', pin, recoveryCode }
//     → { ok: true, deviceToken }

import {
  type AuthEnv,
  json,
  safeEqual,
  sha256Hex,
  mintDeviceToken,
  verifyDeviceToken,
  isRateLimited,
} from './_authLib'
import { channelConfigured, sendOtp } from './_otpChannels'

const OTP_TTL_SECONDS = 300
const OTP_MAX_ATTEMPTS = 5
// Failures (wrong PIN / wrong recovery code / wrong OTP) per IP per hour
// before the endpoint stops answering — successful logins never consume
// this budget, so the real admin can't rate-limit themself out.
const FAILURES_PER_HOUR = 10
// Telegram sends per IP per hour (someone holding the correct PIN must not
// be able to flood the admin's Telegram).
const SENDS_PER_HOUR = 5
const DEVICE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface OtpRecord {
  hash: string
  attempts: number
}

interface Body {
  action?: string
  pin?: string
  deviceToken?: string
  nonce?: string
  code?: string
  recoveryCode?: string
}

function isConfigured(env: AuthEnv): boolean {
  return !!(env.ADMIN_PIN && env.ADMIN_AUTH_SECRET && env.ADMIN_AUTH && channelConfigured(env))
}

export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  const { request, env } = context

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  if (!isConfigured(env)) {
    // Not set up yet — tell the client to proceed PIN-only (checked
    // client-side as before). Never blocks login during rollout.
    return json(200, { unconfigured: true })
  }

  const kv = env.ADMIN_AUTH!
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const failKey = `otp_fail:${ip}`

  // Lock out an IP that keeps failing (wrong PIN / recovery code / OTP).
  // The check happens up front; the counter is only incremented on actual
  // failures below, so normal successful logins never consume the budget.
  if (Number((await kv.get(failKey)) || '0') >= FAILURES_PER_HOUR) {
    return json(429, { error: 'Too many attempts. Try again in an hour.' })
  }
  const recordFailure = () => isRateLimited(kv, failKey, FAILURES_PER_HOUR, 3600)

  if (typeof body.pin !== 'string' || !(await safeEqual(body.pin, env.ADMIN_PIN!))) {
    await recordFailure()
    return json(403, { error: 'Incorrect password' })
  }

  if (body.action === 'request') {
    if (
      typeof body.deviceToken === 'string' &&
      body.deviceToken &&
      (await verifyDeviceToken(body.deviceToken, env.ADMIN_AUTH_SECRET!))
    ) {
      return json(200, { trusted: true })
    }

    if (await isRateLimited(kv, `otp_send:${ip}`, SENDS_PER_HOUR, 3600)) {
      return json(429, { error: 'Too many codes requested. Try again in an hour.' })
    }

    const digits = new Uint32Array(1)
    crypto.getRandomValues(digits)
    const code = String(digits[0] % 1_000_000).padStart(6, '0')
    const nonce = crypto.randomUUID()
    const record: OtpRecord = { hash: await sha256Hex(code), attempts: 0 }
    await kv.put(`otp:${nonce}`, JSON.stringify(record), { expirationTtl: OTP_TTL_SECONDS })

    try {
      await sendOtp(env, code)
    } catch (err) {
      // Delivery failed (channel outage / bad credentials). Invalidate the
      // code and let the client offer the recovery-code path right away.
      await kv.delete(`otp:${nonce}`)
      console.error('OTP send failed:', err instanceof Error ? err.message : err)
      return json(200, { otpRequired: true, nonce: null, sendError: true })
    }
    return json(200, { otpRequired: true, nonce })
  }

  if (body.action === 'verify') {
    if (typeof body.recoveryCode === 'string' && body.recoveryCode) {
      if (!env.ADMIN_RECOVERY_CODE || !(await safeEqual(body.recoveryCode, env.ADMIN_RECOVERY_CODE))) {
        await recordFailure()
        return json(403, { error: 'Incorrect recovery code' })
      }
      return json(200, {
        ok: true,
        deviceToken: await mintDeviceToken(env.ADMIN_AUTH_SECRET!, DEVICE_TOKEN_TTL_MS),
      })
    }

    if (typeof body.nonce !== 'string' || typeof body.code !== 'string') {
      return json(400, { error: 'Missing code' })
    }
    const raw = await kv.get(`otp:${body.nonce}`)
    if (!raw) {
      return json(400, { error: 'Code expired. Request a new one.' })
    }
    const record = JSON.parse(raw) as OtpRecord
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await kv.delete(`otp:${body.nonce}`)
      return json(429, { error: 'Too many wrong codes. Request a new one.' })
    }
    // Persist the attempt before comparing so a wrong guess always counts.
    record.attempts += 1
    await kv.put(`otp:${body.nonce}`, JSON.stringify(record), { expirationTtl: OTP_TTL_SECONDS })

    if (!(await safeEqual(await sha256Hex(body.code), record.hash))) {
      await recordFailure()
      return json(403, { error: 'Wrong code. Check the latest message.' })
    }
    await kv.delete(`otp:${body.nonce}`)
    return json(200, {
      ok: true,
      deviceToken: await mintDeviceToken(env.ADMIN_AUTH_SECRET!, DEVICE_TOKEN_TTL_MS),
    })
  }

  return json(400, { error: 'Unknown action' })
}
