import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { get, set } from 'idb-keyval'
import { getAppRole, getAuditActor } from '@/lib/appSession'
import { qk } from '@/repositories/keys'
import { insertInvoiceWithAutoNumber } from '@/lib/invoiceNumbering'
import { encryptPayload, decryptPayload } from '@/lib/payloadCrypto'

const OUTBOX_KEY = 'clinicmx_offline_mutations_v1'
const MAX_ATTEMPTS = 5
const MAX_SCHEMA_FALLBACK_RETRIES = 6
const DEVICE_ID_KEY = 'clinicmx_device_id'
// A claim older than this is stealable — recovers rows whose claiming
// device died mid-sync instead of wedging them forever.
const CLAIM_STALE_MS = 10 * 60 * 1000

/** Stable per-browser id, diagnostics only — lets a sitewide report be traced back to "which of my devices" without being security-relevant (RLS never checks this). */
function getDeviceId(): string {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return 'unknown'
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/**
 * Marks a sitewide report as terminal (synced or discarded) instead of
 * deleting it — a DELETE would let the row resurrect the next time
 * reportPendingToServer() re-upserts a stale copy from a device that hasn't
 * caught up yet (see the offline_edit_queue_guard_update trigger, migration
 * 055, which makes this sticky and nulls the ciphertext at the same time).
 * Best-effort: never throws; returns whether the update actually landed so
 * callers that need to know (remote discard) can surface a failure.
 */
async function markStagedReport(clientMutationId: string, status: 'synced' | 'discarded'): Promise<boolean> {
  const { error } = await supabase.from('offline_edit_queue').update({ status }).eq('client_mutation_id', clientMutationId)
  if (error) {
    console.warn('[OfflineSync] Could not update sitewide report status:', error.message)
    return false
  }
  return true
}

export type ClaimResult = 'claimed' | 'taken' | 'absent' | 'network-error'

/**
 * Atomic compare-and-swap so two devices (or a user + admin) can never both
 * execute the same offline edit — replaces a check-then-execute read, which
 * is a race (both read 'pending', both execute) rather than a guard.
 * Postgres row-locks serialize concurrent claim attempts; the loser sees
 * zero rows updated. 'absent' means this mutation was never reported
 * server-side (or was already purged) — the only device that can possibly
 * hold it is this one, so the caller should proceed as normal.
 */
async function claimMutation(clientMutationId: string): Promise<ClaimResult> {
  try {
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
    const { data, error } = await supabase
      .from('offline_edit_queue')
      .update({ claimed_at: new Date().toISOString(), claimed_by_device: getDeviceId() })
      .eq('client_mutation_id', clientMutationId)
      .in('status', ['pending', 'blocked', 'failed'])
      .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
      .select('id')
    if (error) return 'network-error'
    if (data && data.length > 0) return 'claimed'

    // Zero rows: either someone else holds an active claim, the row is
    // terminal (synced/discarded), or it never existed. Disambiguate.
    const { data: existing, error: lookupError } = await supabase
      .from('offline_edit_queue')
      .select('id')
      .eq('client_mutation_id', clientMutationId)
      .maybeSingle()
    if (lookupError) return 'network-error'
    return existing ? 'taken' : 'absent'
  } catch {
    return 'network-error'
  }
}

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
  meta: { patientId?: string | null; patientName?: string | null; label: string; detail?: string | null }
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
  meta: { patientId?: string | null; patientName?: string | null; label: string; detail?: string | null }
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
  void markStagedReport(mut.id, 'discarded')
  return mut
}

/** Clears the outbox. `scope` restricts which entries are removed (defaults to everything); pass `getAuditActor()`-based filtering for a non-admin caller — see `clearVisiblePending`. */
export async function clearOutbox(scope?: (m: PendingMutation) => boolean): Promise<PendingMutation[]> {
  const removed = await withOutbox((current) => {
    if (!scope) return { next: [], result: current }
    const removed = current.filter(scope)
    const next = current.filter((m) => !scope(m))
    return { next, result: removed }
  })
  for (const mut of removed) void markStagedReport(mut.id, 'discarded')
  return removed
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

// entity_type values the rest of the app already uses in activity_log — kept
// consistent so this shows up correctly anywhere else that reads the table
// (Activity Log tab, Pt. Log). Audit-log tables are support entries for
// another mutation in the same group, not a distinct user-facing action, so
// they never get their own "synced" notification.
const TABLE_ENTITY_TYPE: Record<string, string> = {
  treatments: 'treatment',
  invoices: 'invoice',
  payments: 'payment',
  patient_visits: 'patient_visit',
  prescriptions: 'prescription',
  patients: 'patient',
}

/**
 * Fire-and-forget: once a mutation actually lands in the real tables (i.e.
 * someone — the account that queued it, or an admin acting on their behalf —
 * pressed Approve & Sync), record who originally made the offline edit so
 * admin's notification bell can surface it for review. Deliberately inserts
 * directly rather than through logActivity(), which always stamps the
 * *current* session as actor — here that would misattribute the edit to
 * whoever clicked Approve & Sync instead of who actually made it.
 */
function reportSyncedForReview(mut: PendingMutation): void {
  const entityType = TABLE_ENTITY_TYPE[mut.table]
  if (!entityType) return
  // Only the group's first step gets a notification — an invoice + its
  // treatment-link + its payment syncing together is one event to admin,
  // not three.
  if (mut.groupId && (mut.seq ?? 0) !== 0) return
  void supabase
    .from('activity_log')
    .insert({
      action: 'edit',
      entity_type: entityType,
      entity_label: mut.meta.label,
      patient_id: mut.meta.patientId ?? null,
      patient_name: mut.meta.patientName ?? null,
      details: `[Offline Sync] ${mut.meta.detail ? `${mut.meta.label} — ${mut.meta.detail}` : mut.meta.label}`,
      actor: mut.actor || 'doctor',
    })
    .then(({ error }) => {
      if (error) console.warn('[OfflineSync] Could not record sync notification:', error.message)
    })
}

/**
 * 'ok' = executed here. 'skipped' = someone else already approved (or
 * discarded) this edit from another device — dropped locally without
 * executing, no duplicate [Offline Sync] notification (the other device
 * already wrote one). 'failed' = genuinely failed; attempts/lastError
 * recorded as before.
 */
type SyncOutcome = 'ok' | 'skipped' | 'failed'

async function syncOne(mut: PendingMutation): Promise<SyncOutcome> {
  try {
    const claim = await claimMutation(mut.id)
    if (claim === 'network-error') {
      throw new Error('Could not verify this edit was not already approved elsewhere — try again once online.')
    }
    if (claim === 'taken') {
      await removeMutation(mut.id)
      return 'skipped'
    }
    await executeMutation(mut)
    await removeMutation(mut.id)
    reportSyncedForReview(mut)
    await markStagedReport(mut.id, 'synced')
    return 'ok'
  } catch (err: any) {
    const attempts = mut.attempts + 1
    const message = err?.message || String(err)
    await updateMutation(mut.id, {
      attempts,
      lastError: message,
      status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
    })
    console.error('[OfflineSync] mutation failed', mut, err)
    return 'failed'
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
  const outcome = await syncOne({ ...mut, status: 'pending' })
  invalidateAfterSync([mut.meta.patientId])
  return outcome !== 'failed'
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
    const outcome = await syncOne(m)
    if (outcome === 'failed') {
      failed++
      blocked = true
    } else {
      succeeded++
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
    const outcome = await syncOne(m)
    if (outcome === 'failed') failed++
    else succeeded++
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
      const outcome = await syncOne(m)
      if (outcome === 'failed') {
        failed++
        blocked = true
      } else {
        succeeded++
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

export interface OfflineSyncAlertRow {
  id: string
  occurred_at: string
  entity_type: string
  entity_label: string | null
  patient_id: string | null
  patient_name: string | null
  details: string | null
  actor: string
}

const OFFLINE_SYNC_LOOKBACK_DAYS = 7

/**
 * Recent offline edits that have actually landed in the real tables (see
 * reportSyncedForReview) — for the admin notification bell, so admin finds
 * out once someone's offline work is approved & synced, with who made it.
 * Cross-device by design (read fresh from Supabase like listRecentBillingAlerts,
 * not from local IndexedDB) — this is a record of a completed sync, not the
 * still-local, not-yet-synced outbox. Best-effort: never throws.
 */
export async function listRecentOfflineSyncAlerts(): Promise<OfflineSyncAlertRow[]> {
  try {
    const since = new Date(Date.now() - OFFLINE_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('activity_log')
      .select('id, occurred_at, entity_type, entity_label, patient_id, patient_name, details, actor')
      .like('details', '[Offline Sync]%')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(10)
    if (error) return []
    return (data || []) as OfflineSyncAlertRow[]
  } catch {
    return []
  }
}

const OFFLINE_SYNC_SEEN_KEY = 'clinicmx_offline_sync_alerts_seen'

/** Per-device "last seen" watermark for the offline-sync alert unread dot — same pattern as billingAlerts.ts's getBillingAlertsSeen/setBillingAlertsSeen, kept separate so opening one doesn't mark the other read. */
export function getOfflineSyncAlertsSeen(): string {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return new Date().toISOString()
  const stored = localStorage.getItem(OFFLINE_SYNC_SEEN_KEY)
  if (stored) return stored
  const now = new Date().toISOString()
  localStorage.setItem(OFFLINE_SYNC_SEEN_KEY, now)
  return now
}

export function setOfflineSyncAlertsSeen(iso: string) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return
  localStorage.setItem(OFFLINE_SYNC_SEEN_KEY, iso)
}

// ---------------------------------------------------------------------------
// Sitewide visibility + cross-device approval (offline_edit_queue, migration
// 054 for metadata, 055 for the encrypted payload). A device can't tell the
// server anything while genuinely offline; the moment it has any
// connectivity again, it reports what's still queued — encrypted, so the
// creator (or admin) can approve it from a different device if the
// originating one is lost, replaced, or simply not at hand. See
// payloadCrypto.ts for the encryption and the honest security note there;
// see claimMutation() above for how two devices are kept from ever
// executing the same edit twice.
// ---------------------------------------------------------------------------

/**
 * Best-effort: upsert a report for every mutation still in the local
 * outbox, encrypting the payload when a session key is available. Call
 * whenever the device might have just gained connectivity (the 'online'
 * event, or on mount of a page that cares). Silently does nothing useful if
 * genuinely offline — the upsert just fails and is swallowed, exactly like
 * any other best-effort network call in this file. Never throws, never
 * blocks a caller.
 */
export async function reportPendingToServer(): Promise<void> {
  try {
    // Only this account's own items — reporting the whole device outbox
    // would let the BEFORE INSERT trigger stamp another account's queued
    // edits as created by whoever happens to be logged in right now (e.g.
    // after a shared clinic device changes hands), which RLS would then
    // treat as truth.
    const pending = (await getPendingMutations()).filter((m) => (m.actor || 'doctor') === getAuditActor())
    if (pending.length === 0) return
    const deviceId = getDeviceId()
    const rows = await Promise.all(
      pending.map(async (m) => {
        // Omitted entirely (not sent as null) when there's no session key —
        // the offline_edit_queue_guard_update trigger still protects a mixed
        // batch, but this keeps the common single-row case from ever asking.
        const encrypted = await encryptPayload(m.payload, m.id)
        return {
          client_mutation_id: m.id,
          group_id: m.groupId ?? null,
          seq: m.seq ?? 0,
          table_name: m.table,
          action: m.action,
          meta: m.meta as any,
          actor: m.actor || 'doctor',
          status: m.status === 'failed' ? 'failed' : m.status === 'blocked' ? 'blocked' : 'pending',
          attempts: m.attempts,
          last_error: m.lastError ?? null,
          device_id: deviceId,
          ...(encrypted ?? {}),
        }
      })
    )
    // created_by_user_id/status/attempts/last_error on a fresh insert are
    // re-stamped server-side by offline_edit_queue_fill_creator() — the
    // status here matters for the UPDATE half of this upsert (re-reporting
    // an item whose status changed since the last report).
    const { error } = await supabase
      .from('offline_edit_queue')
      .upsert(rows as any, { onConflict: 'created_by_user_id,client_mutation_id' })
    if (error) console.warn('[OfflineSync] Could not report pending edits sitewide:', error.message)
  } catch (err) {
    console.warn('[OfflineSync] Could not report pending edits sitewide:', err)
  }
}

export interface SitewidePendingRow {
  id: string
  client_mutation_id: string
  group_id: string | null
  seq: number
  table_name: string
  action: string
  meta: { patientId?: string | null; patientName?: string | null; label: string; detail?: string | null }
  actor: string
  status: string
  attempts: number
  last_error: string | null
  payload_encrypted: string | null
  payload_iv: string | null
  payload_alg: string | null
  claimed_at: string | null
  claimed_by_device: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

// Only still-actionable rows — once migration 055's guard trigger tombstones
// a row (synced/discarded) it's done, and without this filter every synced
// edit would count forever toward "pending" in the admin bell/badge.
const ACTIVE_STATUSES = ['pending', 'blocked', 'failed']

/**
 * Sitewide list of still-pending offline edits — admin sees every account's;
 * anyone else sees only their own (RLS-scoped, mirrors canActOn() but
 * enforced server-side too now). Includes this device's own items (already
 * visible locally via getVisiblePendingMutations) as well as any reported
 * from other devices — callers that already show the local list should
 * de-dupe on client_mutation_id. Best-effort: never throws.
 */
export async function fetchSitewidePendingEdits(): Promise<SitewidePendingRow[]> {
  try {
    const { data, error } = await supabase
      .from('offline_edit_queue')
      .select('*')
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return []
    return (data || []) as unknown as SitewidePendingRow[]
  } catch {
    return []
  }
}

/**
 * Same rows as fetchSitewidePendingEdits, narrowed to ones that actually
 * carry a decryptable payload — i.e. can be approved from here, not just
 * viewed. A row can be pending with no payload if it was reported by a
 * session that had no encryption key at the time (e.g. logged out); those
 * are metadata-only stragglers with nothing to execute.
 */
export async function fetchRemoteApprovableEdits(): Promise<SitewidePendingRow[]> {
  try {
    const { data, error } = await supabase
      .from('offline_edit_queue')
      .select('*')
      .in('status', ACTIVE_STATUSES)
      .not('payload_encrypted', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return []
    return (data || []) as unknown as SitewidePendingRow[]
  } catch {
    return []
  }
}

function rowToPendingMutation(row: SitewidePendingRow, payload: any): PendingMutation {
  return {
    id: row.client_mutation_id,
    groupId: row.group_id ?? undefined,
    seq: row.seq,
    table: row.table_name,
    action: row.action as MutationAction,
    payload,
    meta: row.meta,
    timestamp: row.created_at,
    actor: row.actor,
    attempts: row.attempts,
    lastError: row.last_error,
    status: 'pending',
  }
}

export type RemoteSyncOutcome = 'ok' | 'skipped' | 'failed' | 'no-key' | 'key-mismatch' | 'corrupt'

/**
 * Approves one edit reported by ANY device tied to this account (or, for
 * admin, any account) — decrypts the staged payload, claims it (see
 * claimMutation), executes it, and tombstones the row. This is what makes a
 * lost/replaced device recoverable: the creator (or admin) can finish
 * Approve & Sync from wherever they're logged in next, not just the
 * originating device.
 */
export async function syncRemoteMutation(row: SitewidePendingRow): Promise<{ outcome: RemoteSyncOutcome; error?: string }> {
  if (!row.payload_encrypted || !row.payload_iv) {
    return { outcome: 'failed', error: 'This edit has no staged payload to approve from here yet.' }
  }
  const decrypted = await decryptPayload<any>(row.payload_encrypted, row.payload_iv, row.payload_alg, row.client_mutation_id)
  if (!decrypted.ok) return { outcome: decrypted.reason }

  const mut = rowToPendingMutation(row, decrypted.value)
  const claim = await claimMutation(mut.id)
  if (claim === 'network-error') {
    return { outcome: 'failed', error: 'Could not reach the server to claim this edit — try again.' }
  }
  if (claim === 'taken') return { outcome: 'skipped' }

  try {
    await executeMutation(mut)
    await markStagedReport(mut.id, 'synced')
    reportSyncedForReview(mut)
    invalidateAfterSync([mut.meta.patientId])
    return { outcome: 'ok' }
  } catch (err: any) {
    const message = err?.message || String(err)
    // Release the claim on failure so a retry (from this device or another)
    // isn't blocked by our own stale claim until CLAIM_STALE_MS passes.
    await supabase
      .from('offline_edit_queue')
      .update({ status: 'failed', last_error: message, claimed_at: null, claimed_by_device: null })
      .eq('client_mutation_id', mut.id)
    return { outcome: 'failed', error: message }
  }
}

/** Approves every step of a group reported by another device, in seq order — mirrors syncGroup's blocking rules. */
export async function syncRemoteGroup(groupId: string): Promise<{ succeeded: number; failed: number }> {
  const { data, error } = await supabase
    .from('offline_edit_queue')
    .select('*')
    .eq('group_id', groupId)
    .in('status', ACTIVE_STATUSES)
    .order('seq', { ascending: true })
  if (error || !data || data.length === 0) return { succeeded: 0, failed: 0 }

  let succeeded = 0
  let failed = 0
  let blocked = false
  const patientIds: (string | null | undefined)[] = []
  for (const row of data as unknown as SitewidePendingRow[]) {
    patientIds.push(row.meta.patientId)
    if (blocked) {
      await supabase.from('offline_edit_queue').update({ status: 'blocked' }).eq('client_mutation_id', row.client_mutation_id)
      continue
    }
    const result = await syncRemoteMutation(row)
    if (result.outcome === 'ok' || result.outcome === 'skipped') succeeded++
    else {
      failed++
      blocked = true
    }
  }
  invalidateAfterSync(patientIds)
  return { succeeded, failed }
}

/** Discards an edit reported by another device — tombstones it so the originating device drops it without executing, without ever downloading/decrypting the payload here. */
export async function discardRemoteMutation(clientMutationId: string): Promise<boolean> {
  return markStagedReport(clientMutationId, 'discarded')
}

/**
 * Drops local outbox items the server already knows are terminal (synced or
 * discarded from another device) — lets a device that's been offline for a
 * while catch up without attempting to execute something someone else
 * already handled. Best-effort cleanup, not a safety mechanism — the actual
 * guard against double-execution is the claim in syncOne(). Call on mount of
 * pages that show the outbox.
 */
export async function reconcileOutboxWithServer(): Promise<void> {
  try {
    const pending = await getPendingMutations()
    if (pending.length === 0) return
    const { data, error } = await supabase
      .from('offline_edit_queue')
      .select('client_mutation_id')
      .in('client_mutation_id', pending.map((m) => m.id))
      .in('status', ['synced', 'discarded'])
    if (error || !data) return
    for (const row of data as { client_mutation_id: string }[]) {
      await removeMutation(row.client_mutation_id)
    }
  } catch (err) {
    console.warn('[OfflineSync] Could not reconcile outbox with server:', err)
  }
}

// Reporting on reconnect is NOT auto-sync: it never applies a mutation to
// any real table on its own, it only lets other devices/accounts SEE (and,
// with a decryptable payload, approve) something that's still queued — see
// the section above. A human still always presses Approve & Sync somewhere;
// that stays 100% manual.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void reportPendingToServer()
  })
}
