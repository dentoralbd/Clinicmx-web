import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, idbPersister, CACHE_BUSTER, shouldPersistQuery } from './lib/queryClient'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequirePage } from './components/RequirePage'
import { Login } from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Patients = lazy(() => import('./pages/Patients').then(m => ({ default: m.Patients })))
const Consultations = lazy(() => import('./pages/Consultations').then(m => ({ default: m.Consultations })))
const Appointments = lazy(() => import('./pages/Appointments').then(m => ({ default: m.Appointments })))
const Treatments = lazy(() => import('./pages/Treatments').then(m => ({ default: m.Treatments })))
const Lab = lazy(() => import('./pages/Lab').then(m => ({ default: m.Lab })))
const Prescriptions = lazy(() => import('./pages/Prescriptions').then(m => ({ default: m.Prescriptions })))
const Billing = lazy(() => import('./pages/Billing').then(m => ({ default: m.Billing })))
const PatientProfile = lazy(() => import('./pages/PatientProfile').then(m => ({ default: m.PatientProfile })))
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })))
const DoctorProfile = lazy(() => import('./pages/DoctorProfile').then(m => ({ default: m.DoctorProfile })))
const QrSearch = lazy(() => import('./pages/QrSearch').then(m => ({ default: m.QrSearch })))
const BackupRestore = lazy(() => import('./pages/BackupRestore').then(m => ({ default: m.BackupRestore })))
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const DoctorAnalytics = lazy(() => import('./pages/DoctorAnalytics').then(m => ({ default: m.DoctorAnalytics })))
const FinancialAnalysis = lazy(() => import('./pages/FinancialAnalysis').then(m => ({ default: m.FinancialAnalysis })))
const HRPayroll = lazy(() => import('./pages/HRPayroll').then(m => ({ default: m.HRPayroll })))
const PaymentsLog = lazy(() => import('./pages/PaymentsLog').then(m => ({ default: m.PaymentsLog })))
const OfflineOutbox = lazy(() => import('./pages/OfflineOutbox').then(m => ({ default: m.OfflineOutbox })))
const Catalog = lazy(() => import('./pages/Catalog').then(m => ({ default: m.Catalog })))
const QueueManagement = lazy(() => import('./pages/QueueManagement').then(m => ({ default: m.QueueManagement })))
const QueueDisplay = lazy(() => import('./pages/QueueDisplay').then(m => ({ default: m.QueueDisplay })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: idbPersister,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: (query) => shouldPersistQuery(query),
        },
      }}
    >
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Sibling of "/", not a DashboardLayout child — DashboardLayout
                hard-wires h-screen/overflow-hidden + sidebar + header, so a
                true full-screen board can't live inside it.

                Deliberately NOT wrapped in <ProtectedRoute>: this link is
                meant to be opened in a new tab (QueueManagement's "Open
                Display Board", target="_blank") — the natural way to put a
                TV display on its own screen. ProtectedRoute's check
                requires hasSessionEncryptionKey(), whose key lives in
                sessionStorage, which does NOT share across tabs even on
                the same origin (secureLocalStorage.ts, "dies when the tab
                closes") — a brand-new tab would always fail that check and
                bounce to /login despite being genuinely logged in. This
                route instead relies on QueueDisplay's own internal
                isAppAuthenticated() check, which is plain localStorage and
                correctly shared across tabs. Still the staff/backroom
                display, not the patient-facing board (that's
                dentoralbd.com/queue). */}
            <Route path="/queue-display" element={<QueueDisplay />} />
            <Route path="/" element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="patients" element={<RequirePage page="patients"><Patients /></RequirePage>} />
              <Route path="patients/:id" element={<RequirePage page="patients"><PatientProfile /></RequirePage>} />
              <Route path="consultations" element={<RequirePage page="patients"><Consultations /></RequirePage>} />
              <Route path="appointments" element={<RequirePage page="appointments"><Appointments /></RequirePage>} />
              <Route path="treatments" element={<RequirePage page="treatments"><Treatments /></RequirePage>} />
              <Route path="lab" element={<RequirePage page="lab"><Lab /></RequirePage>} />
              <Route path="prescriptions" element={<RequirePage page="prescriptions"><Prescriptions /></RequirePage>} />
              <Route path="billing" element={<RequirePage page="billing"><Billing /></RequirePage>} />
              <Route path="payments-log" element={<RequirePage page="billing"><PaymentsLog /></RequirePage>} />
              <Route path="inventory" element={<RequirePage page="inventory"><Inventory /></RequirePage>} />
              <Route path="qr-search" element={<RequirePage page="qr-search"><QrSearch /></RequirePage>} />
              <Route path="catalog" element={<RequirePage page="catalog"><Catalog /></RequirePage>} />
              <Route path="queue" element={<RequirePage page="queue"><QueueManagement /></RequirePage>} />
              <Route path="doctor-profile" element={<DoctorProfile />} />
              <Route path="admin" element={<DoctorProfile />} />
              <Route path="backup" element={<BackupRestore />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="doctor-analytics" element={<DoctorAnalytics />} />
              <Route path="financial-analysis" element={<FinancialAnalysis />} />
              <Route path="hr-payroll" element={<HRPayroll />} />
              <Route path="offline-outbox" element={<RequirePage page="patients"><OfflineOutbox /></RequirePage>} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </PersistQueryClientProvider>
  )
}

export default App
