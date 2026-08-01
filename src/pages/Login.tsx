import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Stethoscope, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { initializeSecureStorage } from '@/lib/secureLocalStorage'
import { clearAppUser, setAppRole, setAppUser, type AppRole } from '@/lib/appSession'
import { authEmailFor, loadOwnAppUser, touchLastLogin, type AppUserRecord } from '@/lib/appUsers'
import { logLogin } from '@/lib/activityLog'
import { checkIpAccess, fetchClientIp, requestIpApproval } from '@/lib/ipAccess'
import { requestAdminOtp, verifyAdminOtp } from '@/lib/adminOtp'
import { supabase } from '@/lib/supabase'

// Not the authentication decision — the server (functions/api/admin-otp.ts,
// via ADMIN_PIN) is authoritative for whether the admin PIN is correct. This
// constant only (a) gives a fast client-side "Incorrect password" hint
// before the server round-trip, and (b) derives the secure-storage
// encryption key for every role (see completeLogin below), so it must stay
// in sync with ADMIN_PIN in the Cloudflare dashboard / .dev.vars. Sourced
// from VITE_ADMIN_PASSWORD (.env locally, Cloudflare Pages env var in
// production) so the value itself never lives in the git repo.
const SECURE_STORAGE_PASSPHRASE = import.meta.env.VITE_ADMIN_PASSWORD

export function Login() {
  const [role, setRole] = useState<AppRole | null>(null)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  // Set when the network gate paused the login pending admin approval of this
  // device's IP. The verified account is kept so approval completes the login.
  const [waiting, setWaiting] = useState<{ account: AppUserRecord; ip: string; role: AppRole } | null>(null)
  const [checking, setChecking] = useState(false)
  // Set when the admin 2FA endpoint asked for a code. `nonce` is null when
  // delivery failed and only the recovery-code path is usable.
  const [otp, setOtp] = useState<{ pin: string; nonce: string | null } | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpBusy, setOtpBusy] = useState(false)
  const finishingRef = useRef(false)
  const navigate = useNavigate()

  function failLogin(message: string) {
    setError(message)
    setPassword('')
    setLoading(false)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  async function completeLogin(loginRole: AppRole) {
    // Always derive the secure-storage encryption key from the admin
    // password, regardless of role, so previously-encrypted data (doctor
    // profile, prescription memory) stays readable for every role.
    await initializeSecureStorage(SECURE_STORAGE_PASSPHRASE)
    setAppRole(loginRole)
    localStorage.setItem('clinicmx_auth', 'true')
    // Fire-and-forget: records the login (with best-effort client IP) after the
    // role/user are set so the actor is stamped with the right name.
    logLogin()
    navigate('/dashboard')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return
    setLoading(true)

    // brief delay for perceived security
    await new Promise((r) => setTimeout(r, 400))

    if (role === 'admin') {
      if (password !== SECURE_STORAGE_PASSPHRASE) {
        failLogin('Incorrect password')
        return
      }
      // Second factor: the server sends a Telegram code unless this device
      // holds a valid trusted-device token (7 days). In local dev (no
      // Functions layer, `import.meta.env.DEV`) the endpoint is unreachable
      // by design and login stays PIN-only. In production, both
      // `unreachable` and `unconfigured` now hard-fail: 2FA is deployed and
      // configured today (ADMIN_PIN/ADMIN_AUTH_SECRET/KV set in Cloudflare),
      // so either response means something broke server-side — silently
      // falling back to a PIN alone (which is compiled into the public JS
      // bundle) would quietly downgrade production security. See
      // SECURITY-HARDENING.md Phase 1.
      const result = await requestAdminOtp(password)
      if (result.kind === 'rejected') {
        failLogin(result.message)
        return
      }
      if ((result.kind === 'unreachable' || result.kind === 'unconfigured') && !import.meta.env.DEV) {
        failLogin('Login verification is unavailable. Contact support before continuing.')
        return
      }
      if (result.kind === 'unreachable' || result.kind === 'unconfigured') {
        // Local dev only (see above): no Functions layer, so PIN-only login.
        console.warn('Admin 2FA inactive (dev environment) — PIN-only login.')
      } else if (result.kind === 'otp' || result.kind === 'send-failed') {
        setLoading(false)
        setOtp({ pin: password, nonce: result.kind === 'otp' ? result.nonce : null })
        setOtpCode('')
        setRecoveryMode(result.kind === 'send-failed')
        setOtpError(
          result.kind === 'send-failed'
            ? 'The code could not be delivered to Telegram. Use your recovery code instead.'
            : ''
        )
        return
      }
      clearAppUser()
      await completeLogin('admin')
      return
    }

    // Doctor / operator: account created by the admin in the Admin zone.
    // Phase 2 (SECURITY-HARDENING.md): real Supabase Auth. The identifier
    // is turned into an email deterministically (authEmailFor) — no
    // pre-auth table lookup happens, so there is nothing here for RLS to
    // block. Password verification itself is now Supabase's, not ours.
    try {
      const email = authEmailFor(identifier)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError || !signInData.user) {
        failLogin('Incorrect email/phone or password')
        return
      }

      const account = await loadOwnAppUser(signInData.user.id)
      // No linked profile row, or it belongs to the other role tab — both
      // treated as "wrong credentials" rather than leaking which case it is.
      if (!account || account.role !== role) {
        await supabase.auth.signOut()
        failLogin('Incorrect email/phone or password')
        return
      }
      if (!account.is_active) {
        await supabase.auth.signOut()
        failLogin('This account is disabled. Contact the admin.')
        return
      }
      // Network gate: unless the admin granted "Entry from any IP", the
      // device's public IP must be on this user's approved list. Runs
      // post-sign-in now — checkIpAccess/requestIpApproval read/write
      // authorized_ips, which (once migration 039 lands) needs a real
      // session to satisfy RLS. Not a weakening versus the old pre-auth
      // gate: that ran with the anon key, which granted full DB access
      // regardless of this check passing.
      if (account.permissions?.can_any_ip !== true) {
        const ip = await fetchClientIp()
        if (!ip) {
          await supabase.auth.signOut()
          failLogin(
            'Could not verify your network. Check your connection, or ask the admin to allow entry from any IP for your account.'
          )
          return
        }
        const status = await checkIpAccess(account.id, ip)
        if (status === 'denied') {
          await supabase.auth.signOut()
          failLogin('Access from this network was denied by the admin.')
          return
        }
        if (status !== 'approved') {
          await requestIpApproval(account.id, ip, `${role}:${account.full_name}`)
          setLoading(false)
          // Deliberately stays signed in while this waiting screen is
          // mounted (needed for the 10s poll to keep reading
          // authorized_ips under RLS) — signed out on denial, on Back, or
          // after the 15-minute timeout below, never left open-ended.
          setWaiting({ account, ip, role })
          return
        }
      }
      setAppUser({ id: account.id, name: account.full_name, permissions: account.permissions })
      touchLastLogin(account.id)
      await completeLogin(role)
    } catch (err) {
      await supabase.auth.signOut()
      failLogin(err instanceof Error ? err.message : 'Login failed. Please try again.')
    }
  }

  async function checkWaitingStatus(current: { account: AppUserRecord; ip: string; role: AppRole }) {
    setChecking(true)
    try {
      const status = await checkIpAccess(current.account.id, current.ip)
      if (status === 'approved') {
        if (finishingRef.current) return
        finishingRef.current = true
        setAppUser({
          id: current.account.id,
          name: current.account.full_name,
          permissions: current.account.permissions,
        })
        touchLastLogin(current.account.id)
        await completeLogin(current.role)
        return
      }
      if (status === 'denied') {
        setWaiting(null)
        await supabase.auth.signOut()
        failLogin('Access from this network was denied by the admin.')
      }
    } catch {
      // Lookup hiccup while polling — stay on the waiting screen.
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => {
      void checkWaitingStatus(waiting)
    }, 10000)
    // Don't hold a signed-in-but-unapproved session open indefinitely if
    // the admin never decides and the user walks away from this screen.
    const timeout = setTimeout(() => {
      setWaiting(null)
      void supabase.auth.signOut()
      failLogin('Approval request timed out. Please try logging in again.')
    }, 15 * 60 * 1000)
    return () => {
      clearInterval(timer)
      clearTimeout(timeout)
    }
  }, [waiting])

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!otp || otpBusy) return
    setOtpBusy(true)
    setOtpError('')
    try {
      const payload = recoveryMode
        ? { recoveryCode: recoveryCode.trim() }
        : otp.nonce
          ? { nonce: otp.nonce, code: otpCode.trim() }
          : null
      if (!payload || (recoveryMode ? !recoveryCode.trim() : otpCode.trim().length !== 6)) {
        setOtpError(recoveryMode ? 'Enter your recovery code.' : 'Enter the 6-digit code.')
        return
      }
      const result = await verifyAdminOtp(otp.pin, payload)
      if (result.kind === 'ok') {
        setOtp(null)
        clearAppUser()
        await completeLogin('admin')
        return
      }
      setOtpError(
        result.kind === 'rejected'
          ? result.message
          : 'Could not reach the verification service. Try again.'
      )
    } finally {
      setOtpBusy(false)
    }
  }

  async function handleOtpResend() {
    if (!otp || otpBusy) return
    setOtpBusy(true)
    setOtpError('')
    try {
      const result = await requestAdminOtp(otp.pin)
      if (result.kind === 'otp') {
        setOtp({ pin: otp.pin, nonce: result.nonce })
        setOtpCode('')
        setRecoveryMode(false)
        setOtpError('')
      } else if (result.kind === 'trusted' || result.kind === 'unconfigured' || result.kind === 'unreachable') {
        // Trusted shouldn't happen mid-flow, but if it does, just finish.
        if (result.kind === 'trusted') {
          setOtp(null)
          clearAppUser()
          await completeLogin('admin')
          return
        }
        setOtpError('Could not request a new code. Try again.')
      } else if (result.kind === 'send-failed') {
        setOtp({ pin: otp.pin, nonce: null })
        setRecoveryMode(true)
        setOtpError('The code could not be delivered to Telegram. Use your recovery code instead.')
      } else {
        setOtpError(result.message)
      }
    } finally {
      setOtpBusy(false)
    }
  }

  function handleBack() {
    // A pending network-approval session is signed in but never completed
    // login — don't leave it dangling if the user backs out.
    if (waiting) void supabase.auth.signOut()
    setRole(null)
    setIdentifier('')
    setPassword('')
    setError('')
    setWaiting(null)
    setOtp(null)
    setOtpCode('')
    setRecoveryMode(false)
    setRecoveryCode('')
    setOtpError('')
  }

  const roleTitle = role === 'admin' ? 'Admin' : role === 'doctor' ? 'Doctor' : 'Operator'

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-xl p-8 w-full max-w-md ${shake ? 'shake' : ''}`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="ClinicMx Logo" className="w-20 h-20 object-contain" />
            </div>
          </div>
          <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">ClinicMx</h1>
          <p className="text-text-secondary">Dental Clinic Management</p>
        </div>

        {waiting ? (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <span className="spinner" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Waiting for admin approval</h2>
              <p className="text-sm text-text-secondary">
                This is the first login from this network (IP {waiting.ip}). The admin has been
                notified — you will be signed in automatically once access is approved.
              </p>
            </div>
            <Button
              type="button"
              className="w-full py-3"
              onClick={() => void checkWaitingStatus(waiting)}
              disabled={checking}
            >
              {checking ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner spinner-sm" />
                  Checking...
                </span>
              ) : (
                'Check again'
              )}
            </Button>
            <button
              type="button"
              onClick={handleBack}
              className="w-full text-sm text-text-secondary hover:text-gray-900 transition-colors"
            >
              Back
            </button>
          </div>
        ) : otp ? (
          <form onSubmit={handleOtpSubmit} className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Two-step verification</h2>
              <p className="text-sm text-text-secondary">
                {recoveryMode
                  ? 'Enter your recovery code to finish logging in.'
                  : 'A 6-digit code was sent to your Telegram. Enter it below to finish logging in.'}
              </p>
            </div>

            {recoveryMode ? (
              <div>
                <label htmlFor="recovery-code" className="block text-sm font-medium text-gray-700 mb-2">
                  Recovery code
                </label>
                <input
                  id="recovery-code"
                  type="password"
                  value={recoveryCode}
                  onChange={(e) => {
                    setRecoveryCode(e.target.value)
                    setOtpError('')
                  }}
                  placeholder="Enter recovery code"
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
                    otpError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                  autoFocus
                  disabled={otpBusy}
                />
              </div>
            ) : (
              <div>
                <label htmlFor="otp-code" className="block text-sm font-medium text-gray-700 mb-2">
                  Verification code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, ''))
                    setOtpError('')
                  }}
                  placeholder="6-digit code"
                  className={`w-full px-4 py-3 border rounded-lg text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
                    otpError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                  autoFocus
                  disabled={otpBusy}
                />
              </div>
            )}
            {otpError && <p className="text-sm text-red-600 text-center">{otpError}</p>}

            <Button type="submit" className="w-full py-3" disabled={otpBusy}>
              {otpBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner spinner-sm" />
                  Verifying...
                </span>
              ) : (
                'Verify'
              )}
            </Button>

            <div className="flex items-center justify-between text-sm">
              {otp.nonce !== null && !recoveryMode ? (
                <button
                  type="button"
                  onClick={() => void handleOtpResend()}
                  className="text-primary hover:underline disabled:opacity-50"
                  disabled={otpBusy}
                >
                  Resend code
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode((prev) => !prev)
                  setOtpError('')
                }}
                className="text-text-secondary hover:text-gray-900 transition-colors disabled:opacity-50"
                disabled={otpBusy || (otp.nonce === null && recoveryMode)}
              >
                {recoveryMode ? (otp.nonce !== null ? 'Use Telegram code' : '') : 'Use recovery code'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleBack}
              className="w-full text-sm text-text-secondary hover:text-gray-900 transition-colors"
              disabled={otpBusy}
            >
              Back
            </button>
          </form>
        ) : !role ? (
          <div className="space-y-4">
            <p className="text-center text-sm font-medium text-gray-700">Continue as</p>

            <button
              type="button"
              onClick={() => setRole('admin')}
              className="w-full flex items-center gap-4 px-5 py-4 border-2 border-primary/30 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left"
            >
              <ShieldCheck className="w-8 h-8 text-primary shrink-0" />
              <span className="font-semibold text-gray-900">Admin Login</span>
            </button>

            <button
              type="button"
              onClick={() => setRole('doctor')}
              className="w-full flex items-center gap-4 px-5 py-4 border-2 border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
            >
              <Stethoscope className="w-8 h-8 text-gray-500 shrink-0" />
              <span className="font-semibold text-gray-900">Doctor Login</span>
            </button>

            <button
              type="button"
              onClick={() => setRole('operator')}
              className="w-full flex items-center gap-4 px-5 py-4 border-2 border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
            >
              <UserCog className="w-8 h-8 text-gray-500 shrink-0" />
              <span className="font-semibold text-gray-900">Operator Login</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {role !== 'admin' && (
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-2">
                  Email or phone number
                </label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value)
                    setError('')
                  }}
                  placeholder="Enter email or phone number"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                  autoFocus
                  disabled={loading}
                />
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                {roleTitle} Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                placeholder="Enter password"
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
                  error ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
                autoFocus={role === 'admin'}
                disabled={loading}
              />
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>

            <Button type="submit" className="w-full py-3" disabled={loading}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner spinner-sm" />
                  Verifying...
                </span>
              ) : (
                'Login'
              )}
            </Button>

            <button
              type="button"
              onClick={handleBack}
              className="w-full text-sm text-text-secondary hover:text-gray-900 transition-colors"
              disabled={loading}
            >
              Back
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-text-secondary">
          <p>Secure access for authorized users only</p>
        </div>
      </div>
    </div>
  )
}
