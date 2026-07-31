import { useState, useEffect } from 'react'
import { Globe, RefreshCw, CheckCircle, Phone, MessageSquare, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

interface DentoralAppointment {
  id: string
  name: string
  phone: string
  doctor: string
  treatment: string
  date: string
  createdAt: string
  status: string
}

export function DentoralBookingBridge({ onImportSuccess }: { onImportSuccess?: () => void }) {
  const [serials, setSerials] = useState<DentoralAppointment[]>([])
  const [loading, setLoading] = useState(false)
  const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem('dentoral_bridge_pw') || '')
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)

  const fetchSerials = async (pw?: string) => {
    const key = pw || adminPassword
    if (!key) {
      setShowPasswordPrompt(true)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`https://dentoralbd.pages.dev/api/appointments`, {
        headers: { 'X-Admin-Password': key }
      })

      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setSerials(data.filter((a: DentoralAppointment) => a.status === 'Pending'))
          setShowPasswordPrompt(false)
        } else if (data.error === 'Unauthorized') {
          setShowPasswordPrompt(true)
        }
      }
    } catch (err) {
      console.warn('Failed to fetch DentOral serials:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (adminPassword) fetchSerials()
  }, [])

  const savePassword = (val: string) => {
    setAdminPassword(val)
    localStorage.setItem('dentoral_bridge_pw', val)
    fetchSerials(val)
  }

  const confirmAndImportToClinicmx = async (app: DentoralAppointment) => {
    setImportingId(app.id)
    try {
      // 1. Update status on DentOral live KV database
      await fetch(`https://dentoralbd.pages.dev/api/appointments?action=update_status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ id: app.id, status: 'Confirmed' })
      })

      // 2. Import into Clinicmx Supabase appointments if matching patient exists or create lightweight record
      const cleanPhone = (app.phone || '').replace(/[^0-9+]/g, '')

      // Try searching patient by phone in Supabase
      const { data: existingPatients } = await supabase
        .from('patients')
        .select('id, first_name, last_name')
        .eq('phone', cleanPhone)
        .limit(1)

      let patientId = existingPatients && existingPatients.length > 0 ? existingPatients[0].id : null

      if (!patientId) {
        // Create new patient in Clinicmx
        const nameParts = (app.name || 'Web Patient').split(' ')
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(' ') || 'Patient'

        const { data: newPatient } = await supabase
          .from('patients')
          .insert([{
            first_name: firstName,
            last_name: lastName,
            phone: cleanPhone,
            patient_type: 'consultation'
          }])
          .select('id')
          .single()

        if (newPatient) patientId = newPatient.id
      }

      if (patientId) {
        // Create appointment in Clinicmx
        await supabase.from('appointments').insert([{
          patient_id: patientId,
          date_time: new Date().toISOString(),
          duration: 30,
          type: app.treatment || 'DentOral Web Serial',
          status: 'Confirmed',
          notes: `Imported from DentOral Web Serial #${app.id} (${app.doctor})`
        }])
      }

      alert(`✅ Serial #${app.id} for ${app.name} has been CONFIRMED and added to Consultations list in Clinicmx!`)
      fetchSerials()
      if (onImportSuccess) onImportSuccess()
    } catch (err) {
      console.error('Import error:', err)
      alert(`Serial #${app.id} marked confirmed on DentOral.`)
      fetchSerials()
    } finally {
      setImportingId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border-2 border-teal-100 p-4 shadow-sm mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 text-teal-700 rounded-lg">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">DentOral Web Serial Requests (Waiting Confirmation)</h3>
            <p className="text-xs text-slate-500">Live online patient bookings from dentoralbd.pages.dev</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-full font-bold">
            {serials.length} Waiting
          </span>
          <Button size="sm" variant="outline" onClick={() => fetchSerials()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {showPasswordPrompt ? (
        <div className="bg-slate-50 p-3 rounded-lg border text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>Enter DentOral Admin Password to sync:</span>
          <input
            type="password"
            className="border px-2 py-1 rounded text-xs"
            placeholder="Admin Password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') savePassword((e.target as HTMLInputElement).value)
            }}
          />
          <Button size="sm" onClick={(e) => {
            const input = (e.currentTarget.previousElementSibling as HTMLInputElement)?.value
            if (input) savePassword(input)
          }}>Connect</Button>
        </div>
      ) : serials.length === 0 ? (
        <div className="text-center py-4 text-xs text-slate-500 bg-slate-50 rounded-lg">
          ✨ No pending online serial requests right now. New bookings will appear here automatically.
        </div>
      ) : (
        <div className="space-y-2">
          {serials.map((app) => (
            <div key={app.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border text-xs flex-wrap gap-2">
              <div>
                <span className="font-mono font-bold text-teal-700 mr-2">#{app.id}</span>
                <span className="font-bold text-slate-900 mr-2">{app.name}</span>
                <span className="text-slate-500 mr-2">📞 {app.phone}</span>
                <span className="bg-teal-50 text-teal-800 px-2 py-0.5 rounded font-semibold">{app.doctor}</span>
                <div className="text-slate-500 text-[11px] mt-0.5">{app.treatment} • {app.createdAt}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <a href={`tel:${app.phone.replace(/[^0-9+]/g, '')}`} className="p-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100" title="Call Patient">
                  <Phone className="w-3.5 h-3.5" />
                </a>
                <a href={`https://wa.me/${app.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="p-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100" title="WhatsApp Patient">
                  <MessageSquare className="w-3.5 h-3.5" />
                </a>
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-8"
                  disabled={importingId === app.id}
                  onClick={() => confirmAndImportToClinicmx(app)}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  {importingId === app.id ? 'Importing...' : 'Confirm & Add to Schedule'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
