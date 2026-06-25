import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Calendar, FileText, DollarSign, Package, X } from 'lucide-react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: Users, label: 'Patients', path: '/patients' },
    { icon: Calendar, label: 'Appointments', path: '/appointments' },
    { icon: FileText, label: 'Prescriptions', path: '/prescriptions' },
    { icon: DollarSign, label: 'Billing', path: '/billing' },
    { icon: Package, label: 'Inventory', path: '/inventory' },
  ]

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
          w-64 bg-white border-r border-gray-200
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h1 className="text-2xl font-bold text-primary">ClinicMx</h1>
              <p className="text-sm text-text-secondary">Dental Management</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close sidebar"
              className="lg:hidden icon-button p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <div className="text-xs text-text-secondary">
              <p>Version 1.0.1</p>
              <p className="mt-1">© 2026 ClinicMx</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
