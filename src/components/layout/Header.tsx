import { useEffect, useRef, useState } from 'react'
import { Bell, User, Menu, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clearSecureStorageSession } from '@/lib/secureLocalStorage'
import { canDelete, canEditClinicProfile, canRevert, clearAppRole, clearAppUser, getAppRole, getAppUser } from '@/lib/appSession'

interface HeaderProps {
  onMenuClick: () => void
}

const BUILD_VERSION = 'a26fa94'

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const role = getAppRole()
  const roleLabel = role === 'admin' ? 'Admin' : role === 'doctor' ? 'Doctor' : 'Operator'
  const userName = getAppUser()?.name
  const hasZoneAccess = canEditClinicProfile() || canRevert() || canDelete()

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

  function handleLogout() {
    clearSecureStorageSession()
    localStorage.removeItem('clinicmx_auth')
    clearAppRole()
    clearAppUser()
    navigate('/login')
  }

  return (
    <header className="bg-white border-b border-gray-200 shadow-elevation-low px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between gap-4">
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
          <button aria-label="Notifications" className="icon-button p-2 hover:bg-gray-100 hover:shadow-elevation-low rounded-lg transition-all duration-150 relative">
            <Bell className="w-5 h-5 text-text-secondary" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="relative" ref={profileRef}>
            <button
              aria-label="User profile"
              onClick={() => setProfileOpen((open) => !open)}
              className="icon-button p-2 hover:bg-gray-100 hover:shadow-elevation-low rounded-lg transition-all duration-150"
            >
              <User className="w-5 h-5 text-text-secondary" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm text-text-secondary">Logged in as</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {role !== 'admin' && userName ? `${userName} (${roleLabel})` : roleLabel}
                  </p>
                </div>
                {role === 'admin' ? (
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      navigate('/admin')
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User className="w-4 h-4 text-text-secondary" />
                    Admin
                  </button>
                ) : hasZoneAccess ? (
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      navigate('/doctor-profile')
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User className="w-4 h-4 text-text-secondary" />
                    Doctor Zone
                  </button>
                ) : null}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
