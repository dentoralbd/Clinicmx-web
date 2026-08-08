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
