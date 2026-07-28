import { format, getDay } from 'date-fns'
import { supabase } from './supabase'
import type { ScheduleWindow } from './appointmentSlots'

export interface RecurringWindowRow extends ScheduleWindow {
  id: string
  day_of_week: number
}

export interface OverrideWindowRow extends ScheduleWindow {
  id: string
  override_date: string
}

export interface DateOverrideRow {
  id: string
  override_date: string
  is_closed: boolean
  windows: OverrideWindowRow[]
}

export interface ScheduleContext {
  recurringByDay: Record<number, ScheduleWindow[]>
  overrides: Record<string, { isClosed: boolean; windows: ScheduleWindow[] }>
}

/** Loads everything needed to compute open windows for any day in [rangeStart, rangeEnd]. */
export async function loadScheduleContext(rangeStart: Date, rangeEnd: Date): Promise<ScheduleContext> {
  const startStr = format(rangeStart, 'yyyy-MM-dd')
  const endStr = format(rangeEnd, 'yyyy-MM-dd')

  const [recurringRes, overrideRowsRes, overrideWindowsRes] = await Promise.all([
    supabase
      .from('appointment_schedule_windows')
      .select('day_of_week, start_hour, start_minute, end_hour, end_minute')
      .not('day_of_week', 'is', null),
    supabase
      .from('appointment_schedule_date_overrides')
      .select('override_date, is_closed')
      .gte('override_date', startStr)
      .lte('override_date', endStr),
    supabase
      .from('appointment_schedule_windows')
      .select('override_date, start_hour, start_minute, end_hour, end_minute')
      .not('override_date', 'is', null)
      .gte('override_date', startStr)
      .lte('override_date', endStr),
  ])

  if (recurringRes.error) throw recurringRes.error
  if (overrideRowsRes.error) throw overrideRowsRes.error
  if (overrideWindowsRes.error) throw overrideWindowsRes.error

  const recurringByDay: Record<number, ScheduleWindow[]> = {}
  for (const w of recurringRes.data || []) {
    const day = w.day_of_week as number
    if (!recurringByDay[day]) recurringByDay[day] = []
    recurringByDay[day].push(w)
  }

  const overrides: ScheduleContext['overrides'] = {}
  for (const row of overrideRowsRes.data || []) {
    overrides[row.override_date] = { isClosed: row.is_closed, windows: [] }
  }
  for (const w of overrideWindowsRes.data || []) {
    const dateKey = w.override_date as string
    if (!overrides[dateKey]) overrides[dateKey] = { isClosed: false, windows: [] }
    overrides[dateKey].windows.push(w)
  }

  return { recurringByDay, overrides }
}

/** Resolves the open windows for a specific day: date override wins, else the recurring weekday pattern. */
export function getWindowsForDay(day: Date, ctx: ScheduleContext): ScheduleWindow[] {
  const key = format(day, 'yyyy-MM-dd')
  const override = ctx.overrides[key]
  if (override) return override.isClosed ? [] : override.windows
  return ctx.recurringByDay[getDay(day)] || []
}

// --- Admin management (Clinic Hours tab) ---

export async function loadRecurringWindows(): Promise<RecurringWindowRow[]> {
  const { data, error } = await supabase
    .from('appointment_schedule_windows')
    .select('id, day_of_week, start_hour, start_minute, end_hour, end_minute')
    .not('day_of_week', 'is', null)
    .order('day_of_week')
    .order('start_hour')
    .order('start_minute')

  if (error) throw error
  return (data || []) as RecurringWindowRow[]
}

export async function addRecurringWindow(dayOfWeek: number, window: ScheduleWindow): Promise<void> {
  const { error } = await supabase
    .from('appointment_schedule_windows')
    .insert({ day_of_week: dayOfWeek, ...window })

  if (error) throw error
}

export async function removeScheduleWindow(id: string): Promise<void> {
  const { error } = await supabase.from('appointment_schedule_windows').delete().eq('id', id)
  if (error) throw error
}

export async function loadUpcomingOverrides(): Promise<DateOverrideRow[]> {
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const [overrideRowsRes, windowsRes] = await Promise.all([
    supabase
      .from('appointment_schedule_date_overrides')
      .select('id, override_date, is_closed')
      .gte('override_date', todayStr)
      .order('override_date'),
    supabase
      .from('appointment_schedule_windows')
      .select('id, override_date, start_hour, start_minute, end_hour, end_minute')
      .not('override_date', 'is', null)
      .gte('override_date', todayStr),
  ])

  if (overrideRowsRes.error) throw overrideRowsRes.error
  if (windowsRes.error) throw windowsRes.error

  const windowsByDate: Record<string, OverrideWindowRow[]> = {}
  for (const w of windowsRes.data || []) {
    const key = w.override_date as string
    if (!windowsByDate[key]) windowsByDate[key] = []
    windowsByDate[key].push(w as OverrideWindowRow)
  }

  return (overrideRowsRes.data || []).map((row) => ({
    ...row,
    windows: windowsByDate[row.override_date] || [],
  }))
}

/** Sets (or replaces) the override for a date: either fully closed, or a custom window list. */
export async function setDateOverride(date: string, isClosed: boolean, windows: ScheduleWindow[]): Promise<void> {
  const { error: upsertError } = await supabase
    .from('appointment_schedule_date_overrides')
    .upsert({ override_date: date, is_closed: isClosed }, { onConflict: 'override_date' })

  if (upsertError) throw upsertError

  const { error: deleteError } = await supabase
    .from('appointment_schedule_windows')
    .delete()
    .eq('override_date', date)

  if (deleteError) throw deleteError

  if (!isClosed && windows.length > 0) {
    const { error: insertError } = await supabase
      .from('appointment_schedule_windows')
      .insert(windows.map((w) => ({ override_date: date, ...w })))

    if (insertError) throw insertError
  }
}

/** Removes a date override entirely, reverting that date back to the recurring weekly pattern. */
export async function removeDateOverride(id: string, date: string): Promise<void> {
  const { error: deleteWindowsError } = await supabase
    .from('appointment_schedule_windows')
    .delete()
    .eq('override_date', date)

  if (deleteWindowsError) throw deleteWindowsError

  const { error } = await supabase.from('appointment_schedule_date_overrides').delete().eq('id', id)
  if (error) throw error
}
