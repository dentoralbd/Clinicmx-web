import { useEffect, useState } from 'react'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadScheduleContext, getWindowsForDay, type ScheduleContext } from '@/lib/appointmentSchedule'
import {
  appointmentsOnDay,
  computeTakenSlots,
  durationToSlotCount,
  generateSlotsForDay,
  isPastSlot,
  isRunFree,
  type ExistingAppointmentLite,
} from '@/lib/appointmentSlots'

interface SlotPickerProps {
  date: Date
  onDateChange: (date: Date) => void
  durationMinutes: number
  excludeAppointmentId?: string
  selectedStart: Date | null
  onSelectStart: (start: Date | null) => void
}

const EMPTY_SCHEDULE: ScheduleContext = { recurringByDay: {}, overrides: {} }
const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function SlotPicker({
  date,
  onDateChange,
  durationMinutes,
  excludeAppointmentId,
  selectedStart,
  onSelectStart,
}: SlotPickerProps) {
  const [viewedMonth, setViewedMonth] = useState<Date>(() => startOfMonth(date))
  const [schedule, setSchedule] = useState<ScheduleContext>(EMPTY_SCHEDULE)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [appointments, setAppointments] = useState<ExistingAppointmentLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Closed-day info for the visible month's calendar grid — refetches on month navigation only.
  useEffect(() => {
    let cancelled = false
    setScheduleError(null)

    loadScheduleContext(startOfMonth(viewedMonth), endOfMonth(viewedMonth))
      .then((ctx) => {
        if (!cancelled) setSchedule(ctx)
      })
      .catch(() => {
        if (!cancelled) setScheduleError('Unable to load clinic hours right now.')
      })

    return () => {
      cancelled = true
    }
  }, [viewedMonth])

  // Conflict data for the slot grid below — refetches whenever the selected date changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const dayStart = startOfDay(date)
    const dayEnd = addDays(dayStart, 1)

    supabase
      .from('appointments')
      .select('id, date_time, duration, status')
      .gte('date_time', dayStart.toISOString())
      .lt('date_time', dayEnd.toISOString())
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
  }, [date])

  function handleDaySelect(day: Date) {
    onSelectStart(null)
    onDateChange(day)
  }

  const now = new Date()
  const today = startOfDay(now)
  const monthStart = startOfMonth(viewedMonth)
  const monthEnd = endOfMonth(viewedMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const leadingBlanks = getDay(monthStart)

  const windows = getWindowsForDay(date, schedule)
  const slots = generateSlotsForDay(date, windows)
  const dayAppointments = appointmentsOnDay(date, appointments)
  const taken = computeTakenSlots(slots, dayAppointments, excludeAppointmentId)
  const past = slots.map((s) => isPastSlot(s, now))
  const unavailable = taken.map((t, i) => t || past[i])
  const slotCount = durationToSlotCount(durationMinutes)

  // Today's cell is only worth disabling for the "everything's already past" case
  // once we know today's actual windows have all elapsed (e.g. it's 11pm and the
  // clinic closes at 10pm) — a day with genuinely no windows is already "closed".
  const todaySlots = generateSlotsForDay(today, getWindowsForDay(today, schedule))
  const todayFullyPast = todaySlots.length > 0 && todaySlots.every((s) => isPastSlot(s, now))

  return (
    <div className="space-y-3">
      {/* Month calendar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setViewedMonth((m) => subMonths(m, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{format(viewedMonth, 'MMMM yyyy')}</span>
            {!isSameMonth(viewedMonth, today) && (
              <button
                type="button"
                onClick={() => setViewedMonth(startOfMonth(today))}
                className="text-xs font-medium text-primary hover:underline"
              >
                Today
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setViewedMonth((m) => addMonths(m, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {scheduleError && <p className="text-sm text-error mb-2">{scheduleError}</p>}

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-400 mb-1">
          {WEEKDAY_HEADERS.map((label, i) => (
            <div key={i}>{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {daysInMonth.map((day) => {
            const selected = isSameDay(day, date)
            const isTodayCell = isToday(day)
            const isPast = isBefore(day, today) || (isTodayCell && todayFullyPast)
            const closed = getWindowsForDay(day, schedule).length === 0
            const disabled = (isPast || closed) && !selected

            let cls = 'min-h-[44px] flex items-center justify-center rounded-lg text-sm font-medium border transition '
            if (selected) {
              cls += 'bg-primary text-white border-primary'
            } else if (isPast || closed) {
              cls += 'bg-gray-50 text-gray-300 border-transparent cursor-not-allowed'
            } else if (isTodayCell) {
              cls += 'bg-white text-gray-700 border-primary hover:bg-gray-50'
            } else {
              cls += 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }

            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => handleDaySelect(day)}
                className={cls}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Slot grid */}
      {error && <p className="text-sm text-error">{error}</p>}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading available times…</div>
      ) : slots.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">Clinic closed this day</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.map((slot, i) => {
            const isTaken = taken[i]
            const isPastTime = past[i]
            const runFree = !unavailable[i] && isRunFree(unavailable, i, slotCount)
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
            } else if (isPastTime) {
              className += 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
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
