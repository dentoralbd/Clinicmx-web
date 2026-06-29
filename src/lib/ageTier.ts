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

export const AGE_TIER_LABELS: Record<AgeTier, string> = {
  infant: 'Infant',
  child: 'Child',
  adult: 'Adult',
}
