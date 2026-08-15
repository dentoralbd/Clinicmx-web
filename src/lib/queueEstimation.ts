import { supabase } from './supabase'
import { sortQueueEntries, type Sortable } from './queueOrder'
import type { QueueEntry } from './queueApi'

const DEFAULT_DURATION_MINS = 15

/**
 * Procedure durations come from treatment_catalog_items.default_duration_mins
 * (production's existing catalog, migration 057 + 061) — NOT localStorage.
 * The sandbox kept a per-browser custom-procedure catalog synced by a
 * `window.dispatchEvent` hack; a procedure added at reception was invisible
 * on the doctor's device, which silently fell back to 15 minutes, so the
 * same queue produced different ETAs on different screens. Reading from the
 * shared table via react-query means every screen sees the same durations.
 */
export async function fetchProcedureDurations(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('treatment_catalog_items')
    .select('name, default_duration_mins')
  if (error) throw error
  const map: Record<string, number> = {}
  for (const row of data || []) {
    if (row.default_duration_mins != null) map[row.name] = row.default_duration_mins
  }
  return map
}

export function getProcedureDuration(
  procedureName: string | null | undefined,
  durations: Record<string, number>,
  fallback: number = DEFAULT_DURATION_MINS
): number {
  if (!procedureName) return fallback
  return durations[procedureName] ?? fallback
}

interface EstimationEntry extends Sortable {
  id: string
  status: QueueEntry['status']
  estimated_duration_mins: number
  called_at: string | null
  assigned_doctor: string | null
}

/**
 * Elapsed minutes since the currently-serving patient in a doctor's chair
 * was actually called — using called_at (stamped by the DB trigger-adjacent
 * write on transition into 'serving'), not created_at/updated_at generally.
 * The sandbox derived this from `updated_at`, which was silently broken
 * there because its updated_at trigger referenced a function that doesn't
 * exist (see the migration 061 header note) — so every ETA was computed
 * from check-in time instead of call time.
 */
function elapsedSinceCalled(entry: EstimationEntry, now: Date): number {
  if (!entry.called_at) return 0
  return Math.max(0, (now.getTime() - new Date(entry.called_at).getTime()) / 60000)
}

export interface QueueEta {
  id: string
  etaClock: Date
  etaMinutesFromNow: number
}

/**
 * Rolling-clock ETA per waiting entry, and total backlog per doctor. Walks
 * the canonical queue order (compareQueueEntries — urgent-first, then
 * sort_key), accumulating each doctor's remaining time as it goes, so a
 * walk-in inserted ahead of someone in the schedule correctly shifts that
 * person's ETA later without any special-case code.
 */
export function calculateQueueEtas(entries: EstimationEntry[], now: Date = new Date()): QueueEta[] {
  const ordered = sortQueueEntries(entries)
  const backlogByDoctor = new Map<string, number>()

  // Seed backlog with time remaining on whoever is currently in the chair
  // (serving or on_hold) for each doctor.
  for (const e of ordered) {
    if ((e.status === 'serving' || e.status === 'on_hold') && e.assigned_doctor) {
      const remaining = Math.max(3, e.estimated_duration_mins - elapsedSinceCalled(e, now))
      backlogByDoctor.set(e.assigned_doctor, (backlogByDoctor.get(e.assigned_doctor) ?? 0) + remaining)
    }
  }

  const results: QueueEta[] = []
  for (const e of ordered) {
    if (e.status !== 'waiting') continue
    const doctorKey = e.assigned_doctor ?? '__unassigned__'
    const waitMins = backlogByDoctor.get(doctorKey) ?? 0
    results.push({
      id: e.id,
      etaMinutesFromNow: Math.round(waitMins),
      etaClock: new Date(now.getTime() + waitMins * 60000),
    })
    backlogByDoctor.set(doctorKey, waitMins + e.estimated_duration_mins)
  }
  return results
}

/** Total remaining workload for one doctor — serving/on_hold remainder plus
 * every waiting patient assigned to them. */
export function calculateDoctorBacklogMins(
  entries: EstimationEntry[],
  doctorId: string,
  now: Date = new Date()
): number {
  let total = 0
  for (const e of entries) {
    if (e.assigned_doctor !== doctorId) continue
    if (e.status === 'serving' || e.status === 'on_hold') {
      total += Math.max(3, e.estimated_duration_mins - elapsedSinceCalled(e, now))
    } else if (e.status === 'waiting') {
      total += e.estimated_duration_mins
    }
  }
  return Math.round(total)
}
