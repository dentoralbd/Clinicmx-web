import { getScopedStorageKey, isAppAuthenticated } from './appSession'
import { readSecureJson, writeSecureJson } from './secureLocalStorage'
import { supabase } from './supabase'

export interface DoctorProfileData {
  id?: string
  user_id?: string
  full_name: string
  degrees: string
  designation: string
  workplace: string
  clinic_address: string
  phone: string
  email: string
  bmdc_reg: string
  /** Prescription header logo as a data URL — stored locally only, never sent to Supabase */
  logo_data?: string
  updated_at?: string
}

const LOCAL_DOCTOR_PROFILE_KEY = 'clinicmx_doctor_profile'

async function readLocalDoctorProfile() {
 return readSecureJson<DoctorProfileData>(getScopedStorageKey(LOCAL_DOCTOR_PROFILE_KEY))
}

async function writeLocalDoctorProfile(profile: DoctorProfileData) {
 await writeSecureJson(getScopedStorageKey(LOCAL_DOCTOR_PROFILE_KEY), profile)
}

// This app has no real Supabase Auth session (login is a local PIN gate
// only), and it's single-clinic/single-doctor, so doctor_profiles is treated
// as a singleton table — always the first row — rather than being scoped to
// a user_id that would never match.
async function getExistingDoctorProfileId() {
  const { data, error } = await (supabase as any)
    .from('doctor_profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as { id: string } | null)?.id || null
}

export function isDoctorProfileAuthError(error: unknown) {
  return error instanceof Error && error.message === 'AUTH_REQUIRED'
}

export async function loadDoctorProfile() {
  const localProfile = await readLocalDoctorProfile()

  try {
    const { data, error } = await (supabase as any)
      .from('doctor_profiles')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    if (data) {
      const merged: DoctorProfileData = { ...(data as DoctorProfileData), logo_data: localProfile?.logo_data }
      await writeLocalDoctorProfile(merged)
      return merged
    }
  } catch (error) {
    console.error('Error loading doctor profile from Supabase:', error)
  }

  return localProfile
}

export async function saveDoctorProfile(profile: DoctorProfileData) {
  if (!isAppAuthenticated()) {
    throw new Error('AUTH_REQUIRED')
  }

  const nextProfile: DoctorProfileData = {
    ...profile,
    updated_at: new Date().toISOString(),
  }

  const { id: _id, logo_data: _logo, ...payloadWithoutId } = nextProfile as any

  try {
    const existingId = await getExistingDoctorProfileId()

    const { data, error } = await (supabase as any)
      .from('doctor_profiles')
      .upsert([existingId ? { id: existingId, ...payloadWithoutId } : payloadWithoutId], { onConflict: 'id' })
      .select()
      .single()

    if (error) throw error

    const savedProfile: DoctorProfileData = { ...(data as DoctorProfileData), logo_data: nextProfile.logo_data }
    await writeLocalDoctorProfile(savedProfile)
    return savedProfile
  } catch (error) {
    console.error('Error saving doctor profile to Supabase:', error)
    await writeLocalDoctorProfile(nextProfile)
    return nextProfile
  }
}
