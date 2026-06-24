import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

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
  const [patients, setPatients] = useState<any[]>([])
  const [formData, setFormData] = useState({
    patient_id: defaultPatientId,
    date: format(selectedDate, 'yyyy-MM-dd'),
    time: '09:00',
    duration: '30',
    type: 'Checkup',
    status: 'Scheduled',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPatients()
  }, [])

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, patient_code')
      .order('last_name')
    setPatients(data || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
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

      const hasConflict = dayAppts?.some(appt => {
        const apptStart = new Date(appt.date_time)
        const apptEnd = new Date(apptStart.getTime() + appt.duration * 60000)
        return startDateTime < apptEnd && endDateTime > apptStart
      })

      if (hasConflict) {
        alert('An appointment is already scheduled during this time slot')
        setSaving(false)
        return
      }

      const { error } = await supabase.from('appointments').insert([
        {
          patient_id: formData.patient_id,
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
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">New Appointment</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Patient *</label>
            <select
              required
              value={formData.patient_id}
              onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={!!defaultPatientId}
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.patient_code ? `${p.patient_code} - ` : ''}{p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>

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
