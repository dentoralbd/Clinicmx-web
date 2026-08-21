import { supabase } from './supabase'
import type { Database } from './database.types'
import { sortKeyForAbsentPushdown, sortKeyForManualMove, sortQueueEntries } from './queueOrder'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type QueueEntry = Database['public']['Tables']['queue_entries']['Row']
export type QueueEntryInsert = Database['public']['Tables']['queue_entries']['Insert']
export type QueueSettings = Database['public']['Tables']['queue_settings']['Row']

export const HOLD_REASONS = [
  'Awaiting Local Anesthesia (LA)',
  'X-Ray / Diagnostic Imaging',
  'Pre-Op Prep',
  'Custom',
] as const

/** Local-clock "today" as YYYY-MM-DD. queue_date is stored explicitly (not
 * derived from created_at) precisely so this never has to reconcile with
 * the DB's UTC clock — see 061_patient_queue.sql. */
export function todayQueueDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function getQueueEntries(queueDate: string): Promise<QueueEntry[]> {
  const { data, error } = await supabase
    .from('queue_entries')
    .select('*')
    .eq('queue_date', queueDate)
  if (error) throw error
  return data || []
}

export async function getQueueSettings(): Promise<QueueSettings> {
  const { data, error } = await supabase.from('queue_settings').select('*').eq('id', true).single()
  if (error) throw error
  return data
}

export async function updateQueueSettings(patch: Database['public']['Tables']['queue_settings']['Update']) {
  const { error } = await supabase.from('queue_settings').update(patch).eq('id', true)
  if (error) throw error
}

/**
 * Allocates the daily serial atomically via next_queue_serial() (see the
 * migration) so two receptionists checking in at the same moment cannot
 * collide — the read-max-then-insert the sandbox did was a real race.
 */
export async function addQueueEntry(
  entry: Omit<QueueEntryInsert, 'serial_number' | 'queue_date'> & { queue_date?: string }
): Promise<QueueEntry> {
  const queueDate = entry.queue_date ?? todayQueueDate()

  const { data: serialData, error: serialError } = await supabase.rpc('next_queue_serial', {
    p_queue_date: queueDate,
  })
  if (serialError) throw serialError

  const { data, error } = await supabase
    .from('queue_entries')
    .insert({ ...entry, queue_date: queueDate, serial_number: serialData as number })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateQueueEntry(id: string, patch: Database['public']['Tables']['queue_entries']['Update']) {
  const { data, error } = await supabase.from('queue_entries').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data
}

export async function deleteQueueEntry(id: string) {
  const { error } = await supabase.from('queue_entries').delete().eq('id', id)
  if (error) throw error
}

/**
 * Mark absent = push down N places (queue_settings.absent_pushdown_places),
 * not remove or send to the back. `allEntries` must be today's full,
 * currently-loaded list (canonical order is computed internally).
 */
export async function markQueueEntryAbsent(allEntries: QueueEntry[], entry: QueueEntry, places: number) {
  const newSortKey = sortKeyForAbsentPushdown(allEntries, entry, places)
  return updateQueueEntry(entry.id, {
    sort_key: newSortKey,
    absent_marks: entry.absent_marks + 1,
    last_absent_at: new Date().toISOString(),
  })
}

/** Manual reorder: place `entryId` directly after `afterId` (null = front). */
export async function moveQueueEntry(allEntries: QueueEntry[], entryId: string, afterId: string | null) {
  const newSortKey = sortKeyForManualMove(allEntries, entryId, afterId)
  return updateQueueEntry(entryId, { sort_key: newSortKey })
}

// === Shared queue actions ===================================================
// Every caller (QueueManagement, QueueFloatingWidget) MUST route through
// these functions rather than writing queue_entries status transitions
// directly, so the two surfaces cannot drift apart on what each status
// transition means. (Call Next no longer auto-completes the current
// patient — see callNextPatient's own doc comment — so more than one entry
// can be 'serving' at once; that's accepted, not a bug to guard against.)

/**
 * Calls the next waiting patient (canonical order — urgent first, then
 * schedule/arrival order). `doctorId` is `app_users.id` when a real doctor
 * identity is calling and is written to `assigned_doctor` — this is what
 * fixes the sandbox's defect where assigned_doctor existed in the schema
 * but no code path ever wrote it. Pass `null` when reception calls without
 * a specific doctor session (assigned_doctor is a FK to app_users, so it
 * must never be a placeholder string).
 *
 * This deliberately does NOT complete the patient already in the chair
 * (user decision, 2026-08-16). It used to, for a doctor-identified call,
 * as the fix for the sandbox's "two patients in serving at once" defect —
 * that guarantee is now given up in favour of Call Next doing exactly one
 * thing. Finishing a consultation is the separate Complete & Bill action.
 * Consequence to keep in mind: QueueDisplay.tsx and AGY's queue.html both
 * render EVERY serving entry, so more than one patient can legitimately
 * show on the waiting-room board at the same time.
 */
export async function callNextPatient(
  entries: QueueEntry[],
  doctorId: string | null,
  roomNumber: string | null
): Promise<QueueEntry | null> {
  const next = sortQueueEntries(entries.filter((e) => e.status === 'waiting'))[0]
  if (!next) return null

  return updateQueueEntry(next.id, {
    status: 'serving',
    assigned_doctor: doctorId,
    room_number: roomNumber,
    called_at: new Date().toISOString(),
  })
}

/** Puts the currently-serving patient on hold (e.g. local anaesthesia settling, X-ray). */
export async function holdQueueEntry(id: string, reason: string) {
  return updateQueueEntry(id, { status: 'on_hold', hold_reason: reason })
}

/** Brings an on-hold patient back into the chair. */
export async function resumeQueueEntry(id: string) {
  return updateQueueEntry(id, { status: 'serving', called_at: new Date().toISOString(), hold_reason: null })
}

/** Doctor finishes a consultation: routes the patient to the front-desk billing/dispense lane. */
export async function completeAndBillEntry(id: string) {
  return updateQueueEntry(id, { status: 'completed', billing_status: 'pending_payment' })
}

/** Reception settles payment and hands over medicine. */
export async function markBillingSettled(id: string) {
  return updateQueueEntry(id, { billing_status: 'paid_and_dispensed' })
}

/**
 * One shared realtime channel, refcounted, rather than the sandbox's
 * `queue_entries_changes_${Math.random()...}` per-subscriber channel name
 * (which guaranteed no dedup and could still collide on a short/empty
 * random suffix). QueueManagement, QueueFloatingWidget and QueueDisplay all
 * subscribe through this single module-level channel.
 *
 * Also handles the sandbox's midnight-rollover bug: that implementation
 * computed its `created_at >= today` filter once at subscribe time with a
 * `[]` deps array, so an always-on TV never re-filtered after midnight and
 * had no reconnect/polling fallback if the socket dropped. Here, the caller
 * is expected to re-derive `queueDate` itself (todayQueueDate()) on each
 * poll/callback tick and re-subscribe when it changes — subscribeToQueue
 * itself listens to ALL queue_entries changes (no date filter) precisely so
 * a date rollover doesn't require tearing down and rebuilding the socket.
 */
let sharedChannel: RealtimeChannel | null = null
let subscriberCount = 0
const listeners = new Set<() => void>()

export function subscribeToQueue(onChange: () => void): () => void {
  listeners.add(onChange)
  subscriberCount++

  if (!sharedChannel) {
    sharedChannel = supabase
      .channel('queue_entries_shared')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, () => {
        listeners.forEach((fn) => fn())
      })
      .subscribe()
  }

  return () => {
    listeners.delete(onChange)
    subscriberCount--
    if (subscriberCount <= 0 && sharedChannel) {
      supabase.removeChannel(sharedChannel)
      sharedChannel = null
      subscriberCount = 0
    }
  }
}

/**
 * Polling fallback for surfaces (esp. an always-on waiting-room screen) that
 * must not go silently stale if the realtime socket drops. Callers should
 * run this alongside subscribeToQueue, not instead of it — realtime gives
 * near-instant updates, polling is the safety net.
 */
export function pollQueue(onTick: () => void, intervalMs = 15000): () => void {
  const id = window.setInterval(onTick, intervalMs)
  return () => window.clearInterval(id)
}
