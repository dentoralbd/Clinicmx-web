import { supabase } from '@/lib/supabase'

interface CreatePatientPayload {
  first_name: string
  last_name: string
  phone: string
  email?: string | null
  date_of_birth?: string | null
  gender?: string | null
  address?: string | null
  medical_history?: string | null
  notes?: string | null
}

export async function createPatient(payload: CreatePatientPayload) {
  const patientsTable: any = supabase.from('patients')
  const { data, error } = await patientsTable
    .insert([payload])
    .select('id, patient_code')
    .single()
  const createdPatient = data as { id: string; patient_code?: string | null } | null

  if (error) throw error
  if (!createdPatient?.id) throw new Error('Failed to create patient')

  if (createdPatient.patient_code) {
    return createdPatient
  }

  const { data: patientData, error: patientFetchError } = await patientsTable
    .select('id, patient_code')
    .eq('id', createdPatient.id)
    .single()
  const fetchedPatient = patientData as { id: string; patient_code?: string | null } | null

  if (patientFetchError) throw patientFetchError

  return fetchedPatient || createdPatient
}
