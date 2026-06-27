import { Navigate } from 'react-router-dom'
import { hasSessionEncryptionKey } from '@/lib/secureLocalStorage'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = localStorage.getItem('clinicmx_auth') === 'true'
  const hasSessionKey = hasSessionEncryptionKey()

  if (!isAuthenticated || !hasSessionKey) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
