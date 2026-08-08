import { supabase } from './supabase'
import type { Json } from './database.types'
import { getAuditActor } from './appSession'
import { logActivity } from './activityLog'
import { ENTITY_TABLE_COLUMNS, sanitizeSnapshot, type TrackedEntityType } from './entityTables'
import { enqueueMutation } from './offlineSync'

export interface EditLogInput {
  entityType: TrackedEntityType
  entityId: string
  entityLabel?: string | null
  patientId?: string | null
  patientName?: string | null
  previousPayload: object
  /** Optional human-readable summary passed through to the activity log. */
  details?: string | null
  /** When this log is one step of a larger offline mutation, the shared groupId + this entry's sync position — keeps the log-before-edit order when the group syncs later. */
  offlineGroup?: { groupId: string; seq: number }
}

/**
 * Records the pre-edit snapshot of a record into edit_history. Must be
 * called and awaited BEFORE the update is applied (log-first, edit-second),
 * so every version of a record is recoverable. Only called for edits to an
 * *existing* record — first-time creation is never logged here.
 *
 * Offline (or on a genuine connectivity failure), the snapshot is queued to
 * the offline outbox instead of thrown away. A real server-side rejection is
 * NOT swallowed: it still throws so the caller aborts the edit.
 */
export async function logEdit(input: EditLogInput) {
  const payload = {
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_label: input.entityLabel ?? null,
    patient_id: input.patientId ?? null,
    patient_name: input.patientName ?? null,
    previous_payload: input.previousPayload as Json,
    edited_by: getAuditActor(),
  }

  const enqueueOffline = () =>
    enqueueMutation({
      table: 'edit_history',
      action: 'insert',
      payload,
      meta: { patientId: input.patientId, patientName: input.patientName, label: `Edit audit: ${input.entityLabel || input.entityType}` },
      groupId: input.offlineGroup?.groupId,
      seq: input.offlineGroup?.seq ?? 0,
    })

  if (!navigator.onLine) {
    await enqueueOffline()
  } else {
    try {
      const { error } = await supabase.from('edit_history').insert(payload)
      if (error) throw error
    } catch (err: any) {
      if (!navigator.onLine || err?.message === 'Failed to fetch' || err?.name === 'TypeError') {
        await enqueueOffline()
      } else {
        throw new Error(`Failed to record edit history: ${err.message}`)
      }
    }
  }

  logActivity({
    action: 'edit',
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    patientId: input.patientId,
    patientName: input.patientName,
    details: input.details,
  })
}

export interface RevertibleEditEntry {
  id: string
  entity_type: string
  entity_id: string
  previous_payload: unknown
}

/**
 * Reverts a record back to the version captured in an edit_history entry,
 * then stamps the entry as reverted (kept forever for audit — earlier
 * versions further back in history remain individually revertable).
 */
export async function revertEdit(entry: RevertibleEditEntry): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!(entry.entity_type in ENTITY_TABLE_COLUMNS)) {
    return { ok: false, reason: 'This type of record cannot be reverted.' }
  }
  const entityType = entry.entity_type as TrackedEntityType
  const target = ENTITY_TABLE_COLUMNS[entityType]

  const snapshot = entry.previous_payload
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, reason: 'The stored snapshot is incomplete, so this edit cannot be reverted automatically.' }
  }

  const row = sanitizeSnapshot(entityType, snapshot as Record<string, unknown>)
  delete row.id // never overwrite the primary key on an update

  const { data, error } = await supabase
    .from(target.table as 'patients')
    .update(row as never)
    .eq('id', entry.entity_id)
    .select('id')
  if (error) {
    return { ok: false, reason: `Revert failed: ${error.message}` }
  }
  if (!data || data.length === 0) {
    return { ok: false, reason: 'This record no longer exists — it may have been deleted. Restore it from Delete History first, then try reverting again.' }
  }

  const { error: markError } = await supabase
    .from('edit_history')
    .update({ reverted_at: new Date().toISOString() })
    .eq('id', entry.id)
  if (markError) {
    console.error('Failed to mark edit_history entry as reverted:', markError)
  }

  logActivity({ action: 'revert', entityType: entry.entity_type, entityId: entry.entity_id })

  return { ok: true }
}
