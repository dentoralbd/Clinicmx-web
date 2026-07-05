import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Calendar, FileText, DollarSign, Package, QrCode, X, UserCircle, Sparkles } from 'lucide-react'
import { canDelete } from '@/lib/appSession'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  onNavClick: () => void
  designPreview: boolean
  onToggleDesignPreview: () => void
}

const menuGroups = [
  {
    label: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    ],
  },
  {
    label: 'Patient Care',
    items: [
      { icon: Users, label: 'Patients', path: '/patients' },
      { icon: Calendar, label: 'Appointments', path: '/appointments' },
      { icon: FileText, label: 'Prescriptions', path: '/prescriptions' },
    ],
  },
  {
    label: 'Practice',
    items: [
      { icon: DollarSign, label: 'Billing', path: '/billing' },
      { icon: Package, label: 'Inventory', path: '/inventory' },
      { icon: QrCode, label: 'QR Search', path: '/qr-search' },
    ],
  },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-150 ${
    isActive
      ? 'bg-gradient-to-r from-primary to-primary-hover text-white shadow-elevation-md'
      : 'text-text-secondary hover:bg-primary/5 hover:text-primary hover:translate-x-0.5'
  }`

const iconChipClass = (isActive: boolean) =>
  `flex items-center justify-center rounded-lg p-1.5 transition-colors duration-150 ${
    isActive ? 'bg-white/20' : 'bg-gray-100 group-hover:bg-primary/10'
  }`

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/70 select-none">
      {children}
    </p>
  )
}

export function Sidebar({ isOpen, onClose, onNavClick, designPreview, onToggleDesignPreview }: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-white border-r border-gray-200 shadow-elevation-md
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-br from-primary/5 to-highlight/5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/10 to-highlight/10 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-elevation-low">
                <img src="/logo.png" alt="ClinicMx Logo" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary">ClinicMx</h1>
                <p className="text-sm text-text-secondary">Dental Management</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close sidebar"
              className="lg:hidden icon-button p-2 hover:bg-gray-100 hover:shadow-elevation-low rounded-lg transition-all duration-150"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          <nav className="flex-1 px-4 pb-4 space-y-1 overflow-y-auto">
            {menuGroups.map((group) => (
              <div key={group.label}>
                <SectionLabel>{group.label}</SectionLabel>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onNavClick}
                      className={navLinkClass}
                    >
                      {({ isActive }) => (
                        <>
                          <span className={iconChipClass(isActive)}>
                            <item.icon className="w-5 h-5" />
                          </span>
                          <span>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}

            {/* Settings section — doctor only */}
            {canDelete() && (
              <div>
                <SectionLabel>Settings</SectionLabel>
                <NavLink
                  to="/doctor-profile"
                  onClick={onNavClick}
                  className={navLinkClass}
                >
                  {({ isActive }) => (
                    <>
                      <span className={iconChipClass(isActive)}>
                        <UserCircle className="w-5 h-5" />
                      </span>
                      <span>Doctor Zone</span>
                    </>
                  )}
                </NavLink>
              </div>
            )}
          </nav>

          <div className="p-4 border-t border-gray-200 space-y-2">
            <button
              onClick={onToggleDesignPreview}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 text-sm font-medium ${
                designPreview
                  ? 'bg-gradient-to-r from-primary to-primary-hover text-white shadow-elevation-low'
                  : 'text-text-secondary hover:bg-primary/5 hover:text-primary border border-dashed border-gray-300'
              }`}
            >
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              <span>Design Preview</span>
              <span className={`ml-auto text-xs rounded px-1.5 py-0.5 font-semibold ${
                designPreview ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
              }`}>{designPreview ? 'ON' : 'OFF'}</span>
            </button>
            <p className="text-[11px] text-text-secondary text-center">
              Version 1.0.1 · © 2026 ClinicMx
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
