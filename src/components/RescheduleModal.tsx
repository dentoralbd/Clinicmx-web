import { useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activityLog'
import { RescheduleWhatsAppPrompt } from '@/components/RescheduleWhatsAppPrompt'
import { SlotPicker } from '@/components/SlotPicker'
import { isRangeFree, type ExistingAppointmentLite } from '@/lib/appointmentSlots'

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
      phone?: string | null
    }
  }
  onClose: () => void
  onSave: () => void
}) {
  const currentDate = new Date(appointment.date_time)
  const [slotDate, setSlotDate] = useState<Date>(currentDate)
  const [slotStart, setSlotStart] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const [whatsAppPrompt, setWhatsAppPrompt] = useState<{ dateStr: string; timeStr: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      if (!slotStart) {
        alert('Please choose a new appointment time')
        setSaving(false)
        return
      }

      // Final conflict guard against a possible race between grid render and submit.
      const startDateTime = slotStart

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
      const appointmentsForDay = (dayAppts || []) as ExistingAppointmentLite[]

      if (!isRangeFree(startDateTime, appointment.duration, appointmentsForDay)) {
        alert('An appointment is already scheduled during this time slot')
        setSaving(false)
        return
      }

      const { error } = await supabase
        .from('appointments')
        .update({ date_time: startDateTime.toISOString(), status: 'Scheduled', reminder_sent_at: null })
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

      if (appointment.patients?.phone) {
        setWhatsAppPrompt({
          dateStr: format(startDateTime, 'MMMM d, yyyy'),
          timeStr: format(startDateTime, 'h:mm a'),
        })
      } else {
        onSave()
      }
    } catch (error) {
      console.error('Error rescheduling appointment:', error)
      alert('Failed to reschedule appointment')
    } finally {
      setSaving(false)
    }
  }

  if (whatsAppPrompt) {
    return (
      <RescheduleWhatsAppPrompt
        firstName={appointment.patients?.first_name || 'there'}
        phone={appointment.patients?.phone ?? null}
        dateStr={whatsAppPrompt.dateStr}
        timeStr={whatsAppPrompt.timeStr}
        onClose={() => { setWhatsAppPrompt(null); onSave() }}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-bold">Reschedule Appointment</h2>
            <p className="text-sm text-text-secondary mt-1">
              {appointment.patients
                ? `${appointment.patients.first_name} ${appointment.patients.last_name} • `
                : ''}
              Currently {format(currentDate, 'MMMM d, yyyy')} at {format(currentDate, 'h:mm a')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">New Appointment Time</label>
            <SlotPicker
              date={slotDate}
              onDateChange={setSlotDate}
              durationMinutes={appointment.duration}
              excludeAppointmentId={appointment.id}
              selectedStart={slotStart}
              onSelectStart={setSlotStart}
            />
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
