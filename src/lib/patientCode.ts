import { supabase } from './supabase'

const PATIENT_CODE_ASSIGNMENT_ATTEMPTS = 8
const PATIENT_CODE_REFRESH_ATTEMPTS = 3

function extractPatientCodeNumber(patientCode?: string | null) {
  if (!patientCode) return null
  const match = /^PT-(\d+)$/.exec(patientCode.trim())
  return match ? Number.parseInt(match[1], 10) : null
}

function formatPatientCode(value: number) {
  return `PT-${String(value).padStart(5, '0')}`
}

async function getHighestPatientCodeNumber() {
  const { data, error } = await supabase
    .from('patients')
    .select('patient_code')
    .not('patient_code', 'is', null)
    .order('patient_code', { ascending: false })
    .limit(50)

  if (error) throw error

  let highest = 0
  for (const row of data || []) {
    const parsed = extractPatientCodeNumber(row.patient_code)
    if (parsed && parsed > highest) highest = parsed
  }

  return highest
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchPatientCode(patientId: string) {
  const { data, error } = await supabase
    .from('patients')
    .select('patient_code')
    .eq('id', patientId)
    .maybeSingle()

  if (error) throw error

  return data?.patient_code || null
}

async function waitForPatientCode(patientId: string) {
  for (let attempt = 0; attempt < PATIENT_CODE_REFRESH_ATTEMPTS; attempt += 1) {
    const patientCode = await fetchPatientCode(patientId)
    if (patientCode) return patientCode

    await delay(75 * (attempt + 1))
  }

  return null
}

export async function ensurePatientCode(patientId: string, existingPatientCode?: string | null) {
  if (existingPatientCode) return existingPatientCode

  const currentPatientCode = await waitForPatientCode(patientId)
  if (currentPatientCode) return currentPatientCode

  for (let attempt = 0; attempt < PATIENT_CODE_ASSIGNMENT_ATTEMPTS; attempt += 1) {
    const highest = await getHighestPatientCodeNumber()
    const candidateCode = formatPatientCode(highest + 1 + attempt)

    const { data, error } = await supabase
      .from('patients')
      .update({ patient_code: candidateCode })
      .eq('id', patientId)
      .is('patient_code', null)
      .select('patient_code')
      .maybeSingle()

    if (data?.patient_code) return data.patient_code

    const refreshedPatientCode = await waitForPatientCode(patientId)
    if (refreshedPatientCode) return refreshedPatientCode

    if (!error) {
      await delay(75 * (attempt + 1))
      continue
    }

    if ((error as any)?.code !== '23505') throw error
  }

  const finalPatientCode = await waitForPatientCode(patientId)
  if (finalPatientCode) return finalPatientCode

  throw new Error('Unable to assign patient code')
}
