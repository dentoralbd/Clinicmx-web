import { addMinutes, format, getDay, isSameDay, setHours, setMinutes, startOfDay } from 'date-fns'

export interface AppointmentSettingsRow {
  start_hour: number
  start_minute: number
  end_hour: number
  end_minute: number
  slot_minutes: number
  open_days: number[]
}

export const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettingsRow = {
  start_hour: 17,
  start_minute: 0,
  end_hour: 22,
  end_minute: 0,
  slot_minutes: 30,
  open_days: [0, 1, 2, 3, 4, 5, 6],
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
export function durationToSlotCount(durationMinutes: number, slotMinutes: number = 30): number {
  return Math.max(1, Math.ceil(durationMinutes / slotMinutes))
}

/** Generate the day's slot grid from settings. Returns [] if the day isn't in open_days. */
export function generateDaySlots(day: Date, settings: AppointmentSettingsRow): Slot[] {
  if (!settings.open_days.includes(getDay(day))) return []

  const slots: Slot[] = []
  let cursor = setMinutes(setHours(startOfDay(day), settings.start_hour), settings.start_minute)
  const end = setMinutes(setHours(startOfDay(day), settings.end_hour), settings.end_minute)

  while (addMinutes(cursor, settings.slot_minutes) <= end) {
    const slotEnd = addMinutes(cursor, settings.slot_minutes)
    slots.push({ start: cursor, end: slotEnd, label: format(cursor, 'h:mm a') })
    cursor = slotEnd
  }

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

/** Given a desired start + duration, is it bookable against a day's appointments? Submit-time guard. */
export function isRangeFree(
  start: Date,
  durationMinutes: number,
  dayAppointments: ExistingAppointmentLite[],
  excludeId?: string
): boolean {
  const end = addMinutes(start, durationMinutes)
  return !hasConflict(start, end, dayAppointments, excludeId)
}

/** Free-slot count for a single day, for the day-chip "X free" label. */
export function countFreeSlots(
  day: Date,
  settings: AppointmentSettingsRow,
  dayAppointments: ExistingAppointmentLite[],
  excludeId?: string
): number {
  const slots = generateDaySlots(day, settings)
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
