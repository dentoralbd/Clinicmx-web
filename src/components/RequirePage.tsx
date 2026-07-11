import { Navigate } from 'react-router-dom'
import { hasPageAccess, type AppPageKey } from '@/lib/appSession'

/**
 * Blocks a page route for accounts whose admin-set permissions exclude it.
 * Admin (and legacy sessions without page permissions) always pass.
 */
export function RequirePage({ page, children }: { page: AppPageKey; children: React.ReactNode }) {
  if (!hasPageAccess(page)) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}
