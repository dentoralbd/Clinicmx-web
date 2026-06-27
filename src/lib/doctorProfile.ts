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
  updated_at?: string
}

const LOCAL_DOCTOR_PROFILE_KEY = 'clinicmx_doctor_profile'

async function readLocalDoctorProfile() {
 return readSecureJson<DoctorProfileData>(getScopedStorageKey(LOCAL_DOCTOR_PROFILE_KEY))
}

async function writeLocalDoctorProfile(profile: DoctorProfileData) {
 await writeSecureJson(getScopedStorageKey(LOCAL_DOCTOR_PROFILE_KEY), profile)
}

async function getSupabaseUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user?.id) return session.user.id

  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

export function isDoctorProfileAuthError(error: unknown) {
  return error instanceof Error && error.message === 'AUTH_REQUIRED'
}

export async function loadDoctorProfile() {
  const localProfile = await readLocalDoctorProfile()
  const userId = await getSupabaseUserId()

  if (!userId) return localProfile

  try {
    const { data, error } = await (supabase as any)
      .from('doctor_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error

    if (data) {
      await writeLocalDoctorProfile(data)
      return data as DoctorProfileData
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

  const userId = await getSupabaseUserId()
  if (!userId) {
    await writeLocalDoctorProfile(nextProfile)
    return nextProfile
  }

  const { id: _id, ...payloadWithoutId } = {
    ...nextProfile,
    user_id: userId,
  } as any

  const { data, error } = await (supabase as any)
    .from('doctor_profiles')
    .upsert([payloadWithoutId], { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error

  await writeLocalDoctorProfile(data)
  return data as DoctorProfileData
}
