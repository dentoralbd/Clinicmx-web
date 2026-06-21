import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Stethoscope,
  FileText,
  Receipt,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Patients', href: '/patients', icon: Users },
  { name: 'Appointments', href: '/appointments', icon: Calendar },
  { name: 'Treatments', href: '/treatments', icon: Stethoscope },
  { name: 'Prescriptions', href: '/prescriptions', icon: FileText },
  { name: 'Billing', href: '/billing', icon: Receipt },
]

export function Sidebar() {
  return (
    <div className="w-64 bg-primary text-white flex flex-col">
      <div className="p-6 flex items-center gap-3">
        <Activity className="w-8 h-8" />
        <div>
          <h1 className="text-xl font-bold">ClinicMx</h1>
          <p className="text-xs text-white/70">Dental Management</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        <p className="text-xs text-white/50">© 2024 ClinicMx</p>
      </div>
    </div>
  )
}
