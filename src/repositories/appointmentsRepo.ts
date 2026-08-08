import { supabase } from '@/lib/supabase'

export async function fetchDayAppointments(isoDate: string) {
  const selectedDate = new Date(isoDate)
  const startOfDay = new Date(selectedDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(selectedDate)
  endOfDay.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patients (first_name, last_name, date_of_birth, phone)
    `)
    .gte('date_time', startOfDay.toISOString())
    .lte('date_time', endOfDay.toISOString())
    .order('date_time')

  if (error) throw error
  return data || []
}

export async function fetchWeekAppointments(isoStartDate: string) {
  const weekStart = new Date(isoStartDate)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('appointments')
    .select('date_time, status')
    .gte('date_time', weekStart.toISOString())
    .lte('date_time', weekEnd.toISOString())

  if (error) throw error
  return data || []
}
