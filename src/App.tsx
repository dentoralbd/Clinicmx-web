import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Patients = lazy(() => import('./pages/Patients').then(m => ({ default: m.Patients })))
const Appointments = lazy(() => import('./pages/Appointments').then(m => ({ default: m.Appointments })))
const Treatments = lazy(() => import('./pages/Treatments').then(m => ({ default: m.Treatments })))
const Prescriptions = lazy(() => import('./pages/Prescriptions').then(m => ({ default: m.Prescriptions })))
const Billing = lazy(() => import('./pages/Billing').then(m => ({ default: m.Billing })))
const PatientProfile = lazy(() => import('./pages/PatientProfile').then(m => ({ default: m.PatientProfile })))
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })))
const DoctorProfile = lazy(() => import('./pages/DoctorProfile').then(m => ({ default: m.DoctorProfile })))
const QrSearch = lazy(() => import('./pages/QrSearch').then(m => ({ default: m.QrSearch })))

const queryClient = new QueryClient()

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="patients" element={<Patients />} />
              <Route path="patients/:id" element={<PatientProfile />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="treatments" element={<Treatments />} />
              <Route path="prescriptions" element={<Prescriptions />} />
              <Route path="billing" element={<Billing />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="qr-search" element={<QrSearch />} />
              <Route path="doctor-profile" element={<DoctorProfile />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
