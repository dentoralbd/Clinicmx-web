import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { BackupReminderBanner } from '@/components/BackupReminderBanner'

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [designPreview, setDesignPreview] = useState(
    () => localStorage.getItem('clinicmx_design_preview') === 'true'
  )

  const toggleDesignPreview = () => {
    setDesignPreview(prev => {
      const next = !prev
      localStorage.setItem('clinicmx_design_preview', String(next))
      return next
    })
  }

  // Called by every nav link click — collapses mobile sidebar AND exits preview
  const handleNavClick = () => {
    setSidebarOpen(false)
    setDesignPreview(false)
    localStorage.setItem('clinicmx_design_preview', 'false')
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavClick={handleNavClick}
        designPreview={designPreview}
        onToggleDesignPreview={toggleDesignPreview}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <BackupReminderBanner />
        {designPreview ? (
          <iframe
            src="/design-preview/ClinicMx.dc.html"
            className="flex-1 w-full border-0"
            title="ClinicMx Design Preview"
          />
        ) : (
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        )}
      </div>
    </div>
  )
}
