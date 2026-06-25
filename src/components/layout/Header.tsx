import { Bell, Search, User, Menu, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  onMenuClick: () => void
}

const BUILD_VERSION = 'a26fa94'

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('clinicmx_auth')
    navigate('/login')
  }

  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="lg:hidden icon-button p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="relative flex-1 max-w-md hidden sm:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <input
              type="text"
              placeholder="Search patients, appointments..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline-flex px-2 py-1 text-xs font-mono bg-gray-100 text-gray-600 rounded border border-gray-200">
            Build {BUILD_VERSION}
          </span>
          <button aria-label="Notifications" className="icon-button p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
            <Bell className="w-5 h-5 text-text-secondary" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <button aria-label="User profile" className="icon-button p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <User className="w-5 h-5 text-text-secondary" />
          </button>
          <button 
            onClick={handleLogout}
            aria-label="Logout"
            className="icon-button p-2 hover:bg-red-50 rounded-lg transition-colors group"
            title="Logout"
          >
            <LogOut className="w-5 h-5 text-text-secondary group-hover:text-red-600" />
          </button>
        </div>
      </div>
    </header>
  )
}
