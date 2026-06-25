import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { createPatient } from '@/lib/patients'
import { UserPlus, Users } from 'lucide-react'

export function AppointmentModal({ 
  selectedDate, 
  onClose, 
  onSave, 
  defaultPatientId = '' 
}: { 
  selectedDate: Date, 
  onClose: () => void, 
  onSave: () => void,
  defaultPatientId?: string 
}) {
  const [patientMode, setPatientMode] = useState<'existing' | 'new'>(defaultPatientId ? 'existing' : 'existing')
  const [patients, setPatients] = useState<any[]>([])
  const [formData, setFormData] = useState({
    patient_id: defaultPatientId || '',
    date: format(selectedDate, 'yyyy-MM-dd'),
    time: '09:00',
    duration: '30',
    type: 'Checkup',
    status: 'Scheduled',
    notes: '',
  })
  const [newPatientData, setNewPatientData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: 'Male',
    phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [patientLookup, setPatientLookup] = useState('')
  const [patientLookupMessage, setPatientLookupMessage] = useState<string | null>(null)

  useEffect(() => {
    loadPatients()
  }, [])

  useEffect(() => {
    if (!defaultPatientId || patients.length === 0) return

    const patient = patients.find((p) => p.id === defaultPatientId)
    if (patient) {
      setFormData((prev) => ({ ...prev, patient_id: patient.id }))
      setPatientLookup(patient.patient_code || patient.id)
      setPatientLookupMessage(`Using existing patient ${patient.first_name} ${patient.last_name}`)
    }
  }, [defaultPatientId, patients])

  async function loadPatients() {
    try {
      setLoadError(null)
      const { data, error } = await supabase
        .from('patients')
        .select('id, first_name, last_name, patient_code')
        .order('last_name')

      if (error) throw error
      setPatients(data || [])
    } catch (error) {
      console.error('Error loading patients:', error)
      setLoadError('Unable to load patients right now. You can still create a new appointment for a new patient.')
      setPatients([])
    }
  }

  function handlePatientLookup() {
    const lookup = patientLookup.trim()

    if (!lookup) {
      setPatientLookupMessage('Enter a patient UID or patient code to use an existing patient.')
      setFormData((prev) => ({ ...prev, patient_id: '' }))
      return
    }

    const matchedPatient = patients.find((patient) => {
      const normalizedLookup = lookup.toLowerCase()
      const normalizedId = (patient.id || '').toLowerCase()
      const normalizedCode = (patient.patient_code || '').toLowerCase()
      return normalizedId === normalizedLookup || normalizedCode === normalizedLookup
    })

    if (matchedPatient) {
      setFormData((prev) => ({ ...prev, patient_id: matchedPatient.id }))
      setPatientMode('existing')
      setPatientLookupMessage(`Using existing patient ${matchedPatient.first_name} ${matchedPatient.last_name}`)
      return
    }

    setFormData((prev) => ({ ...prev, patient_id: '' }))
    setPatientLookupMessage('No matching patient found. Switch to New Patient to create one.')
  }

  function handleExistingPatientSelect(patientId: string) {
    const matchedPatient = patients.find((patient) => patient.id === patientId)
    if (matchedPatient) {
      setFormData((prev) => ({ ...prev, patient_id: matchedPatient.id }))
      setPatientLookup(matchedPatient.patient_code || matchedPatient.id)
      setPatientLookupMessage(`Using existing patient ${matchedPatient.first_name} ${matchedPatient.last_name}`)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      let patientId = formData.patient_id

      // Create new patient if needed
      if (patientMode === 'new') {
        if (!newPatientData.first_name || !newPatientData.last_name || !newPatientData.phone) {
          alert('Please fill in all required patient fields')
          setSaving(false)
          return
        }

        const newPatient = await createPatient({
          first_name: newPatientData.first_name,
          last_name: newPatientData.last_name,
          date_of_birth: newPatientData.date_of_birth || null,
          gender: newPatientData.gender,
          phone: newPatientData.phone,
        })

        patientId = newPatient.id
        const patientCode = (newPatient as { id: string; patient_code?: string | null }).patient_code || null
        setPatientLookup(patientCode || patientId)
        setPatientLookupMessage(`Created new patient UID: ${patientCode || patientId}`)
      }

      if (!patientId) {
        alert('Please enter a valid patient UID/code or create a new patient first')
        setSaving(false)
        return
      }

      // Check for overlapping appointments
      const startDateTime = new Date(`${formData.date}T${formData.time}:00`)
      const endDateTime = new Date(startDateTime.getTime() + parseInt(formData.duration) * 60000)

      const startOfDay = new Date(startDateTime)
      startOfDay.setHours(0, 0, 0, 0)
      
      const endOfDay = new Date(startDateTime)
      endOfDay.setHours(23, 59, 59, 999)

      const { data: dayAppts, error: fetchError } = await supabase
        .from('appointments')
        .select('date_time, duration, status')
        .gte('date_time', startOfDay.toISOString())
        .lte('date_time', endOfDay.toISOString())
        .neq('status', 'Cancelled')

      if (fetchError) throw fetchError
      const appointmentsForDay = (dayAppts || []) as Array<{ date_time: string; duration: number }>

      const hasConflict = appointmentsForDay.some(appt => {
        const apptStart = new Date(appt.date_time)
        const apptEnd = new Date(apptStart.getTime() + appt.duration * 60000)
        return startDateTime < apptEnd && endDateTime > apptStart
      })

      if (hasConflict) {
        alert('An appointment is already scheduled during this time slot')
        setSaving(false)
        return
      }

      const appointmentsTable: any = supabase.from('appointments')
      const { error } = await appointmentsTable.insert([
        {
          patient_id: patientId,
          date_time: startDateTime.toISOString(),
          duration: parseInt(formData.duration),
          type: formData.type,
          status: formData.status,
          notes: formData.notes || null,
        }
      ])

      if (error) throw error
      onSave()
    } catch (error) {
      console.error('Error creating appointment:', error)
      alert('Failed to create appointment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold">New Appointment</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Patient Mode Toggle */}
          <div>
            <label className="block text-sm font-medium mb-2">Patient Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPatientMode('existing')}
                className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition ${
                  patientMode === 'existing'
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Users className="w-4 h-4" />
                Existing Patient
              </button>
              <button
                type="button"
                onClick={() => setPatientMode('new')}
                className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition ${
                  patientMode === 'new'
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                New Patient
              </button>
            </div>
          </div>

          {/* Existing Patient Selection */}
          {patientMode === 'existing' && (
            <div>
              <label className="block text-sm font-medium mb-1">Patient UID / Patient Code *</label>
              {loadError && (
                <p className="text-sm text-red-600 mb-2">{loadError}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={patientLookup}
                  onChange={(e) => setPatientLookup(e.target.value)}
                  placeholder="Enter patient UID or code"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button type="button" variant="outline" onClick={handlePatientLookup}>
                  Use Existing
                </Button>
              </div>

              {patientLookupMessage && (
                <p className={`mt-2 text-sm ${patientLookupMessage.includes('Using existing patient') ? 'text-green-600' : patientLookupMessage.includes('Created new patient') ? 'text-blue-600' : 'text-gray-600'}`}>
                  {patientLookupMessage}
                </p>
              )}

              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">Or choose from patients</label>
                <select
                  required={patientMode === 'existing'}
                  value={formData.patient_id}
                  onChange={(e) => handleExistingPatientSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select patient...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.patient_code ? `${p.patient_code} - ` : ''}{p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* New Patient Form */}
          {patientMode === 'new' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={newPatientData.first_name}
                    onChange={(e) => setNewPatientData({ ...newPatientData, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={newPatientData.last_name}
                    onChange={(e) => setNewPatientData({ ...newPatientData, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={newPatientData.date_of_birth}
                    onChange={(e) => setNewPatientData({ ...newPatientData, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Gender</label>
                  <select
                    value={newPatientData.gender}
                    onChange={(e) => setNewPatientData({ ...newPatientData, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Phone *</label>
                <input
                  type="tel"
                  required
                  value={newPatientData.phone}
                  onChange={(e) => setNewPatientData({ ...newPatientData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="+1234567890"
                />
              </div>
            </>
          )}

          {/* Appointment Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time</label>
              <input
                type="time"
                required
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Duration (min)</label>
              <select
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option>Checkup</option>
                <option>Cleaning</option>
                <option>Filling</option>
                <option>Root Canal</option>
                <option>Extraction</option>
                <option>Consultation</option>
                <option>Follow-up</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Creating...' : 'Create Appointment'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
