export type AgeTier = 'infant' | 'child' | 'adult'

const INFANT_MAX_AGE = 2 // < 2 years => infant
const CHILD_MAX_AGE = 12 // 2-<12 => child; >=12 => adult

export function calculateAgeYears(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const birth = new Date(dateOfBirth)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function getAgeTier(ageYears: number | null): AgeTier {
  if (ageYears === null) return 'adult'
  if (ageYears < INFANT_MAX_AGE) return 'infant'
  if (ageYears < CHILD_MAX_AGE) return 'child'
  return 'adult'
}

export function getAgeTierFromDOB(dateOfBirth: string | null | undefined): AgeTier {
  return getAgeTier(calculateAgeYears(dateOfBirth))
}

// Dentition thresholds matching the Patient Profile dental chart:
// <5 deciduous, 5–14 mixed, >=15 or unknown permanent.
export type DentitionType = 'deciduous' | 'mixed' | 'permanent'

export function getDentitionTypeFromDOB(dateOfBirth: string | null | undefined): DentitionType {
  const age = calculateAgeYears(dateOfBirth)
  if (age === null || age > 14) return 'permanent'
  if (age >= 5) return 'mixed'
  return 'deciduous'
}

export function deriveDateOfBirthFromAge(age: number): string {
  const today = new Date()
  const year = today.getFullYear() - age
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const AGE_TIER_LABELS: Record<AgeTier, string> = {
  infant: 'Infant',
  child: 'Child',
  adult: 'Adult',
}
