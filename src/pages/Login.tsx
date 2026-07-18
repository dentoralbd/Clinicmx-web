import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Stethoscope, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { initializeSecureStorage } from '@/lib/secureLocalStorage'
import { clearAppUser, setAppRole, setAppUser, type AppRole } from '@/lib/appSession'
import { findAppUserByIdentifier, touchLastLogin, verifyPassword, type AppUserRecord } from '@/lib/appUsers'
import { logLogin } from '@/lib/activityLog'
import { checkIpAccess, fetchClientIp, requestIpApproval } from '@/lib/ipAccess'

const ADMIN_PASSWORD = '6040'

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
    await initializeSecureStorage(ADMIN_PASSWORD)
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
      if (password === ADMIN_PASSWORD) {
        clearAppUser()
        await completeLogin('admin')
      } else {
        failLogin('Incorrect password')
      }
      return
    }

    // Doctor / operator: account created by the admin in the Admin zone
    try {
      const account = await findAppUserByIdentifier(identifier, role)
      if (!account || !(await verifyPassword(password, account.password_salt, account.password_hash))) {
        failLogin('Incorrect email/phone or password')
        return
      }
      if (!account.is_active) {
        failLogin('This account is disabled. Contact the admin.')
        return
      }
      // Network gate: unless the admin granted "Entry from any IP", the
      // device's public IP must be on this user's approved list.
      if (account.permissions?.can_any_ip !== true) {
        const ip = await fetchClientIp()
        if (!ip) {
          failLogin(
            'Could not verify your network. Check your connection, or ask the admin to allow entry from any IP for your account.'
          )
          return
        }
        const status = await checkIpAccess(account.id, ip)
        if (status === 'denied') {
          failLogin('Access from this network was denied by the admin.')
          return
        }
        if (status !== 'approved') {
          await requestIpApproval(account.id, ip, `${role}:${account.full_name}`)
          setLoading(false)
          setWaiting({ account, ip, role })
          return
        }
      }
      setAppUser({ id: account.id, name: account.full_name, permissions: account.permissions })
      touchLastLogin(account.id)
      await completeLogin(role)
    } catch (err) {
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
    return () => clearInterval(timer)
  }, [waiting])

  function handleBack() {
    setRole(null)
    setIdentifier('')
    setPassword('')
    setError('')
    setWaiting(null)
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ClinicMx</h1>
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
