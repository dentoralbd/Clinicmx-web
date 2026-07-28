import { useEffect, useState } from 'react'
import { addDays, format, isSameDay, isToday, startOfDay } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { loadAppointmentSettings } from '@/lib/appointmentSettings'
import {
  DEFAULT_APPOINTMENT_SETTINGS,
  appointmentsOnDay,
  computeTakenSlots,
  countFreeSlots,
  durationToSlotCount,
  generateDaySlots,
  isRunFree,
  type AppointmentSettingsRow,
  type ExistingAppointmentLite,
} from '@/lib/appointmentSlots'

interface SlotPickerProps {
  date: Date
  onDateChange: (date: Date) => void
  durationMinutes: number
  excludeAppointmentId?: string
  selectedStart: Date | null
  onSelectStart: (start: Date | null) => void
  daysAheadForChips?: number
}

export function SlotPicker({
  date,
  onDateChange,
  durationMinutes,
  excludeAppointmentId,
  selectedStart,
  onSelectStart,
  daysAheadForChips = 7,
}: SlotPickerProps) {
  const [settings, setSettings] = useState<AppointmentSettingsRow>(DEFAULT_APPOINTMENT_SETTINGS)
  const [appointments, setAppointments] = useState<ExistingAppointmentLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAppointmentSettings()
      .then(setSettings)
      .catch(() => setSettings(DEFAULT_APPOINTMENT_SETTINGS))
  }, [])

  useEffect(() => {
    const today = startOfDay(new Date())
    const chipsEnd = addDays(today, daysAheadForChips - 1)
    // Always include `date` itself in the fetched range, in case it falls
    // outside the default chip window (e.g. rescheduling a far-future
    // appointment, or the main calendar was navigated ahead before opening
    // the modal).
    const rangeStart = date < today ? startOfDay(date) : today
    const rangeEnd = date > chipsEnd ? startOfDay(date) : chipsEnd

    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('appointments')
      .select('id, date_time, duration, status')
      .gte('date_time', rangeStart.toISOString())
      .lt('date_time', addDays(rangeEnd, 1).toISOString())
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError('Unable to load booked slots right now.')
          setAppointments([])
        } else {
          setAppointments((data || []) as ExistingAppointmentLite[])
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [date, daysAheadForChips])

  function handleDayChipClick(day: Date) {
    onSelectStart(null)
    onDateChange(day)
  }

  const today = startOfDay(new Date())
  const chipDays = Array.from({ length: daysAheadForChips }, (_, i) => addDays(today, i))
  const slots = generateDaySlots(date, settings)
  const dayAppointments = appointmentsOnDay(date, appointments)
  const taken = computeTakenSlots(slots, dayAppointments, excludeAppointmentId)
  const slotCount = durationToSlotCount(durationMinutes, settings.slot_minutes)

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-error">{error}</p>}

      {/* Day chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {chipDays.map((day) => {
          const free = countFreeSlots(day, settings, appointmentsOnDay(day, appointments), excludeAppointmentId)
          const closed = generateDaySlots(day, settings).length === 0
          const active = isSameDay(day, date)
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => handleDayChipClick(day)}
              className={`flex-shrink-0 min-w-[64px] min-h-[44px] px-3 py-2 rounded-lg border text-center transition ${
                active
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="text-xs font-medium">
                {isToday(day) ? 'Today' : format(day, 'EEE')}
              </div>
              <div className="text-xs">{format(day, 'MMM d')}</div>
              <div className={`text-[10px] mt-0.5 ${active ? 'text-white/80' : 'text-gray-500'}`}>
                {closed ? 'Closed' : `${free} free`}
              </div>
            </button>
          )
        })}
      </div>

      {/* Slot grid */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading available times…</div>
      ) : slots.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">Clinic closed this day</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((slot, i) => {
            const isTaken = taken[i]
            const runFree = !isTaken && isRunFree(taken, i, slotCount)
            // Highlight the whole selected run, not just the clicked slot.
            const selectedIndex = selectedStart
              ? slots.findIndex((s) => s.start.getTime() === selectedStart.getTime())
              : -1
            const inSelectedRun =
              selectedIndex !== -1 && i >= selectedIndex && i < selectedIndex + slotCount

            let className =
              'min-h-[44px] px-2 py-2 rounded-lg text-sm font-medium border transition text-center '
            if (inSelectedRun) {
              className += 'bg-primary text-white border-primary'
            } else if (isTaken) {
              className += 'bg-gray-100 text-gray-400 border-gray-200 line-through cursor-not-allowed'
            } else if (!runFree) {
              className += 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            } else {
              className += 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }

            return (
              <button
                key={slot.start.toISOString()}
                type="button"
                disabled={!runFree}
                onClick={() => onSelectStart(slot.start)}
                className={className}
              >
                {slot.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
