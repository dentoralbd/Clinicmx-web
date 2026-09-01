import { useEffect, useRef, useState } from 'react'
import { User, Menu, LogOut, ChevronDown, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clearSecureStorageSession } from '@/lib/secureLocalStorage'
import { canDelete, canEditClinicProfile, canRevert, clearAppRole, clearAppUser, getAppRole, getAppUser } from '@/lib/appSession'
import { supabase } from '@/lib/supabase'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { NotificationBell } from './NotificationBell'

interface HeaderProps {
  onMenuClick: () => void
}

const BUILD_VERSION = 'a26fa94'

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const role = getAppRole()
  const roleLabel = role === 'admin' ? 'Admin' : role === 'doctor' ? 'Doctor' : 'Operator'
  const userName = getAppUser()?.name
  const hasZoneAccess = canEditClinicProfile() || canRevert() || canDelete()
  const displayName = role !== 'admin' && userName ? userName : roleLabel
  const initials = (role !== 'admin' && userName ? userName.trim()[0] : roleLabel[0])?.toUpperCase() || 'U'

  useEffect(() => {
    if (!profileOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [profileOpen])

  async function handleLogout() {
    await supabase.auth.signOut()
    clearSecureStorageSession()
    localStorage.removeItem('clinicmx_auth')
    clearAppRole()
    clearAppUser()
    navigate('/login')
  }

  // z-[45]: `sticky` + a z-index here makes <header> its own stacking context, so any
  // z-index inside it (Notifications/profile dropdowns) is scoped to compete with
  // <header>'s OWN value against siblings elsewhere in the tree, not evaluated
  // independently at the root. Was z-30, which let QueueFloatingWidget (z-40, see that
  // file) and even a page's own sticky content bar (z-30, e.g. Billing.tsx) paint over
  // the whole header including those dropdowns. z-45 clears both while staying below
  // z-50 modals, which must still cover the header when open.
  return (
    <header className="bg-white/95 border-b border-gray-100 shadow-elevation-low sticky top-0 z-[45]">
      {!isOnline && (
        <div className="bg-amber-500 text-white text-[11px] font-semibold px-4 py-1 flex items-center justify-center gap-1.5">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline — showing saved data. Changes cannot be saved to server until back online.</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 px-4 lg:px-6 py-3.5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="lg:hidden icon-button p-2 hover:bg-gray-100 hover:shadow-elevation-low rounded-lg transition-all duration-150"
          >
            <Menu className="w-5 h-5" />
          </button>

        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline-flex px-2 py-1 text-xs font-mono bg-gray-100 text-gray-600 rounded border border-gray-200">
            Build {BUILD_VERSION}
          </span>
          <span
            className={`inline-flex px-2 py-1 text-xs font-medium rounded border ${
              role === 'operator'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-primary/10 text-primary border-primary/20'
            }`}
          >
            {roleLabel}
          </span>
          <NotificationBell />
          <div className="relative" ref={profileRef}>
            <button
              aria-label="User profile"
              onClick={() => setProfileOpen((open) => !open)}
              className="flex items-center gap-2.5 p-1.5 pr-2.5 sm:pr-3 hover:bg-surface-subtle rounded-2xl transition-all border border-transparent hover:border-primary/10 group"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-bright flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">
                {initials}
              </div>
              <div className="text-left hidden sm:block leading-tight">
                <p className="text-xs font-bold text-text-primary group-hover:text-primary transition-colors">
                  {displayName}
                </p>
                <p className="text-[10px] text-text-secondary">{roleLabel} Profile</p>
              </div>
              <ChevronDown
                className={`hidden sm:block w-3.5 h-3.5 text-text-muted transition-transform ${profileOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {profileOpen && (
              // z-[60], not z-50 — see NotificationBell.tsx: QueueFloatingWidget is also
              // z-50 and mounts after Header, so at equal z-index it paints on top and
              // buries this menu behind it.
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-primary/10 rounded-2xl shadow-elevation-high z-[60] py-2">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-xs text-text-secondary">Logged in as</p>
                  <p className="text-xs font-bold text-text-primary mt-0.5">
                    {role !== 'admin' && userName ? `${userName} (${roleLabel})` : roleLabel}
                  </p>
                </div>
                {role === 'admin' ? (
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      navigate('/admin')
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-text-primary hover:bg-primary-surface transition-colors"
                  >
                    <User className="w-4 h-4 text-primary" />
                    Admin
                  </button>
                ) : hasZoneAccess ? (
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      navigate('/doctor-profile')
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-text-primary hover:bg-primary-surface transition-colors"
                  >
                    <User className="w-4 h-4 text-primary" />
                    {roleLabel} Zone
                  </button>
                ) : null}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="icon-button p-2 hover:bg-red-50 hover:shadow-elevation-low rounded-lg transition-all duration-150 group"
            title="Logout"
          >
            <LogOut className="w-5 h-5 text-text-secondary group-hover:text-red-600" />
          </button>
        </div>
      </div>
    </header>
  )
}
