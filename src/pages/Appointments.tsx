import { useState, useEffect } from 'react'
import { Plus, CheckCircle, XCircle, ClipboardCheck, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { AppointmentModal } from '@/components/AppointmentModal'

interface Appointment {
  id: string
  patient_id: string
  date_time: string
  duration: number
  type: string
  status: string
  notes: string | null
  created_at: string
  patients: {
    first_name: string
    last_name: string
  }
}

export function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [weekAppointments, setWeekAppointments] = useState<Appointment[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    loadAppointments()
    loadWeekAppointments()
  }, [selectedDate])

  async function loadWeekAppointments() {
    try {
      const weekEnd = addDays(weekStart, 6)
      weekEnd.setHours(23, 59, 59, 999)
      const { data } = await supabase
        .from('appointments')
        .select('date_time, status')
        .gte('date_time', weekStart.toISOString())
        .lte('date_time', weekEnd.toISOString())
      setWeekAppointments((data as any) || [])
    } catch {
      // ignore
    }
  }

  async function loadAppointments() {
    try {
      setLoading(true)
      
      const startOfDay = new Date(selectedDate)
      startOfDay.setHours(0, 0, 0, 0)
      
      const endOfDay = new Date(selectedDate)
      endOfDay.setHours(23, 59, 59, 999)

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patients (first_name, last_name)
        `)
        .gte('date_time', startOfDay.toISOString())
        .lte('date_time', endOfDay.toISOString())
        .order('date_time')

      if (error) throw error
      setAppointments(data || [])
    } catch (error) {
      console.error('Error loading appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', id)
      if (error) throw error
      setAppointments(prev =>
        prev.map(a => a.id === id ? { ...a, status: newStatus } : a)
      )
    } catch (error) {
      console.error('Error updating appointment status:', error)
      alert('Failed to update appointment')
    }
  }

  async function cancelAppointment(id: string) {
    if (!confirm('Cancel this appointment?')) return
    updateStatus(id, 'Cancelled')
  }

  function getDotsForDay(day: Date) {
    return weekAppointments.filter(a =>
      isSameDay(new Date(a.date_time), day) && a.status !== 'Cancelled'
    ).length
  }

  return (
    <div className="space-y-6 page-fade-in">
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
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Week View</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>Today</Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>Next</Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const isSelected = format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
            const dotCount = getDotsForDay(day)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`p-3 rounded-lg text-center transition-all duration-150 hover:scale-105 active:scale-95 ${
                  isSelected
                    ? 'bg-primary text-white shadow-md'
                    : isToday
                    ? 'bg-blue-50 text-primary border border-primary'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="text-xs font-medium">{format(day, 'EEE')}</div>
                <div className="text-lg font-bold mt-1">{format(day, 'd')}</div>
                <div className="mt-1 flex justify-center gap-0.5 h-2">
                  {dotCount > 0 && [...Array(Math.min(dotCount, 3))].map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-primary'}`}
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold">Appointments for {format(selectedDate, 'MMMM d, yyyy')}</h3>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <span className="spinner" />
          </div>
        ) : appointments.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            No appointments for this day
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {appointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                onCancel={() => cancelAppointment(appointment.id)}
                onStatusChange={(status) => updateStatus(appointment.id, status)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AppointmentModal
          selectedDate={selectedDate}
          onClose={() => setShowModal(false)}
          onSave={() => { loadAppointments(); loadWeekAppointments(); setShowModal(false) }}
        />
      )}
    </div>
  )
}

function AppointmentRow({ appointment, onCancel, onStatusChange }: {
  appointment: Appointment
  onCancel: () => void
  onStatusChange: (status: string) => void
}) {
  const statusColors: Record<string, string> = {
    Scheduled: 'bg-blue-100 text-blue-700',
    Confirmed: 'bg-green-100 text-green-700',
    Completed: 'bg-gray-100 text-gray-700',
    Cancelled: 'bg-red-100 text-red-700',
  }

  const isClosed = appointment.status === 'Cancelled' || appointment.status === 'Completed'

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">
              {appointment.patients.first_name} {appointment.patients.last_name}
            </p>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[appointment.status] || 'bg-gray-100'}`}>
              {appointment.status}
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {formatLocalAppointmentDateTime(appointment.date_time)} • {appointment.duration} min • {appointment.type}
          </p>
          {appointment.notes && <p className="text-sm text-text-secondary mt-1">{appointment.notes}</p>}
        </div>

        {!isClosed && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {appointment.status === 'Scheduled' && (
              <button
                onClick={() => onStatusChange('Confirmed')}
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                title="Confirm"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Confirm
              </button>
            )}
            {appointment.status === 'Confirmed' && (
              <button
                onClick={() => onStatusChange('Completed')}
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="Mark Completed"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                Done
              </button>
            )}
            <button
              onClick={onCancel}
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              title="Cancel"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}



