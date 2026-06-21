import { Bell, Search } from 'lucide-react'

export function Header() {
  return (
    <header className="bg-card border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <input
              type="text"
              placeholder="Search patients, appointments..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell className="w-5 h-5 text-text-secondary" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white font-semibold">
              D
            </div>
            <div>
              <p className="text-sm font-medium">Dr. Admin</p>
              <p className="text-xs text-text-secondary">Dentist</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
