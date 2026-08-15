/**
 * Queue ordering primitives.
 *
 * The queue is NOT check-in order (that was the redesign-sandbox model,
 * where the token number doubled as position and every list sorted by
 * created_at). ClinicMx's queue instead follows the appointment schedule:
 * walk-ins insert mid-queue by arrival time, absent patients get pushed
 * down a few places rather than sent to the back, and reordering is
 * supported. All of that runs through one column, `sort_key`, using
 * fractional/"between" ordering — inserting or moving an entry writes the
 * midpoint of its new neighbours' keys, so every operation touches exactly
 * one row and never renumbers the queue.
 *
 * Every caller (QueueManagement, QueueFloatingWidget, QueueDisplay, the
 * queue-board Cloudflare Function) MUST route through this module rather
 * than inventing its own sort or its own "insert between" math — that is
 * the whole reason walk-in insertion, manual reorder and absent-pushdown
 * are a few lines each instead of three separate, easily-diverging
 * algorithms.
 */

export interface Sortable {
  sort_key: number
  priority: 'normal' | 'urgent'
}

/**
 * The one true ordering: urgent jumps the queue, schedule/arrival order
 * holds otherwise. Every list view and every "take the next patient" action
 * (Call Next, the board's Now Serving/Next in Line split) must use this —
 * an independent `created_at` sort is exactly the sandbox's bug where
 * priority was rendered as a badge but never actually reordered anything.
 */
export function compareQueueEntries(a: Sortable, b: Sortable): number {
  const aUrgent = a.priority === 'urgent' ? 1 : 0
  const bUrgent = b.priority === 'urgent' ? 1 : 0
  if (aUrgent !== bUrgent) return bUrgent - aUrgent
  return a.sort_key - b.sort_key
}

export function sortQueueEntries<T extends Sortable>(entries: T[]): T[] {
  return [...entries].sort(compareQueueEntries)
}

/** sort_key for a patient pulled in from a scheduled appointment: epoch
 * minutes of the appointment's date_time. This is what makes the queue's
 * base order the appointment schedule with no special-casing — a walk-in
 * uses the same expression (see sortKeyForWalkIn) with "now" standing in
 * for a booked slot, so a walk-in naturally slots in among appointments
 * whose times have already passed. */
export function sortKeyForAppointment(appointmentDateTimeIso: string): number {
  return Math.floor(new Date(appointmentDateTimeIso).getTime() / 60000)
}

/** sort_key for a walk-in: arrival time, same units as sortKeyForAppointment
 * so the two interleave correctly without a branch. */
export function sortKeyForWalkIn(arrivalTime: Date = new Date()): number {
  return Math.floor(arrivalTime.getTime() / 60000)
}

const MIN_GAP = 1e-6

/**
 * Midpoint between two neighbouring sort_keys. Pass `null` for "no lower
 * neighbour" (insert at the very front) or "no upper neighbour" (insert at
 * the very back). Used for manual reorder (move up/down, drag) and for the
 * absent-pushdown below.
 */
export function midpointBetween(lower: number | null, upper: number | null): number {
  if (lower === null && upper === null) return sortKeyForWalkIn()
  if (lower === null) return (upper as number) - 1
  if (upper === null) return lower + 1
  const mid = (lower + upper) / 2
  // Keys should not collide in normal clinic-day volumes, but guard against
  // float-precision exhaustion by nudging rather than colliding.
  return mid > lower && mid < upper ? mid : lower + MIN_GAP
}

/**
 * Absent = pushed down N places, not sent to the back. `entries` must
 * already be in canonical order (sortQueueEntries) and include the entry
 * being pushed. Returns the new sort_key to write for `entry` — the
 * midpoint between the Nth and (N+1)th entries below it, so it drops
 * exactly N places without touching any other row's sort_key.
 */
export function sortKeyForAbsentPushdown<T extends Sortable & { id: string }>(
  entries: T[],
  entry: T,
  places: number
): number {
  const ordered = sortQueueEntries(entries)
  const idx = ordered.findIndex((e) => e.id === entry.id)
  if (idx === -1) return entry.sort_key

  const below = ordered.slice(idx + 1)
  const targetIdx = Math.min(places, below.length) - 1

  if (targetIdx < 0) {
    // Nothing below to push past — already at (or near) the back.
    return entry.sort_key
  }

  const lower = below[targetIdx].sort_key
  const upper = targetIdx + 1 < below.length ? below[targetIdx + 1].sort_key : null
  return midpointBetween(lower, upper)
}

/**
 * Move an entry to sit directly after `afterId` (or to the front if
 * `afterId` is null) within the given canonical-order list.
 */
export function sortKeyForManualMove<T extends Sortable & { id: string }>(
  entries: T[],
  entryId: string,
  afterId: string | null
): number {
  const ordered = sortQueueEntries(entries).filter((e) => e.id !== entryId)
  if (afterId === null) {
    return midpointBetween(null, ordered[0]?.sort_key ?? null)
  }
  const afterIdx = ordered.findIndex((e) => e.id === afterId)
  if (afterIdx === -1) return midpointBetween(null, ordered[0]?.sort_key ?? null)
  const lower = ordered[afterIdx].sort_key
  const upper = afterIdx + 1 < ordered.length ? ordered[afterIdx + 1].sort_key : null
  return midpointBetween(lower, upper)
}

/**
 * Position is computed, never stored — a row-number over the canonical
 * sort. This is why an insert, a manual reorder or an absent-pushdown never
 * has to rewrite every row below it: the board and the reception screen
 * both derive "3rd in line" from this at render time, so it can never go
 * stale the way a stored position column would after any edit elsewhere.
 */
export function computePositions<T extends Sortable & { id: string }>(
  entries: T[]
): Map<string, number> {
  const ordered = sortQueueEntries(entries)
  const positions = new Map<string, number>()
  ordered.forEach((e, i) => positions.set(e.id, i + 1))
  return positions
}
