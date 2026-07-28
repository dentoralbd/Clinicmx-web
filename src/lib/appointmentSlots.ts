import { addMinutes, format, isSameDay, setHours, setMinutes, startOfDay } from 'date-fns'

/** Fixed slot length. Not exposed in the UI (matches the original decision to keep this constant). */
export const SLOT_MINUTES = 30

export interface ScheduleWindow {
  start_hour: number
  start_minute: number
  end_hour: number
  end_minute: number
}

export interface Slot {
  start: Date
  end: Date
  label: string
}

export interface ExistingAppointmentLite {
  id?: string
  date_time: string
  duration: number
  status: string
}

/** durationMinutes -> number of slots it consumes (ceil, so a 45min appt on 30min slots needs 2). */
export function durationToSlotCount(durationMinutes: number, slotMinutes: number = SLOT_MINUTES): number {
  return Math.max(1, Math.ceil(durationMinutes / slotMinutes))
}

/**
 * Generate a day's slot grid from its list of open windows (recurring or
 * date-override — the caller resolves which applies, see
 * appointmentSchedule.ts's getWindowsForDay). Multiple windows are allowed
 * (e.g. 10am-2pm and 5pm-10pm same day); slots never span across windows.
 * Zero windows -> day is closed -> [].
 */
export function generateSlotsForDay(day: Date, windows: ScheduleWindow[]): Slot[] {
  const slots: Slot[] = []

  for (const w of windows) {
    let cursor = setMinutes(setHours(startOfDay(day), w.start_hour), w.start_minute)
    const end = setMinutes(setHours(startOfDay(day), w.end_hour), w.end_minute)

    while (addMinutes(cursor, SLOT_MINUTES) <= end) {
      const slotEnd = addMinutes(cursor, SLOT_MINUTES)
      slots.push({ start: cursor, end: slotEnd, label: format(cursor, 'h:mm a') })
      cursor = slotEnd
    }
  }

  slots.sort((a, b) => a.start.getTime() - b.start.getTime())
  return slots
}

/**
 * True if [start,end) overlaps any non-cancelled appointment. Same
 * half-open-interval overlap test used by the old inline checks in
 * AppointmentModal/RescheduleModal (Completed appointments still block —
 * unchanged behavior, only Cancelled is excluded).
 */
export function hasConflict(
  start: Date,
  end: Date,
  dayAppointments: ExistingAppointmentLite[],
  excludeId?: string
): boolean {
  return dayAppointments.some((appt) => {
    if (appt.status === 'Cancelled') return false
    if (excludeId && appt.id === excludeId) return false
    const apptStart = new Date(appt.date_time)
    const apptEnd = addMinutes(apptStart, appt.duration)
    return start < apptEnd && end > apptStart
  })
}

/** Per-slot taken/free map for rendering the grid. */
export function computeTakenSlots(
  slots: Slot[],
  dayAppointments: ExistingAppointmentLite[],
  excludeId?: string
): boolean[] {
  return slots.map((s) => hasConflict(s.start, s.end, dayAppointments, excludeId))
}

/** Is the consecutive run of slotCount slots starting at startIndex fully free? */
export function isRunFree(taken: boolean[], startIndex: number, slotCount: number): boolean {
  if (startIndex < 0 || startIndex + slotCount > taken.length) return false
  for (let i = startIndex; i < startIndex + slotCount; i++) {
    if (taken[i]) return false
  }
  return true
}

/** True if a slot's start time has already passed (e.g. today's 6pm slot when it's already 11pm). */
export function isPastSlot(slot: Slot, now: Date = new Date()): boolean {
  return slot.start < now
}

/** Given a desired start + duration, is it bookable against a day's appointments? Submit-time guard. */
export function isRangeFree(
  start: Date,
  durationMinutes: number,
  dayAppointments: ExistingAppointmentLite[],
  excludeId?: string
): boolean {
  if (start < new Date()) return false
  const end = addMinutes(start, durationMinutes)
  return !hasConflict(start, end, dayAppointments, excludeId)
}

/** Free-slot count for a single day, for the day-chip "X free" label. */
export function countFreeSlots(
  day: Date,
  windows: ScheduleWindow[],
  dayAppointments: ExistingAppointmentLite[],
  excludeId?: string
): number {
  const slots = generateSlotsForDay(day, windows)
  const taken = computeTakenSlots(slots, dayAppointments, excludeId)
  return taken.filter((t) => !t).length
}

/** Filter a wider-ranged appointment fetch down to just the ones on a given day. */
export function appointmentsOnDay(
  day: Date,
  appointments: ExistingAppointmentLite[]
): ExistingAppointmentLite[] {
  return appointments.filter((appt) => isSameDay(new Date(appt.date_time), day))
}
