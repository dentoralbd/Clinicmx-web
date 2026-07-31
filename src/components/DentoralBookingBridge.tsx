import { useState, useEffect } from 'react'
import { Globe, RefreshCw, CheckCircle, Phone, MessageSquare, AlertCircle, Calendar, Clock, UserCheck, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { loadScheduleContext, getWindowsForDay } from '@/lib/appointmentSchedule'

interface DentoralAppointment {
  id: string
  name: string
  phone: string
  gender?: string
  age?: string
  entryType?: string
  doctor: string
  treatment: string
  date: string
  createdAt: string
  status: string
}

interface PatientMatch {
  id: string
  first_name: string
  last_name: string
  phone: string
  patient_code?: string
  patient_type?: string
}

export function DentoralBookingBridge({ onImportSuccess }: { onImportSuccess?: () => void }) {
  const [serials, setSerials] = useState<DentoralAppointment[]>([])
  const [loading, setLoading] = useState(false)
  const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem('dentoral_bridge_pw') || '')
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  
  // Interactive Confirmation Modal State
  const [selectedApp, setSelectedApp] = useState<DentoralAppointment | null>(null)
  const [matchingPatients, setMatchingPatients] = useState<PatientMatch[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string>('NEW')
  const [apptDate, setApptDate] = useState<string>('')
  const [apptTime, setApptTime] = useState<string>('18:30')
  const [apptDuration, setApptDuration] = useState<number>(30)
  const [confirming, setConfirming] = useState<boolean>(false)

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

  // Open modal & search for matching patients by phone/name
  const openConfirmModal = async (app: DentoralAppointment) => {
    setSelectedApp(app)
    setApptDate(app.date || new Date().toISOString().split('T')[0])
    setApptTime('18:30')
    setApptDuration(30)
    setSelectedPatientId('NEW')

    const cleanPhone = (app.phone || '').replace(/[^0-9]/g, '')
    const nameParts = (app.name || '').trim().split(' ')
    const firstName = nameParts[0] || ''

    try {
      let query = supabase.from('patients').select('id, first_name, last_name, phone, patient_code, patient_type')
      
      if (cleanPhone.length >= 6) {
        query = query.or(`phone.ilike.%${cleanPhone}%,first_name.ilike.%${firstName}%`)
      } else {
        query = query.ilike('first_name', `%${firstName}%`)
      }

      const { data } = await query.limit(5)
      const matches = (data || []) as PatientMatch[]
      setMatchingPatients(matches)

      if (matches.length > 0) {
        setSelectedPatientId(matches[0].id) // default to first match
      }
    } catch (err) {
      console.warn('Error searching matching patients:', err)
      setMatchingPatients([])
    }
  }

  // Execute confirmation & schedule insertion with clinic hours & overlap verification
  const handleFinalConfirm = async () => {
    if (!selectedApp) return
    setConfirming(true)

    try {
      // 1. Check clinic schedule first (Clinic Hours / overrides)
      const selectedDateObj = new Date(apptDate)
      const scheduleCtx = await loadScheduleContext(selectedDateObj, selectedDateObj)
      const windows = getWindowsForDay(selectedDateObj, scheduleCtx)

      if (windows.length === 0) {
        alert('⚠️ The clinic is closed on this date according to Clinic Hours settings. Please choose a different date.')
        setConfirming(false)
        return
      }

      // Convert selected time to minutes from midnight
      const [sh, sm] = apptTime.split(':').map(Number)
      const apptStartMin = sh * 60 + sm
      const apptEndMin = apptStartMin + apptDuration

      const isWithinClinicHours = windows.some(w => {
        const wStartMin = w.start_hour * 60 + w.start_minute
        const wEndMin = w.end_hour * 60 + w.end_minute
        return apptStartMin >= wStartMin && apptEndMin <= wEndMin
      })

      if (!isWithinClinicHours) {
        const openHoursStr = windows.map(w => 
          `${String(w.start_hour).padStart(2, '0')}:${String(w.start_minute).padStart(2, '0')} - ${String(w.end_hour).padStart(2, '0')}:${String(w.end_minute).padStart(2, '0')}`
        ).join(', ')
        alert(`⚠️ Selected time falls outside of scheduled Clinic Hours on this day.\n\nOpen hours: ${openHoursStr || 'None'}.\nPlease choose a different time slot.`)
        setConfirming(false)
        return
      }

      // 2. Check for double booking conflicts in Clinicmx
      const startOfDay = new Date(selectedDateObj)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(selectedDateObj)
      endOfDay.setHours(23, 59, 59, 999)

      const { data: dayAppts, error: fetchErr } = await supabase
        .from('appointments')
        .select('id, date_time, duration, status')
        .gte('date_time', startOfDay.toISOString())
        .lte('date_time', endOfDay.toISOString())
        .neq('status', 'Cancelled')

      if (fetchErr) throw fetchErr

      const startDateTime = new Date(`${apptDate}T${apptTime}:00`)
      const endDateTime = new Date(startDateTime.getTime() + apptDuration * 60000)

      const hasOverlap = (dayAppts || []).some(appt => {
        const apptStart = new Date(appt.date_time)
        const apptEnd = new Date(apptStart.getTime() + appt.duration * 60000)
        return startDateTime < apptEnd && endDateTime > apptStart
      })

      if (hasOverlap) {
        alert('⚠️ Another appointment is already scheduled during this time slot. Please choose a different time.')
        setConfirming(false)
        return
      }

      let finalPatientId = selectedPatientId

      // 3. Create new patient if 'NEW'
      if (selectedPatientId === 'NEW') {
        const nameParts = (selectedApp.name || 'Web Patient').trim().split(' ')
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(' ') || 'Patient'
        const cleanPhone = (selectedApp.phone || '').replace(/[^0-9+]/g, '')

        const targetType = selectedApp.entryType === 'followup' ? 'full' : 'consultation'
        const parsedAge = selectedApp.age ? parseInt(selectedApp.age) : null
        
        let dateOfBirth: string | null = null
        if (parsedAge) {
          const today = new Date()
          const approxBirth = new Date(today.getFullYear() - parsedAge, today.getMonth(), today.getDate())
          dateOfBirth = approxBirth.toISOString().split('T')[0]
        }

        const { data: newPatient, error: ptErr } = await supabase
          .from('patients')
          .insert([{
            first_name: firstName,
            last_name: lastName,
            phone: cleanPhone,
            gender: selectedApp.gender || 'Male',
            date_of_birth: dateOfBirth, // Use valid date_of_birth column instead of non-existent age column
            patient_type: targetType
          }])
          .select('id')
          .single()

        if (ptErr) throw ptErr
        if (newPatient) finalPatientId = newPatient.id
      }

      // 4. Insert Appointment record
      const { error: apptErr } = await supabase.from('appointments').insert([{
        patient_id: finalPatientId,
        date_time: startDateTime.toISOString(),
        duration: apptDuration,
        type: selectedApp.treatment || 'Consultation',
        status: 'Confirmed',
        notes: `Imported from DentOral Web Serial #${selectedApp.id} (${selectedApp.doctor})`
      }])

      if (apptErr) throw apptErr

      // 5. Update status on DentOral live KV database
      await fetch(`https://dentoralbd.pages.dev/api/appointments?action=update_status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ id: selectedApp.id, status: 'Confirmed' })
      })

      alert(`✅ Serial #${selectedApp.id} for ${selectedApp.name} confirmed for ${apptDate} at ${apptTime}!`)

      setSelectedApp(null)
      fetchSerials()
      if (onImportSuccess) onImportSuccess()
    } catch (err: any) {
      console.error('Confirmation error:', err)
      alert(`⚠️ Failed to confirm appointment: ${err.message || 'Check database connection'}`)
    } finally {
      setConfirming(false)
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
                <div className="text-slate-500 text-[11px] mt-0.5">
                  {app.treatment} • Requested: {app.date} • {app.createdAt}
                </div>
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
                  onClick={() => openConfirmModal(app)}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  Confirm & Schedule
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Interactive Confirm & Schedule Modal */}
      {selectedApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center pb-3 border-b mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-teal-600" />
                  Confirm & Schedule Serial #{selectedApp.id}
                </h3>
                <p className="text-xs text-slate-500">Assign patient and set manual appointment time slot</p>
              </div>
              <button onClick={() => setSelectedApp(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">

              {/* Patient Match Selection */}
              <div className="bg-slate-50 p-3 rounded-lg border">
                <label className="font-bold text-slate-800 block mb-1.5">1. Patient Entry Selection:</label>
                
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 p-2 bg-white rounded border cursor-pointer hover:bg-teal-50/50">
                    <input
                      type="radio"
                      name="patientMatch"
                      value="NEW"
                      checked={selectedPatientId === 'NEW'}
                      onChange={() => setSelectedPatientId('NEW')}
                      className="text-teal-600"
                    />
                    <UserPlus className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900 block">Add as New Consultation Patient</span>
                      <span className="text-[11px] text-slate-500">
                        {selectedApp.name} • {selectedApp.phone} • {selectedApp.gender || 'Male'} • Age: {selectedApp.age || 'N/A'}
                      </span>
                    </div>
                  </label>

                  {matchingPatients.length > 0 && (
                    <div className="pt-2">
                      <div className="text-[11px] font-semibold text-slate-600 mb-1">Matching Patients Found in Clinicmx:</div>
                      {matchingPatients.map((match) => (
                        <label key={match.id} className="flex items-center gap-2 p-2 bg-white rounded border cursor-pointer hover:bg-blue-50/50 mb-1">
                          <input
                            type="radio"
                            name="patientMatch"
                            value={match.id}
                            checked={selectedPatientId === match.id}
                            onChange={() => setSelectedPatientId(match.id)}
                            className="text-blue-600"
                          />
                          <UserCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {match.first_name} {match.last_name} {match.patient_code ? `(${match.patient_code})` : ''}
                            </span>
                            <span className="text-[11px] text-slate-500">Phone: {match.phone || 'N/A'} • Type: {match.patient_type || 'consultation'}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Date & Time Picker */}
              <div className="bg-slate-50 p-3 rounded-lg border">
                <label className="font-bold text-slate-800 block mb-2">2. Manual Date & Time Schedule:</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Appointment Date *</label>
                    <input
                      type="date"
                      value={apptDate}
                      onChange={(e) => setApptDate(e.target.value)}
                      className="w-full border rounded p-2 text-xs bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Time Slot *</label>
                    <input
                      type="time"
                      value={apptTime}
                      onChange={(e) => setApptTime(e.target.value)}
                      className="w-full border rounded p-2 text-xs bg-white"
                      required
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-slate-600 font-medium mb-1">Duration (Minutes)</label>
                  <select
                    value={apptDuration}
                    onChange={(e) => setApptDuration(parseInt(e.target.value))}
                    className="w-full border rounded p-2 text-xs bg-white"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes (Standard)</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>
              </div>

              {/* Booking Context Note */}
              <div className="text-[11px] text-slate-500 bg-amber-50 p-2.5 rounded border border-amber-200">
                📌 <strong>Doctor:</strong> {selectedApp.doctor}<br/>
                🦷 <strong>Treatment:</strong> {selectedApp.treatment}
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button variant="outline" size="sm" onClick={() => setSelectedApp(null)} disabled={confirming}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={handleFinalConfirm}
                disabled={confirming}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {confirming ? 'Saving & Scheduling...' : '💾 Confirm Serial & Schedule'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
