import { useState, useEffect } from 'react'
import { Plus, Calendar as CalendarIcon, Clock, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

interface Appointment {
  id: string
  patient_id: string
  date_time: string
  duration: number
  type: string
  status: string
  notes: string | null
  patients: {
    first_name: string
    last_name: string
  }
}

export function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    loadAppointments()
  }, [selectedDate])

  async function loadAppointments() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patients (first_name, last_name)
        `)
        .gte('date_time', `${selectedDate}T00:00:00`)
        .lt('date_time', `${selectedDate}T23:59:59`)
        .order('date_time', { ascending: true })

      if (error) throw error
      setAppointments(data || [])
    } catch (error) {
      console.error('Error loading appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function deleteAppointment(id: string) {
    if (!confirm('Cancel this appointment?')) return

    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id)
      if (error) throw error
      setAppointments(appointments.filter((a) => a.id !== id))
    } catch (error) {
      console.error('Error deleting appointment:', error)
      alert('Failed to cancel appointment')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-text-secondary mt-1">Schedule and manage appointments</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Appointment
        </Button>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <CalendarIcon className="w-5 h-5 text-primary" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="text-sm text-text-secondary">
            {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-8 text-text-secondary">Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            No appointments scheduled for this date
          </div>
        ) : (
          <div className="space-y-3">
            {appointments.map((apt) => (
              <AppointmentCard
                key={apt.id}
                appointment={apt}
                onDelete={() => deleteAppointment(apt.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AppointmentModal
          onClose={() => setShowModal(false)}
          onSave={() => { loadAppointments(); setShowModal(false) }}
          defaultDate={selectedDate}
        />
      )}
    </div>
  )
}

function AppointmentCard({ appointment, onDelete }: { appointment: Appointment; onDelete: () => void }) {
  const time = format(new Date(appointment.date_time), 'h:mm a')
  const statusColors: Record<string, string> = {
    Scheduled: 'bg-blue-100 text-blue-700',
    Confirmed: 'bg-green-100 text-green-700',
    Completed: 'bg-gray-100 text-gray-700',
    Cancelled: 'bg-red-100 text-red-700',
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div className="flex-shrink-0">
        <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-semibold">
          {appointment.patients.first_name[0]}{appointment.patients.last_name[0]}
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">
            {appointment.patients.first_name} {appointment.patients.last_name}
          </p>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[appointment.status] || 'bg-gray-100'}`}>
            {appointment.status}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1 text-sm text-text-secondary">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {time} ({appointment.duration} min)
          </span>
          <span>{appointment.type}</span>
        </div>
        {appointment.notes && (
          <p className="text-sm text-text-secondary mt-1">{appointment.notes}</p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onDelete}>
        Cancel
      </Button>
    </div>
  )
}

function AppointmentModal({ onClose, onSave, defaultDate }: { onClose: () => void; onSave: () => void; defaultDate: string }) {
  const [patients, setPatients] = useState<any[]>([])
  const [formData, setFormData] = useState({
    patient_id: '',
    date: defaultDate,
    time: '09:00',
    duration: 30,
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
      .select('id, first_name, last_name')
      .order('last_name')
    setPatients(data || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase.from('appointments').insert([{
        patient_id: formData.patient_id,
        date_time: `${formData.date}T${formData.time}:00`,
        duration: formData.duration,
        type: formData.type,
        status: formData.status,
        notes: formData.notes || null,
      }])

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
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date *</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time *</label>
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
              <input
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
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
