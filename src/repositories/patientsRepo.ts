import { supabase } from '@/lib/supabase'

export async function fetchPatientsList() {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .neq('patient_type', 'consultation')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Slim patient select used by the Celebrations widget and the notification
 * bell — both need id/name/phone/dob/notes (for the anniversary tag) but
 * nothing else, so this stays a separate lighter query rather than reusing
 * fetchPatientsList()'s `select('*')`. Shared through qk.patients.celebrations
 * so both callers hit one cached fetch instead of querying twice.
 */
export async function fetchCelebrationPatients() {
  const { data, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name, phone, date_of_birth, notes, medical_history')
    .neq('patient_type', 'consultation')

  if (error) throw error
  return data || []
}
