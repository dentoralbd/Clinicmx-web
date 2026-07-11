import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activityLog'

export function RescheduleModal({
  appointment,
  onClose,
  onSave,
}: {
  appointment: {
    id: string
    date_time: string
    duration: number
    patients?: {
      first_name: string
      last_name: string
    }
  }
  onClose: () => void
  onSave: () => void
}) {
  const currentDate = new Date(appointment.date_time)
  const [formData, setFormData] = useState({
    date: format(currentDate, 'yyyy-MM-dd'),
    time: format(currentDate, 'HH:mm'),
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      // Check for overlapping appointments (excluding this one)
      const startDateTime = new Date(`${formData.date}T${formData.time}:00`)
      const endDateTime = new Date(startDateTime.getTime() + appointment.duration * 60000)

      const startOfDay = new Date(startDateTime)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(startDateTime)
      endOfDay.setHours(23, 59, 59, 999)

      const { data: dayAppts, error: fetchError } = await supabase
        .from('appointments')
        .select('id, date_time, duration, status')
        .gte('date_time', startOfDay.toISOString())
        .lte('date_time', endOfDay.toISOString())
        .neq('status', 'Cancelled')
        .neq('id', appointment.id)

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

      const { error } = await supabase
        .from('appointments')
        .update({ date_time: startDateTime.toISOString(), status: 'Scheduled' })
        .eq('id', appointment.id)

      if (error) throw error

      logActivity({
        action: 'edit',
        entityType: 'appointment',
        entityId: appointment.id,
        patientName: appointment.patients
          ? `${appointment.patients.first_name} ${appointment.patients.last_name}`
          : null,
        details: `Rescheduled to ${format(startDateTime, 'MMM d, yyyy h:mm a')}`,
      })

      onSave()
    } catch (error) {
      console.error('Error rescheduling appointment:', error)
      alert('Failed to reschedule appointment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold">Reschedule Appointment</h2>
          <p className="text-sm text-text-secondary mt-1">
            {appointment.patients
              ? `${appointment.patients.first_name} ${appointment.patients.last_name} • `
              : ''}
            Currently {format(currentDate, 'MMMM d, yyyy')} at {format(currentDate, 'h:mm a')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">New Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">New Time</label>
              <input
                type="time"
                required
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <p className="text-sm text-gray-500">
            The appointment status will be set back to Scheduled after rescheduling.
          </p>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Rescheduling...' : 'Reschedule'}
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
