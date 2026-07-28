import { supabase } from './supabase'
import { DEFAULT_APPOINTMENT_SETTINGS, type AppointmentSettingsRow } from './appointmentSlots'

export async function loadAppointmentSettings(): Promise<AppointmentSettingsRow> {
  const { data, error } = await supabase
    .from('appointment_settings')
    .select('start_hour, start_minute, end_hour, end_minute, slot_minutes, open_days')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error
  if (!data) return DEFAULT_APPOINTMENT_SETTINGS

  return data as AppointmentSettingsRow
}

export async function saveAppointmentSettings(
  next: Pick<AppointmentSettingsRow, 'start_hour' | 'start_minute' | 'end_hour' | 'end_minute' | 'open_days'>
): Promise<AppointmentSettingsRow> {
  const { data, error } = await supabase
    .from('appointment_settings')
    .upsert({ id: 1, ...next, updated_at: new Date().toISOString() })
    .select('start_hour, start_minute, end_hour, end_minute, slot_minutes, open_days')
    .single()

  if (error) throw error
  return data as AppointmentSettingsRow
}
