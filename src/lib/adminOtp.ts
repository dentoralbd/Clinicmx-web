// Client for the admin 2FA endpoint (functions/api/admin-otp.ts).
//
// The admin PIN alone no longer finishes a login on an unknown device once
// the Cloudflare secrets are configured: the endpoint sends a 6-digit code
// via Telegram and returns a signed trusted-device token (7 days) after a
// successful verification. While the endpoint reports `unconfigured` (or is
// unreachable in local dev), the caller falls back to PIN-only behavior.

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
    return await fetch('/api/admin-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
}

export async function requestAdminOtp(pin: string): Promise<OtpRequestResult> {
  const res = await post({ action: 'request', pin, deviceToken: getAdminDeviceToken() })
  if (!res || res.status === 404 || res.status === 405) return { kind: 'unreachable' }

  let data: { unconfigured?: boolean; trusted?: boolean; otpRequired?: boolean; nonce?: string | null; sendError?: boolean; error?: string }
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
  if (data.trusted) return { kind: 'trusted' }
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

  let data: { ok?: boolean; deviceToken?: string; error?: string }
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
    return { kind: 'ok' }
  }
  return { kind: 'unreachable' }
}
