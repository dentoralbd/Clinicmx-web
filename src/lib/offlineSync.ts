import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { get, set } from 'idb-keyval'
import { getAppRole, getAuditActor } from '@/lib/appSession'
import { qk } from '@/repositories/keys'
import { insertInvoiceWithAutoNumber } from '@/lib/invoiceNumbering'

const OUTBOX_KEY = 'clinicmx_offline_mutations_v1'
const MAX_ATTEMPTS = 5
const MAX_SCHEMA_FALLBACK_RETRIES = 6

export type MutationAction = 'insert' | 'update' | 'update_many' | 'delete'
export type MutationStatus = 'pending' | 'blocked' | 'failed'

export interface PendingMutation {
  id: string
  /** Mutations sharing a groupId sync as an ordered unit (see `seq`); a failure blocks the rest of the group. */
  groupId?: string
  seq?: number
  table: string
  action: MutationAction
  payload: any
  meta: { patientId?: string | null; label: string }
  timestamp: string
  actor?: string | null
  attempts: number
  lastError?: string | null
  status: MutationStatus
}

export type EnqueueInput = {
  table: string
  action: MutationAction
  payload: any
  meta: { patientId?: string | null; label: string }
  groupId?: string
  seq?: number
  actor?: string | null
}

// ---------------------------------------------------------------------------
// Storage — every read-modify-write of the outbox array serializes through
// this single promise chain. The redesign this was ported from wrote the
// whole array back at the end of a sync batch, which silently erased any
// mutation enqueued while that batch was still running (a save made mid-sync
// vanished). Funneling every mutator through one chain closes that gap: each
// operation always starts from the array the previous operation just wrote.
// ---------------------------------------------------------------------------
let chain: Promise<unknown> = Promise.resolve()

function withOutbox<T>(fn: (current: PendingMutation[]) => { next: PendingMutation[]; result: T }): Promise<T> {
  const run = chain.then(async () => {
    const current = (await get<PendingMutation[]>(OUTBOX_KEY)) || []
    const { next, result } = fn(current)
    await set(OUTBOX_KEY, next)
    notify()
    return result
  })
  // Swallow so one failed link doesn't wedge the whole chain for later callers.
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function notify() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('clinicmx_outbox_updated'))
  }
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  return (await get<PendingMutation[]>(OUTBOX_KEY)) || []
}

export function newGroupId(): string {
  return crypto.randomUUID()
}

// ---------------------------------------------------------------------------
// Account scoping — the outbox is device-local, but a clinic device is often
// shared across staff logins. Whoever created an offline edit is the one who
// approves it; admin is the only role that can act on someone else's queued
// edit (matches the delete/revert permission model elsewhere in the app).
// This is a workflow safeguard enforced in the UI + these helpers, the same
// trust model as canDelete()/canRevert() — not a server-side security
// boundary, since the outbox never leaves the device until sync anyway.
// ---------------------------------------------------------------------------
function canActOn(mut: Pick<PendingMutation, 'actor'>): boolean {
  return getAppRole() === 'admin' || mut.actor === getAuditActor()
}

/** Mutations the current session may see/act on: admins see every pending edit on this device, everyone else sees only the ones their own account created. */
export async function getVisiblePendingMutations(): Promise<PendingMutation[]> {
  const all = await getPendingMutations()
  return getAppRole() === 'admin' ? all : all.filter((m) => canActOn(m))
}

export async function enqueueMutation(mutation: EnqueueInput): Promise<PendingMutation> {
  return withOutbox((current) => {
    const item: PendingMutation = {
      id: crypto.randomUUID(),
      groupId: mutation.groupId,
      seq: mutation.seq ?? 0,
      table: mutation.table,
      action: mutation.action,
      payload: mutation.payload,
      meta: mutation.meta,
      timestamp: new Date().toISOString(),
      actor: mutation.actor || getAuditActor(),
      attempts: 0,
      lastError: null,
      status: 'pending',
    }
    return { next: [...current, item], result: item }
  })
}

async function removeMutation(id: string): Promise<void> {
  await withOutbox((current) => ({ next: current.filter((m) => m.id !== id), result: undefined }))
}

async function updateMutation(id: string, patch: Partial<PendingMutation>): Promise<void> {
  await withOutbox((current) => ({
    next: current.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    result: undefined,
  }))
}

const BUNDLE_FIELD_BY_TABLE: Record<string, string> = {
  treatments: 'treatments',
  invoices: 'invoices',
  payments: 'payments',
  patient_visits: 'visits',
  prescriptions: 'prescriptions',
}

/**
 * Discarding a draft (or clearing the whole outbox) must not leave a phantom
 * row in the patient bundle cache the offline write flow wrote optimistically
 * — remove the inserted record by its client id from the affected bundle,
 * then invalidate so a background refetch confirms the true server state.
 * Shared by every UI that lets a user discard a mutation (`/offline-outbox`,
 * the admin Offline Edits log) so they can't drift out of sync with each other.
 */
export function cleanUpOptimisticEntry(mut: PendingMutation): void {
  const patientId = mut.meta.patientId
  if (!patientId) return
  const bundleKey = qk.patients.bundle(patientId)
  const bundle = queryClient.getQueryData<any>(bundleKey)
  if (!bundle) return

  const field = BUNDLE_FIELD_BY_TABLE[mut.table]
  if (!field || !Array.isArray(bundle[field])) return

  if (mut.action === 'insert') {
    const rows = Array.isArray(mut.payload) ? mut.payload : [mut.payload]
    const ids = new Set(rows.map((r: any) => r?.id).filter(Boolean))
    queryClient.setQueryData(bundleKey, {
      ...bundle,
      [field]: bundle[field].filter((row: any) => !ids.has(row?.id)),
    })
  }
  queryClient.invalidateQueries({ queryKey: bundleKey })
}

/** Removes a mutation without attempting to sync it. Returns the removed item so the caller can clean up any optimistic cache entry it wrote. No-ops (returns null) if the current session didn't create it and isn't admin. */
export async function discardMutation(id: string): Promise<PendingMutation | null> {
  const all = await getPendingMutations()
  const mut = all.find((m) => m.id === id) || null
  if (!mut || !canActOn(mut)) return null
  await removeMutation(id)
  return mut
}

/** Clears the outbox. `scope` restricts which entries are removed (defaults to everything); pass `getAuditActor()`-based filtering for a non-admin caller — see `clearVisiblePending`. */
export async function clearOutbox(scope?: (m: PendingMutation) => boolean): Promise<PendingMutation[]> {
  return withOutbox((current) => {
    if (!scope) return { next: [], result: current }
    const removed = current.filter(scope)
    const next = current.filter((m) => !scope(m))
    return { next, result: removed }
  })
}

/** Clear All Drafts, scoped to what the current session is allowed to touch. */
export async function clearVisiblePending(): Promise<PendingMutation[]> {
  if (getAppRole() === 'admin') return clearOutbox()
  return clearOutbox((m) => canActOn(m))
}

// ---------------------------------------------------------------------------
// Schema-compatibility fallback — narrowed to the exact PostgREST "missing
// column" message, and strips only that one column per retry (looped, so
// several missing columns on a very old schema still resolve). This never
// touches `id`, discount/tax/notes, or anything else that legitimately
// exists on the table — the previous broad regex matched any
// "does not exist"/"schema cache" wording and stripped a fixed hardcoded set
// of fields on every match, which is what silently dropped the invoice's
// client-generated id (orphaning any payment queued against it) and
// doctor_share_pct/original_cost on unrelated errors.
// ---------------------------------------------------------------------------
function missingColumnName(error: unknown): string | null {
  const message = (error as { message?: string } | null)?.message || ''
  const match = message.match(/Could not find the '([^']+)' column/i)
  return match ? match[1] : null
}

function stripColumn(row: any, column: string) {
  const { [column]: _drop, ...rest } = row
  return rest
}

async function insertWithSchemaFallback(table: string, initialPayload: any): Promise<void> {
  let payload = initialPayload
  for (let attempt = 0; attempt < MAX_SCHEMA_FALLBACK_RETRIES; attempt++) {
    const { error } = await supabase.from(table as any).insert(payload)
    if (!error) return
    const column = missingColumnName(error)
    if (!column) throw error
    console.error(`[OfflineSync] ${table}.${column} missing on this schema — stripping that column and retrying`, error)
    payload = Array.isArray(payload) ? payload.map((row: any) => stripColumn(row, column)) : stripColumn(payload, column)
  }
  throw new Error(`[OfflineSync] ${table}: exceeded schema-fallback retries`)
}

async function updateWithSchemaFallback(table: string, id: string, initialFields: any): Promise<void> {
  let fields = initialFields
  for (let attempt = 0; attempt < MAX_SCHEMA_FALLBACK_RETRIES; attempt++) {
    const { error } = await supabase.from(table as any).update(fields).eq('id', id)
    if (!error) return
    const column = missingColumnName(error)
    if (!column) throw error
    console.error(`[OfflineSync] ${table}.${column} missing on this schema — stripping that column and retrying`, error)
    fields = stripColumn(fields, column)
  }
  throw new Error(`[OfflineSync] ${table}: exceeded schema-fallback retries`)
}

async function insertInvoiceWithFallback(payload: Record<string, any>): Promise<void> {
  let row = payload
  for (let attempt = 0; attempt < MAX_SCHEMA_FALLBACK_RETRIES; attempt++) {
    const { error } = await insertInvoiceWithAutoNumber(row)
    if (!error) return
    const column = missingColumnName(error)
    if (!column) throw error
    console.error(`[OfflineSync] invoices.${column} missing on this schema — stripping that column and retrying`, error)
    row = stripColumn(row, column)
  }
  throw new Error('[OfflineSync] invoices: exceeded schema-fallback retries')
}

async function executeMutation(mut: PendingMutation): Promise<void> {
  if (mut.action === 'insert') {
    if (mut.table === 'invoices') {
      await insertInvoiceWithFallback(mut.payload)
    } else {
      await insertWithSchemaFallback(mut.table, mut.payload)
    }
  } else if (mut.action === 'update') {
    const { id, ...fields } = mut.payload
    await updateWithSchemaFallback(mut.table, id, fields)
  } else if (mut.action === 'update_many') {
    const { ids, fields } = mut.payload as { ids: string[]; fields: Record<string, any> }
    const { error } = await supabase.from(mut.table as any).update(fields).in('id', ids)
    if (error) throw error
  } else if (mut.action === 'delete') {
    const { error } = await supabase.from(mut.table as any).delete().eq('id', mut.payload.id)
    if (error) throw error
  }
}

// ---------------------------------------------------------------------------
// Sync — manual only. No 'online' listener, no boot timer: nothing leaves
// the device until a human presses Approve & Sync on /offline-outbox.
// ---------------------------------------------------------------------------

async function syncOne(mut: PendingMutation): Promise<boolean> {
  try {
    await executeMutation(mut)
    await removeMutation(mut.id)
    return true
  } catch (err: any) {
    const attempts = mut.attempts + 1
    const message = err?.message || String(err)
    await updateMutation(mut.id, {
      attempts,
      lastError: message,
      status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
    })
    console.error('[OfflineSync] mutation failed', mut, err)
    return false
  }
}

function invalidateAfterSync(patientIds: Iterable<string | null | undefined>) {
  queryClient.invalidateQueries({ queryKey: qk.dashboard })
  queryClient.invalidateQueries({ queryKey: qk.patients.list })
  queryClient.invalidateQueries({ queryKey: qk.appointments.all })
  const seen = new Set<string>()
  for (const id of patientIds) {
    if (id && !seen.has(id)) {
      seen.add(id)
      queryClient.invalidateQueries({ queryKey: qk.patients.bundle(id) })
    }
  }
}

/** Syncs a single mutation by id, regardless of group/blocked state — used by the outbox card's per-item retry. No-ops (returns false) if the current session didn't create it and isn't admin. */
export async function syncMutationById(id: string): Promise<boolean> {
  const all = await getPendingMutations()
  const mut = all.find((m) => m.id === id)
  if (!mut || !canActOn(mut)) return false
  const ok = await syncOne({ ...mut, status: 'pending' })
  invalidateAfterSync([mut.meta.patientId])
  return ok
}

/** Syncs every mutation sharing a groupId, in seq order; a failure blocks (not fails) the rest of that group. No-ops if the current session may not act on this group (a group is always created by one account, so checking the first item is sufficient). */
export async function syncGroup(groupId: string): Promise<{ succeeded: number; failed: number }> {
  const all = await getPendingMutations()
  const items = all.filter((m) => m.groupId === groupId).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  if (items.length === 0 || !canActOn(items[0])) return { succeeded: 0, failed: 0 }
  let succeeded = 0
  let failed = 0
  let blocked = false
  const patientIds: (string | null | undefined)[] = []
  for (const m of items) {
    patientIds.push(m.meta.patientId)
    if (blocked) {
      await updateMutation(m.id, { status: 'blocked' })
      continue
    }
    const ok = await syncOne(m)
    if (ok) succeeded++
    else {
      failed++
      blocked = true
    }
  }
  invalidateAfterSync(patientIds)
  return { succeeded, failed }
}

/** Syncs everything pending — ungrouped mutations independently, grouped ones as ordered units. Skips items already marked `failed`; use per-item retry for those. `scope` restricts which entries are eligible (defaults to everything); see `syncVisiblePending` for the non-admin-scoped variant. */
export async function syncAll(scope?: (m: PendingMutation) => boolean): Promise<{ succeeded: number; failed: number }> {
  const pending = (await getPendingMutations()).filter((m) => m.status !== 'failed' && (!scope || scope(m)))
  const groups = new Map<string, PendingMutation[]>()
  const solo: PendingMutation[] = []
  for (const m of pending) {
    if (m.groupId) {
      const arr = groups.get(m.groupId) || []
      arr.push(m)
      groups.set(m.groupId, arr)
    } else {
      solo.push(m)
    }
  }

  let succeeded = 0
  let failed = 0
  const patientIds: (string | null | undefined)[] = []

  for (const m of solo) {
    patientIds.push(m.meta.patientId)
    const ok = await syncOne(m)
    if (ok) succeeded++
    else failed++
  }

  for (const items of groups.values()) {
    items.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    let blocked = false
    for (const m of items) {
      patientIds.push(m.meta.patientId)
      if (blocked) {
        await updateMutation(m.id, { status: 'blocked' })
        continue
      }
      const ok = await syncOne(m)
      if (ok) succeeded++
      else {
        failed++
        blocked = true
      }
    }
  }

  invalidateAfterSync(patientIds)
  return { succeeded, failed }
}

/** Approve & Sync All, scoped to what the current session is allowed to touch — admins sync everything pending; everyone else syncs only their own account's queued edits. */
export async function syncVisiblePending(): Promise<{ succeeded: number; failed: number }> {
  if (getAppRole() === 'admin') return syncAll()
  return syncAll((m) => canActOn(m))
}
