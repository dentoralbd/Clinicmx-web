// Client for the admin 2FA endpoint (functions/api/admin-otp.ts).
//
// The admin PIN alone no longer finishes a login on an unknown device once
// the Cloudflare secrets are configured: the endpoint sends a 6-digit code
// via Telegram and returns a signed trusted-device token (7 days) after a
// successful verification. While the endpoint reports `unconfigured` (or is
// unreachable in local dev), the caller falls back to PIN-only behavior.
//
// Phase 2 (SECURITY-HARDENING.md): both success shapes also carry
// `sbTokenHash`, a one-time Supabase token minted server-side
// (mintAdminSupabaseTokenHash in _authLib.ts) that this module redeems via
// `supabase.auth.verifyOtp` to give the admin's browser a real Supabase
// session — invisibly, with no change to the PIN/OTP screens. A null/
// missing hash (Supabase not configured yet, or unreachable) is not
// treated as an error here; see the comment on redeemSupabaseSession.

import { supabase } from './supabase'
import { API_BASE } from './runtimeEnv'

const DEVICE_TOKEN_KEY = 'clinicmx_admin_device'

export type OtpRequestResult =
  | { kind: 'unconfigured' }
  | { kind: 'trusted' }
  | { kind: 'otp'; nonce: string }
  | { kind: 'send-failed' } // code could not be delivered → offer recovery code
  | { kind: 'rejected'; message: string } // wrong PIN / rate limited
  | { kind: 'unreachable' } // endpoint missing (vite dev) or network error

export function getAdminDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveAdminDeviceToken(token: string): void {
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
  } catch {
    // Storage unavailable — the next login will just ask for a code again.
  }
}

async function post(body: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch(`${API_BASE}/api/admin-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
}

/**
 * Redeems a one-time Supabase token hash into a real, persisted Supabase
 * session. Never throws: before migration 039 locks RLS down, the app
 * works fine without a Supabase session at all (the anon key still
 * satisfies today's allow-all policies), so a failed/missing redeem here
 * must not block the admin login the PIN+OTP flow already approved.
 */
async function redeemSupabaseSession(tokenHash: string | null | undefined): Promise<void> {
  if (!tokenHash) return
  try {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (error) console.error('Admin Supabase session redeem failed:', error.message)
  } catch (err) {
    console.error('Admin Supabase session redeem threw:', err instanceof Error ? err.message : err)
  }
}

export async function requestAdminOtp(pin: string): Promise<OtpRequestResult> {
  const res = await post({ action: 'request', pin, deviceToken: getAdminDeviceToken() })
  if (!res || res.status === 404 || res.status === 405) return { kind: 'unreachable' }

  let data: {
    unconfigured?: boolean
    trusted?: boolean
    deviceToken?: string
    sbTokenHash?: string | null
    otpRequired?: boolean
    nonce?: string | null
    sendError?: boolean
    error?: string
  }
  try {
    data = await res.json()
  } catch {
    // Non-JSON answer (e.g. an HTML error page) — treat as unreachable.
    return { kind: 'unreachable' }
  }

  if (res.status === 403 || res.status === 429) {
    return { kind: 'rejected', message: data.error || 'Login rejected.' }
  }
  if (!res.ok) return { kind: 'unreachable' }
  if (data.unconfigured) return { kind: 'unconfigured' }
  if (data.trusted) {
    // Server slides the 7-day trust window forward on every login; persist
    // the refreshed token so device trust (and backup access, which is
    // gated on this same token) never lapses between admin logins.
    if (typeof data.deviceToken === 'string') saveAdminDeviceToken(data.deviceToken)
    await redeemSupabaseSession(data.sbTokenHash)
    return { kind: 'trusted' }
  }
  if (data.otpRequired && data.sendError) return { kind: 'send-failed' }
  if (data.otpRequired && typeof data.nonce === 'string') return { kind: 'otp', nonce: data.nonce }
  return { kind: 'unreachable' }
}

export type OtpVerifyResult =
  | { kind: 'ok' }
  | { kind: 'rejected'; message: string }
  | { kind: 'unreachable' }

export async function verifyAdminOtp(
  pin: string,
  payload: { nonce: string; code: string } | { recoveryCode: string }
): Promise<OtpVerifyResult> {
  const res = await post({ action: 'verify', pin, ...payload })
  if (!res || res.status === 404 || res.status === 405) return { kind: 'unreachable' }

  let data: { ok?: boolean; deviceToken?: string; sbTokenHash?: string | null; error?: string }
  try {
    data = await res.json()
  } catch {
    return { kind: 'unreachable' }
  }

  if (!res.ok) {
    return { kind: 'rejected', message: data.error || 'Verification failed.' }
  }
  if (data.ok && typeof data.deviceToken === 'string') {
    saveAdminDeviceToken(data.deviceToken)
    await redeemSupabaseSession(data.sbTokenHash)
    return { kind: 'ok' }
  }
  return { kind: 'unreachable' }
}
