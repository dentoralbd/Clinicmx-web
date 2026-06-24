import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    // brief delay for perceived security
    await new Promise((r) => setTimeout(r, 400))

    if (password === '6040') {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-xl p-8 w-full max-w-md ${shake ? 'shake' : ''}`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ClinicMx</h1>
          <p className="text-text-secondary">Dental Clinic Management</p>
        </div>

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

        <div className="mt-6 text-center text-sm text-text-secondary">
          <p>Secure access for authorized users only</p>
        </div>
      </div>
    </div>
  )
}

