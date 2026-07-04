import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { initializeSecureStorage } from '@/lib/secureLocalStorage'
import { setAppRole, type AppRole } from '@/lib/appSession'

const APP_PASSWORD = '6040'
const DOCTOR_PASSWORD = '9040'

export function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const [step, setStep] = useState<'password' | 'role'>('password')
  const [doctorPassword, setDoctorPassword] = useState('')
  const [showDoctorPassword, setShowDoctorPassword] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    // brief delay for perceived security
    await new Promise((r) => setTimeout(r, 400))

    if (password === APP_PASSWORD) {
      await initializeSecureStorage(password)
      setLoading(false)
      setError('')
      setStep('role')
    } else {
      setError('Incorrect password')
      setPassword('')
      setLoading(false)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  function completeLogin(role: AppRole) {
    setAppRole(role)
    localStorage.setItem('clinicmx_auth', 'true')
    navigate('/dashboard')
  }

  function handleOperatorLogin() {
    completeLogin('operator')
  }

  function handleDoctorSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (doctorPassword === DOCTOR_PASSWORD) {
      completeLogin('doctor')
    } else {
      setError('Incorrect doctor password')
      setDoctorPassword('')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
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

        {step === 'password' ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
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
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm font-medium text-gray-700">Continue as</p>

            {!showDoctorPassword ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowDoctorPassword(true)
                    setError('')
                  }}
                  className="w-full flex items-center gap-4 px-5 py-4 border-2 border-primary/30 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left"
                >
                  <Stethoscope className="w-8 h-8 text-primary shrink-0" />
                  <span>
                    <span className="block font-semibold text-gray-900">Login as Doctor</span>
                    <span className="block text-sm text-text-secondary">Full access — can change or delete any data</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleOperatorLogin}
                  className="w-full flex items-center gap-4 px-5 py-4 border-2 border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
                >
                  <UserCog className="w-8 h-8 text-gray-500 shrink-0" />
                  <span>
                    <span className="block font-semibold text-gray-900">Login as Operator</span>
                    <span className="block text-sm text-text-secondary">Can add and edit data, but cannot delete</span>
                  </span>
                </button>
              </>
            ) : (
              <form onSubmit={handleDoctorSubmit} className="space-y-4">
                <div>
                  <label htmlFor="doctor-password" className="block text-sm font-medium text-gray-700 mb-2">
                    Doctor password
                  </label>
                  <input
                    id="doctor-password"
                    type="password"
                    value={doctorPassword}
                    onChange={(e) => {
                      setDoctorPassword(e.target.value)
                      setError('')
                    }}
                    placeholder="Enter doctor password"
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
                      error ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                    autoFocus
                  />
                  {error && (
                    <p className="mt-2 text-sm text-red-600">{error}</p>
                  )}
                </div>

                <Button type="submit" className="w-full py-3">
                  Login as Doctor
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setShowDoctorPassword(false)
                    setDoctorPassword('')
                    setError('')
                  }}
                  className="w-full text-sm text-text-secondary hover:text-gray-900 transition-colors"
                >
                  Back
                </button>
              </form>
            )}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-text-secondary">
          <p>Secure access for authorized users only</p>
        </div>
      </div>
    </div>
  )
}
