import { Navigate } from 'react-router-dom'
import { hasSessionEncryptionKey } from '@/lib/secureLocalStorage'
import { getAppRole } from '@/lib/appSession'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = localStorage.getItem('clinicmx_auth') === 'true'
  const hasSessionKey = hasSessionEncryptionKey()

  if (!isAuthenticated || !hasSessionKey || !getAppRole()) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
