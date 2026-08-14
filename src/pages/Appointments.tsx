import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, CheckCircle, XCircle, ClipboardCheck, Calendar, CalendarClock, List, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { qk } from '@/repositories/keys'
import { fetchDayAppointments, fetchWeekAppointments } from '@/repositories/appointmentsRepo'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { AppointmentModal } from '@/components/AppointmentModal'
import { RescheduleModal } from '@/components/RescheduleModal'
import { ReminderQueue } from '@/components/ReminderQueue'
import { DentoralBookingBridge } from '@/components/DentoralBookingBridge'
import { getPatientDobOrAge } from '@/lib/utils'
import { logActivity } from '@/lib/activityLog'
import { loadScheduleContext, getWindowsForDay, type ScheduleContext } from '@/lib/appointmentSchedule'
import { generateSlotsForDay, isPastSlot } from '@/lib/appointmentSlots'

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
    date_of_birth?: string | null
    age?: number | string | null
    phone?: string | null
  }
}

export function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [weekAppointments, setWeekAppointments] = useState<Appointment[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null)
  const [addVisitPrompt, setAddVisitPrompt] = useState<Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reminderRefresh, setReminderRefresh] = useState(0)
  const [viewMode, setViewMode] = useState<'list' | 'slots'>('list')
  const [schedule, setSchedule] = useState<ScheduleContext>({ recurringByDay: {}, overrides: {} })
  const navigate = useNavigate()

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const selectedDateIso = format(selectedDate, 'yyyy-MM-dd')
  const weekStartIso = format(weekStart, 'yyyy-MM-dd')
  const isSelectedDateToday = selectedDateIso === format(new Date(), 'yyyy-MM-dd')

  const {
    data: dayAppointmentsData,
    isLoading: dayLoading,
    isError: dayIsError,
    refetch: refetchDayAppointments,
  } = useQuery({
    queryKey: qk.appointments.day(selectedDateIso),
    queryFn: () => fetchDayAppointments(selectedDateIso),
  })

  const activeAppointmentsCount = appointments.filter(a => a.status !== 'Cancelled').length

  const {
    data: weekAppointmentsData,
    refetch: refetchWeekAppointments,
  } = useQuery({
    queryKey: qk.appointments.week(weekStartIso),
    queryFn: () => fetchWeekAppointments(weekStartIso),
  })

  useEffect(() => {
    setAppointments((dayAppointmentsData as any) || [])
    setLoading(dayLoading)
    setError(dayIsError ? 'Failed to load appointments' : null)
  }, [dayAppointmentsData, dayLoading, dayIsError])

  useEffect(() => {
    setWeekAppointments((weekAppointmentsData as any) || [])
  }, [weekAppointmentsData])

  useEffect(() => {
    loadScheduleContext(selectedDate, selectedDate)
      .then(setSchedule)
      .catch(() => setSchedule({ recurringByDay: {}, overrides: {} }))
  }, [selectedDate])

  async function loadWeekAppointments() {
    await refetchWeekAppointments()
  }

  async function loadAppointments() {
    await refetchDayAppointments()
  }

  async function updateStatus(id: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', id)
      if (error) throw error

      const appt = appointments.find(a => a.id === id)
      logActivity({
        action: 'edit',
        entityType: 'appointment',
        entityId: id,
        entityLabel: appt?.type ?? null,
        patientId: appt?.patient_id ?? null,
        patientName: appt?.patients ? `${appt.patients.first_name} ${appt.patients.last_name}` : null,
        details: `Status → ${newStatus}`,
      })

      setAppointments(prev =>
        prev.map(a => a.id === id ? { ...a, status: newStatus } : a)
      )

      if (newStatus === 'Completed' && appt) {
        setAddVisitPrompt(appt)
      }
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
    return weekAppointments.filter(a => {
      if (!a.date_time) return false
      const d = new Date(a.date_time)
      return !isNaN(d.getTime()) && isSameDay(d, day) && a.status !== 'Cancelled'
    }).length
  }

  return (
    <div className="space-y-6 page-fade-in pb-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-primary/10 shadow-elevation-low">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary">Appointments & Scheduling</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {activeAppointmentsCount} Appt{activeAppointmentsCount !== 1 ? 's' : ''}{isSelectedDateToday ? ' Today' : ` on ${format(selectedDate, 'd MMM')}`}
            </span>
          </div>
          <p className="text-sm text-text-secondary">Organize patient time slots, confirmations, and daily chair schedules.</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="rounded-xl shadow-elevation-md px-5 py-2.5">
          <Plus className="w-4 h-4 mr-2" />
          New Appointment
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm font-medium shadow-sm">
          <p className="font-bold">Notice</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      <ReminderQueue refreshToken={reminderRefresh} />

      <DentoralBookingBridge onImportSuccess={loadAppointments} />

      {/* Week View Navigation Strip */}
      <div className="glass-card bg-white/90 rounded-3xl shadow-elevation-low border border-primary/10 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-text-primary">Week Schedule View</h3>
            <p className="text-xs text-text-secondary">Week starting {format(weekStart, 'MMMM d, yyyy')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, -7))} className="rounded-xl text-xs">
              ← Previous
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate(new Date())} className="rounded-xl text-xs font-bold">
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, 7))} className="rounded-xl text-xs">
              Next →
            </Button>
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
                className={`p-3 rounded-2xl text-center transition-all duration-200 ${
                  isSelected
                    ? 'bg-gradient-to-br from-primary to-primary-bright text-white shadow-elevation-md scale-105'
                    : isToday
                    ? 'bg-primary/10 text-primary border-2 border-primary/40 font-bold'
                    : 'bg-surface-subtle hover:bg-white hover:shadow-elevation-low border border-gray-100 text-text-primary'
                }`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{format(day, 'EEE')}</div>
                <div className="text-xl font-bold font-display mt-1">{format(day, 'd')}</div>
                <div className="mt-1.5 flex justify-center gap-1 h-2 items-center">
                  {dotCount > 0 && [...Array(Math.min(dotCount, 3))].map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-primary'}`}
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Appointments List / Slot Grid Panel */}
      <div className="glass-card bg-white/90 rounded-3xl shadow-elevation-low border border-primary/10 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap bg-surface-subtle/50">
          <div>
            <h3 className="font-bold text-text-primary text-base">
              Schedule for {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </h3>
            <p className="text-xs text-text-secondary">{activeAppointmentsCount} appointment{activeAppointmentsCount !== 1 ? 's' : ''} listed</p>
          </div>

          <div className="flex gap-1 bg-white border border-gray-200/80 rounded-xl p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'list' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('slots')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'slots' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Slot Grid
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <span className="spinner" />
          </div>
        ) : viewMode === 'slots' ? (
          <DaySlotGrid
            date={selectedDate}
            windows={getWindowsForDay(selectedDate, schedule)}
            appointments={appointments}
            onFreeSlotClick={() => setShowModal(true)}
            onAppointmentClick={(appointment) => setRescheduleAppointment(appointment)}
          />
        ) : appointments.length === 0 ? (
          <div className="p-12 text-center text-text-secondary">
            <div className="w-12 h-12 rounded-2xl bg-surface-subtle text-text-muted mx-auto flex items-center justify-center mb-3">
              <Calendar className="w-6 h-6" />
            </div>
            {getWindowsForDay(selectedDate, schedule).length === 0 ? (
              <>
                <p className="text-sm font-semibold text-text-primary mb-1">Clinic Closed</p>
                <p className="text-xs text-text-secondary mb-4">No operating windows configured for this day.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-text-primary mb-1">No Appointments Scheduled</p>
                <p className="text-xs text-text-secondary mb-4">The calendar is open for this date.</p>
              </>
            )}
            <Button onClick={() => setShowModal(true)} size="sm" className="rounded-xl shadow-sm">
              <Plus className="w-4 h-4 mr-1.5" />
              Book Appointment
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {appointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                onCancel={() => cancelAppointment(appointment.id)}
                onStatusChange={(status) => updateStatus(appointment.id, status)}
                onReschedule={() => setRescheduleAppointment(appointment)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AppointmentModal
          selectedDate={selectedDate}
          onClose={() => setShowModal(false)}
          onSave={() => { loadAppointments(); loadWeekAppointments(); setReminderRefresh(n => n + 1); setShowModal(false) }}
        />
      )}

      {rescheduleAppointment && (
        <RescheduleModal
          appointment={rescheduleAppointment}
          onClose={() => setRescheduleAppointment(null)}
          onSave={() => { loadAppointments(); loadWeekAppointments(); setReminderRefresh(n => n + 1); setRescheduleAppointment(null) }}
        />
      )}

      {addVisitPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card bg-white rounded-3xl shadow-elevation-high max-w-sm w-full p-6 border border-primary/15">
            <h2 className="font-display text-lg font-bold text-text-primary">Add visit to patient record?</h2>
            <p className="text-xs text-text-secondary mt-2 leading-relaxed">
              {addVisitPrompt.patients
                ? <span className="font-semibold text-text-primary">{addVisitPrompt.patients.first_name} {addVisitPrompt.patients.last_name} • </span>
                : ''}
              This appointment is now marked <span className="font-bold text-emerald-600">Completed</span>. Create a clinical visit record now?
            </p>
            <div className="flex gap-3 pt-5">
              <Button
                className="flex-1 py-2.5 rounded-xl font-semibold shadow-sm text-xs"
                onClick={() => {
                  const patientId = addVisitPrompt.patient_id
                  setAddVisitPrompt(null)
                  navigate(`/patients/${patientId}?section=visits&openVisit=1`)
                }}
              >
                Add Visit Now
              </Button>
              <Button variant="outline" className="flex-1 py-2.5 rounded-xl text-xs font-semibold" onClick={() => setAddVisitPrompt(null)}>
                Later
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AppointmentRow({ appointment, onCancel, onStatusChange, onReschedule }: {
  appointment: Appointment
  onCancel: () => void
  onStatusChange: (status: string) => void
  onReschedule: () => void
}) {
  if (!appointment || !appointment.patients) {
    return (
      <div className="p-4 text-center text-xs text-text-secondary">
        Invalid appointment entry
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    Scheduled: 'pill-info',
    Confirmed: 'pill-success',
    Completed: 'bg-gray-100 text-gray-700 border border-gray-200',
    Cancelled: 'pill-error',
  }

  const isClosed = appointment.status === 'Cancelled' || appointment.status === 'Completed'
  const patientDobOrAge = getPatientDobOrAge(appointment.patients?.date_of_birth, appointment.patients?.age, '')
  const navigate = useNavigate()

  return (
    <div className="p-4 sm:p-5 hover:bg-primary-surface/50 transition-colors group">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <p
              className="font-bold text-sm text-text-primary cursor-pointer hover:text-primary transition-colors"
              onClick={() => navigate(`/patients/${appointment.patient_id}`)}
            >
              {appointment.patients?.first_name} {appointment.patients?.last_name}
            </p>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[appointment.status] || 'bg-gray-100'}`}>
              {appointment.status}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary mt-1 flex-wrap">
            <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
              {formatLocalAppointmentDateTime(appointment.date_time)}
            </span>
            <span>•</span>
            <span>{appointment.duration} min duration</span>
            <span>•</span>
            <span className="font-medium text-text-primary">{appointment.type}</span>
          </div>
          {patientDobOrAge && <p className="text-xs text-text-muted mt-1">{patientDobOrAge}</p>}
          {appointment.notes && <p className="text-xs text-text-secondary mt-1 bg-surface-subtle p-2 rounded-lg border border-gray-100">{appointment.notes}</p>}
        </div>

        {!isClosed && (
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {appointment.status === 'Scheduled' && (
              <button
                onClick={() => onStatusChange('Confirmed')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors shadow-sm"
                title="Confirm Appointment"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Confirm
              </button>
            )}
            {appointment.status === 'Confirmed' && (
              <button
                onClick={() => onStatusChange('Completed')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl transition-colors shadow-sm"
                title="Mark Completed"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                Complete
              </button>
            )}
            <button
              onClick={onReschedule}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors shadow-sm"
              title="Reschedule Time Slot"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Reschedule
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors shadow-sm"
              title="Cancel Appointment"
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

const SLOT_STATUS_STYLES: Record<string, string> = {
  Scheduled: 'bg-blue-50/90 border-blue-300 text-blue-900 hover:bg-blue-100 font-semibold',
  Confirmed: 'bg-emerald-50/90 border-emerald-300 text-emerald-900 hover:bg-emerald-100 font-semibold',
  Completed: 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200',
}

function DaySlotGrid({
  date,
  windows,
  appointments,
  onFreeSlotClick,
  onAppointmentClick,
}: {
  date: Date
  windows: { start_hour: number; start_minute: number; end_hour: number; end_minute: number }[]
  appointments: Appointment[]
  onFreeSlotClick: () => void
  onAppointmentClick: (appointment: Appointment) => void
}) {
  const slots = generateSlotsForDay(date, windows)

  if (slots.length === 0) {
    return (
      <div className="p-12 text-center text-text-secondary">
        <Calendar className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-50" />
        <p className="font-semibold text-text-primary text-sm">Clinic Closed</p>
        <p className="text-xs text-text-secondary mt-1">No operating windows configured for this day</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {slots.map((slot) => {
        const occupying = appointments.find((a) => {
          if (a.status === 'Cancelled') return false
          const apptStart = new Date(a.date_time)
          const apptEnd = new Date(apptStart.getTime() + a.duration * 60000)
          return slot.start < apptEnd && slot.end > apptStart
        })

        return (
          <div key={slot.start.toISOString()} className="flex items-stretch hover:bg-surface-subtle/50 transition-colors">
            <div className="w-24 shrink-0 py-3.5 px-4 text-xs font-mono font-bold text-text-secondary flex items-center border-r border-gray-100">
              {slot.label}
            </div>
            {occupying ? (
              occupying.patients ? (
                <button
                  type="button"
                  onClick={() => onAppointmentClick(occupying)}
                  className={`flex-1 text-left py-3.5 px-4 border-l-4 transition-all ${
                    SLOT_STATUS_STYLES[occupying.status] || 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">
                      {occupying.patients?.first_name} {occupying.patients?.last_name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-white/70 shadow-sm border border-black/5">
                      {occupying.type}
                    </span>
                  </div>
                </button>
              ) : (
                // Mirrors AppointmentRow's guard above: an appointment whose
                // patient record is gone can't meaningfully be rescheduled.
                // Previously this rendered a clickable tile that opened
                // RescheduleModal with patients undefined, which silently
                // fell into the no-phone path with no prompt shown at all.
                <div className="flex-1 py-3.5 px-4 text-xs text-text-muted italic bg-surface-subtle/30 flex items-center border-l-4 border-gray-300">
                  Invalid appointment entry
                </div>
              )
            ) : isPastSlot(slot) ? (
              <div className="flex-1 py-3.5 px-4 text-xs text-text-muted italic bg-surface-subtle/30 flex items-center">
                Past slot
              </div>
            ) : (
              <button
                type="button"
                onClick={onFreeSlotClick}
                className="flex-1 text-left py-3.5 px-4 text-xs font-medium text-primary hover:bg-primary/5 hover:text-primary transition-all flex items-center gap-2 group"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 group-hover:scale-125 transition-transform" />
                <span>Available Slot — Click to Schedule</span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatLocalAppointmentDateTime(dateTime: string | null | undefined) {
  if (!dateTime) return '—'
  const d = new Date(dateTime)
  return isNaN(d.getTime()) ? '—' : format(d, 'h:mm a')
}
