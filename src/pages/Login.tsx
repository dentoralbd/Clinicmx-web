import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Stethoscope, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { initializeSecureStorage } from '@/lib/secureLocalStorage'
import { clearAppUser, setAppRole, setAppUser, type AppRole } from '@/lib/appSession'
import { findAppUserByIdentifier, touchLastLogin, verifyPassword } from '@/lib/appUsers'
import { logLogin } from '@/lib/activityLog'

const ADMIN_PASSWORD = '6040'

export function Login() {
  const [role, setRole] = useState<AppRole | null>(null)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
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
      setAppUser({ id: account.id, name: account.full_name, permissions: account.permissions })
      touchLastLogin(account.id)
      await completeLogin(role)
    } catch (err) {
      failLogin(err instanceof Error ? err.message : 'Login failed. Please try again.')
    }
  }

  function handleBack() {
    setRole(null)
    setIdentifier('')
    setPassword('')
    setError('')
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

        {!role ? (
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
