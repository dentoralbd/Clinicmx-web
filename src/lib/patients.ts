import { supabase } from '@/lib/supabase'
import { ensurePatientCode } from '@/lib/patientCode'

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchPatientById(patientId: string) {
  const patientsTable: any = supabase.from('patients')
  const { data, error } = await patientsTable
    .select('*')
    .eq('id', patientId)
    .maybeSingle()

  if (error) throw error

  return data as { id: string; patient_code?: string | null } | null
}

async function waitForPatient(patientId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const patient = await fetchPatientById(patientId)
    if (patient) return patient

    await delay(75 * (attempt + 1))
  }

  return null
}

export async function createPatient(payload: CreatePatientPayload) {
  const patientsTable: any = supabase.from('patients')

  // Only request 'id' in the RETURNING clause so the INSERT succeeds even
  // when the patient_code column has not yet been added by migrations.
  const { data, error } = await patientsTable
    .insert([payload])
    .select('id')
    .single()
  const createdPatient = data as { id: string } | null

  if (error) throw error
  if (!createdPatient?.id) throw new Error('Failed to create patient')

  const fetchedPatient = await waitForPatient(createdPatient.id)
  let patientCode = fetchedPatient?.patient_code || null

  try {
    patientCode = await ensurePatientCode(createdPatient.id, patientCode)
  } catch (assignmentError: any) {
    if (assignmentError?.code !== '42703') throw assignmentError
  }

  const verifiedPatient = await waitForPatient(createdPatient.id)
  if (verifiedPatient) {
    if (patientCode && !verifiedPatient.patient_code) {
      return { ...verifiedPatient, patient_code: patientCode }
    }

    return verifiedPatient
  }

  return patientCode ? { ...createdPatient, patient_code: patientCode } : (fetchedPatient || createdPatient)
}
