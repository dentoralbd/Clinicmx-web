// OTP delivery channels for functions/api/admin-otp.ts. No onRequest*
// export, so Cloudflare Pages never binds a route to this file.
//
// Selected via env OTP_CHANNEL (default 'telegram'). Adding a channel later
// (e.g. 'gmail' via an email API) means adding a case below and its env
// vars — the login flow itself doesn't change.

import type { AuthEnv } from './_authLib'

/** True when the configured channel has everything it needs to send. */
export function channelConfigured(env: AuthEnv): boolean {
  const channel = env.OTP_CHANNEL || 'telegram'
  if (channel === 'telegram') return !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)
  return false
}

/** Sends the code. Throws with a human-readable message on failure so the
 * endpoint can tell the client delivery failed (→ recovery-code path). */
export async function sendOtp(env: AuthEnv, code: string): Promise<void> {
  const channel = env.OTP_CHANNEL || 'telegram'

  if (channel === 'telegram') {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `ClinicMx admin login code: ${code}\nValid for 5 minutes. If you didn't try to log in, someone knows your PIN.`,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Telegram send failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    return
  }

  throw new Error(`Unknown OTP channel: ${channel}`)
}
