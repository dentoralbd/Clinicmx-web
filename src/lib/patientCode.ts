import { supabase } from './supabase'

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
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) throw error

  let highest = 0
  for (const row of data || []) {
    const parsed = extractPatientCodeNumber(row.patient_code)
    if (parsed && parsed > highest) highest = parsed
  }

  return highest
}

async function getStoredPatientCode(patientId: string) {
  const { data, error } = await supabase
    .from('patients')
    .select('patient_code')
    .eq('id', patientId)
    .single()

  if (error) throw error

  return data?.patient_code || null
}

async function getNextPatientCodeCandidate(attempt: number) {
  const { data, error } = await (supabase as any).rpc('generate_patient_code')

  if (!error && typeof data === 'string' && data) {
    return data
  }

  if (error && !['42883', 'PGRST202'].includes(error.code)) {
    throw error
  }

  const highest = await getHighestPatientCodeNumber()
  return formatPatientCode(highest + 1 + attempt)
}

export async function ensurePatientCode(patientId: string, existingPatientCode?: string | null) {
  if (existingPatientCode) return existingPatientCode

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const storedPatientCode = await getStoredPatientCode(patientId)
    if (storedPatientCode) return storedPatientCode

    const candidateCode = await getNextPatientCodeCandidate(attempt)

    const { error } = await supabase
      .from('patients')
      .update({ patient_code: candidateCode })
      .eq('id', patientId)
      .is('patient_code', null)

    if (error && (error as any)?.code !== '23505') throw error

    const refreshedPatientCode = await getStoredPatientCode(patientId)
    if (refreshedPatientCode) return refreshedPatientCode
  }

  throw new Error('Unable to assign patient code')
}
