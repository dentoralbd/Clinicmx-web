import { format } from 'date-fns'

const bdtFormatter = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  maximumFractionDigits: 2,
})

export function formatBDT(value: number): string {
  return bdtFormatter.format(value || 0)
}

export function cn(...classes: (string | undefined | null | false | Record<string, boolean>)[]) {
  return classes
    .flatMap((c) => {
      if (!c) return []
      if (typeof c === 'string') return [c]
      if (typeof c === 'object') {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }
      return []
    })
    .join(' ')
}

/**
 * Safely format a date string or Date. Returns fallback (default '—') for
 * null / undefined / invalid values instead of throwing RangeError.
 */
export function safeFormat(
  value: string | Date | null | undefined,
  dateFormat: string,
  fallback = '—'
): string {
  if (!value) return fallback
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? fallback : format(d, dateFormat)
}

export function getPatientDobOrAge(
  dateOfBirth?: string | null,
  age?: number | string | null,
  fallback = '—'
) {
  const parsedAge =
    typeof age === 'string'
      ? Number.parseInt(age, 10)
      : typeof age === 'number'
        ? age
        : Number.NaN
  const hasAge = !Number.isNaN(parsedAge) && parsedAge >= 0

  if (!dateOfBirth) {
    return hasAge ? `Age ${parsedAge}` : fallback
  }

  const birthDate = new Date(dateOfBirth)
  if (Number.isNaN(birthDate.getTime())) {
    return hasAge ? `Age ${parsedAge}` : fallback
  }

  const today = new Date()
  let derivedAge = today.getFullYear() - birthDate.getFullYear()
  const monthDifference = today.getMonth() - birthDate.getMonth()

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    derivedAge -= 1
  }

  return `DOB ${format(birthDate, 'MMM d, yyyy')} • Age ${hasAge ? parsedAge : derivedAge}`
}
