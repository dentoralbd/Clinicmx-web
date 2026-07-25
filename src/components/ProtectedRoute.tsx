import { Navigate } from 'react-router-dom'
import { hasSessionEncryptionKey } from '@/lib/secureLocalStorage'
import { getAppRole } from '@/lib/appSession'

interface ProtectedRouteProps {
  children: React.ReactNode
}

// Deliberately still just the localStorage/sessionStorage check, not a
// Supabase-session gate. Two reasons:
//
// 1. Local-dev admin login (import.meta.env.DEV, no Functions layer) never
//    establishes a real Supabase session at all — that's an intentional
//    carve-out (see src/pages/Login.tsx). A hard session requirement here
//    would permanently bounce local-dev admin logins back to /login
//    straight after they succeed. (This is exactly what happened when an
//    earlier version of this file tried it.)
// 2. Before migration 039 is applied anywhere, the app is *supposed* to
//    keep working via this same legacy check with or without a real
//    session (SECURITY-HARDENING.md Phase 2 finding 0.2) — the anon key
//    still satisfies the allow-all policies regardless. After 039 lands,
//    RLS itself is the real enforcement: a signed-out browser just gets
//    empty results from every query, which needs no help from this
//    component. Gating navigation here too would be redundant with RLS
//    and risks exactly the kind of lockout this migration's design went
//    out of its way to avoid.
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = localStorage.getItem('clinicmx_auth') === 'true'
  const hasSessionKey = hasSessionEncryptionKey()

  if (!isAuthenticated || !hasSessionKey || !getAppRole()) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
