import { ensurePatientCode } from '@/lib/patientCode'
import { logActivity } from '@/lib/activityLog'
import { supabase } from '@/lib/supabase'

interface CreatePatientPayload {
  first_name: string
  last_name: string
  phone: string
  email?: string | null
  date_of_birth?: string | null
  gender?: string | null
  weight?: number | null
  address?: string | null
  medical_history?: string | null
  notes?: string | null
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

  const fullName = `${payload.first_name} ${payload.last_name}`.trim()
  logActivity({
    action: 'create',
    entityType: 'patient',
    entityId: createdPatient.id,
    entityLabel: fullName,
    patientId: createdPatient.id,
    patientName: fullName,
    details: payload.phone ? `Phone ${payload.phone}` : null,
  })

  let patientCode: string | null = null

  // Keep both patient creation flows consistent by assigning a code
  // immediately after insert when the returning payload does not include one.
  try {
    patientCode = await ensurePatientCode(createdPatient.id)
  } catch (error: any) {
    if (error?.code !== '42703') throw error
  }

  // Fetch all available columns (patient_code included when migration has run)
  // in a separate read. Ignore any error here so a missing patient_code column
  // does not prevent patient creation from succeeding.
  const { data: patientData } = await patientsTable
    .select('*')
    .eq('id', createdPatient.id)
    .single()
  const fetchedPatient = patientData as { id: string; patient_code?: string | null } | null

  if (fetchedPatient) {
    return patientCode
      ? {
          ...fetchedPatient,
          patient_code: patientCode,
        }
      : fetchedPatient
  }

  return patientCode
    ? {
        ...createdPatient,
        patient_code: patientCode,
      }
    : createdPatient
}

export function matchesPatientSearch(
  candidate: { name: string; code?: string | null; phone?: string | null },
  query: string
): boolean {
  const trimmed = query.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()
  return (
    candidate.name.toLowerCase().includes(lower) ||
    (candidate.code || '').toLowerCase().includes(lower) ||
    (candidate.phone || '').includes(trimmed)
  )
}
