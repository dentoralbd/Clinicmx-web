import { supabase } from '@/lib/supabase'

export type CelebrationType = 'birthday' | 'anniversary'

export interface CelebrationEvent {
  id: string
  patientId: string
  patientName: string
  phone: string | null
  type: CelebrationType
  dateStr: string
  isToday: boolean
  daysUntil: number
  isSent: boolean
}

const STORAGE_PREFIX = 'clinicmx_celebration_sent_'

export function getCelebrationStorageKey(patientId: string, type: CelebrationType, year: number): string {
  return `${STORAGE_PREFIX}${patientId}_${type}_${year}`
}

export function isCelebrationSentLocally(patientId: string, type: CelebrationType, year: number = new Date().getFullYear()): boolean {
  try {
    const key = getCelebrationStorageKey(patientId, type, year)
    return !!localStorage.getItem(key)
  } catch {
    return false
  }
}

export function markCelebrationSent(patientId: string, type: CelebrationType, year: number = new Date().getFullYear()): void {
  try {
    const key = getCelebrationStorageKey(patientId, type, year)
    localStorage.setItem(key, new Date().toISOString())
  } catch (err) {
    console.error('Could not save celebration sent flag:', err)
  }
}

/**
 * Cross-device "already greeted this year" source. Reads activity_log for
 * whatsapp_greeting entries created since Jan 1 of `year` and returns a set
 * of "${patientId}:${type}" keys — the `details` text written alongside the
 * insert (see CelebrationGreetingModal) starts with the type word, which is
 * what we match on here. Best-effort: any failure returns an empty set so a
 * flaky read never blocks the widget, it just won't show cross-device Sent
 * state until the next successful poll.
 */
export async function fetchSentCelebrations(year: number = new Date().getFullYear()): Promise<Set<string>> {
  const yearStart = `${year}-01-01T00:00:00.000Z`
  try {
    const { data, error } = await supabase
      .from('activity_log')
      .select('entity_id, details')
      .eq('entity_type', 'whatsapp_greeting')
      .gte('occurred_at', yearStart)
    if (error) throw error
    const set = new Set<string>()
    for (const row of data || []) {
      const patientId = row.entity_id as string | null
      const details = (row.details as string | null) || ''
      if (!patientId) continue
      if (/birthday/i.test(details)) set.add(`${patientId}:birthday`)
      if (/anniversary/i.test(details)) set.add(`${patientId}:anniversary`)
    }
    return set
  } catch {
    return new Set()
  }
}

/**
 * Extracts a patient's anniversary date (YYYY-MM-DD or MM-DD) from an
 * [anniversary: YYYY-MM-DD] tag inside patient notes. There is no dedicated
 * anniversary_date column — this rides inside the existing notes field so
 * no schema migration is needed.
 */
export function extractPatientAnniversary(patient: any): string | null {
  if (!patient) return null
  const combinedNotes = `${patient.notes || ''} ${patient.medical_history || ''}`
  const tagMatch = combinedNotes.match(/\[anniversary:\s*(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})\]/i)
  if (tagMatch) return tagMatch[1]
  return null
}

/**
 * Calculates days remaining until the next annual occurrence of a MM-DD (or
 * YYYY-MM-DD) date. Returns { daysUntil: 0, isToday: true } when the event
 * is today.
 */
export function getDaysUntilAnnualEvent(dateString: string | null | undefined): { daysUntil: number; isToday: boolean } | null {
  if (!dateString) return null

  const parts = dateString.split('-')
  if (parts.length < 2) return null

  // Support both YYYY-MM-DD and MM-DD
  const month = parseInt(parts.length === 3 ? parts[1] : parts[0], 10) - 1
  const day = parseInt(parts.length === 3 ? parts[2] : parts[1], 10)

  if (isNaN(month) || isNaN(day) || month < 0 || month > 11 || day < 1 || day > 31) {
    return null
  }

  const now = new Date()
  const todayMonth = now.getMonth()
  const todayDay = now.getDate()

  if (todayMonth === month && todayDay === day) {
    return { daysUntil: 0, isToday: true }
  }

  const todayMidnight = new Date(now)
  todayMidnight.setHours(0, 0, 0, 0)

  const thisYear = now.getFullYear()
  let nextDate = new Date(thisYear, month, day)

  // If the date has already passed this year, use next year's occurrence.
  if (nextDate.getTime() < todayMidnight.getTime()) {
    nextDate = new Date(thisYear + 1, month, day)
  }

  const diffMs = nextDate.getTime() - todayMidnight.getTime()
  const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24))

  return { daysUntil, isToday: false }
}

/**
 * Computes all celebration events (birthdays + anniversaries) within the
 * next 30 days for a given patient list. `sentKeys` (from
 * fetchSentCelebrations) marks events already greeted on any device;
 * falls back to the per-device localStorage flag when omitted/stale.
 */
export function extractCelebrations(patients: any[], sentKeys?: Set<string>): CelebrationEvent[] {
  const events: CelebrationEvent[] = []
  const currentYear = new Date().getFullYear()

  const isSent = (patientId: string, type: CelebrationType) =>
    (sentKeys ? sentKeys.has(`${patientId}:${type}`) : false) || isCelebrationSentLocally(patientId, type, currentYear)

  for (const p of patients) {
    if (!p || !p.id) continue
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient'
    const phone = p.phone || null

    if (p.date_of_birth) {
      const bdayInfo = getDaysUntilAnnualEvent(p.date_of_birth)
      if (bdayInfo && bdayInfo.daysUntil <= 30) {
        events.push({
          id: `bday-${p.id}`,
          patientId: p.id,
          patientName: name,
          phone,
          type: 'birthday',
          dateStr: p.date_of_birth,
          isToday: bdayInfo.isToday,
          daysUntil: bdayInfo.daysUntil,
          isSent: isSent(p.id, 'birthday'),
        })
      }
    }

    const anniversaryDate = extractPatientAnniversary(p)
    if (anniversaryDate) {
      const annInfo = getDaysUntilAnnualEvent(anniversaryDate)
      if (annInfo && annInfo.daysUntil <= 30) {
        events.push({
          id: `anniv-${p.id}`,
          patientId: p.id,
          patientName: name,
          phone,
          type: 'anniversary',
          dateStr: anniversaryDate,
          isToday: annInfo.isToday,
          daysUntil: annInfo.daysUntil,
          isSent: isSent(p.id, 'anniversary'),
        })
      }
    }
  }

  // Sort: Today first, then ascending by days until event
  return events.sort((a, b) => {
    if (a.isToday && !b.isToday) return -1
    if (!a.isToday && b.isToday) return 1
    return a.daysUntil - b.daysUntil
  })
}
