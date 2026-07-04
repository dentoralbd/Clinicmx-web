import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { initializeSecureStorage } from '@/lib/secureLocalStorage'
import { setAppRole, type AppRole } from '@/lib/appSession'

const DOCTOR_PASSWORD = '6040'
const OPERATOR_PASSWORD = '5555'

export function Login() {
  const [role, setRole] = useState<AppRole | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return
    setLoading(true)

    // brief delay for perceived security
    await new Promise((r) => setTimeout(r, 400))

    const expectedPassword = role === 'doctor' ? DOCTOR_PASSWORD : OPERATOR_PASSWORD

    if (password === expectedPassword) {
      // Always derive the secure-storage encryption key from the doctor
      // password, regardless of role, so previously-encrypted data (doctor
      // profile, prescription memory) stays readable for both roles.
      await initializeSecureStorage(DOCTOR_PASSWORD)
      setAppRole(role)
      localStorage.setItem('clinicmx_auth', 'true')
      navigate('/dashboard')
    } else {
      setError('Incorrect password')
      setPassword('')
      setLoading(false)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  function handleBack() {
    setRole(null)
    setPassword('')
    setError('')
  }

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
              onClick={() => setRole('doctor')}
              className="w-full flex items-center gap-4 px-5 py-4 border-2 border-primary/30 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left"
            >
              <Stethoscope className="w-8 h-8 text-primary shrink-0" />
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
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                {role === 'doctor' ? 'Doctor Password' : 'Operator Password'}
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
                autoFocus
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
