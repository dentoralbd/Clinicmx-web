import { supabase } from './supabase'
import type { Json } from './database.types'
import { getAuditActor } from './appSession'
import { logActivity } from './activityLog'
import { ENTITY_TABLE_COLUMNS, sanitizeSnapshot, type TrackedEntityType } from './entityTables'

export type DeletedEntityType = TrackedEntityType | 'patient_file'

export interface DeletionLogInput {
  entityType: DeletedEntityType
  entityId: string
  entityLabel?: string | null
  patientId?: string | null
  patientName?: string | null
  payload: object
}

/**
 * Records a full snapshot of a record into delete_history. Must be called and
 * awaited BEFORE the actual delete (log-first, delete-second) so nothing can
 * be deleted without a trace. Throws if the log insert fails — callers should
 * abort the deletion in that case.
 */
export async function logDeletion(input: DeletionLogInput) {
  const { error } = await supabase.from('delete_history').insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_label: input.entityLabel ?? null,
    patient_id: input.patientId ?? null,
    patient_name: input.patientName ?? null,
    payload: input.payload as Json,
    deleted_by: getAuditActor(),
  })
  if (error) {
    throw new Error(`Failed to record delete history: ${error.message}`)
  }
  logActivity({
    action: 'delete',
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    patientId: input.patientId,
    patientName: input.patientName,
  })
}

export interface RestorableEntry {
  id: string
  entity_type: string
  entity_id: string
  payload: unknown
}

export function isRestorableEntityType(entityType: string): entityType is TrackedEntityType {
  return entityType in ENTITY_TABLE_COLUMNS
}

/**
 * Re-inserts a deleted record from its delete_history snapshot back into its
 * original table, then stamps the history entry as restored (the history row
 * itself is kept forever for audit).
 *
 * Note: 'patient_file' is intentionally not restorable — the binary was
 * permanently removed from storage at delete time; restoring the DB row
 * would create a broken file card pointing at a missing object.
 */
export async function restoreDeletion(entry: RestorableEntry): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isRestorableEntityType(entry.entity_type)) {
    return { ok: false, reason: 'This type of record cannot be restored. Deleted files are removed permanently from storage.' }
  }
  const target = ENTITY_TABLE_COLUMNS[entry.entity_type]

  const snapshot = entry.payload
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, reason: 'The stored snapshot is incomplete, so this record cannot be restored automatically.' }
  }

  const row = sanitizeSnapshot(entry.entity_type, snapshot as Record<string, unknown>)
  if (!row.id) {
    return { ok: false, reason: 'The stored snapshot is missing its ID, so this record cannot be restored automatically.' }
  }

  const { error } = await supabase.from(target.table as 'patients').insert(row as never)
  if (error) {
    if (error.code === '23505') {
      return { ok: false, reason: 'This record already exists — it may have been restored already.' }
    }
    if (error.code === '23503') {
      return { ok: false, reason: 'A related record no longer exists (e.g. its patient is still deleted). Restore the patient first, then try again.' }
    }
    return { ok: false, reason: `Restore failed: ${error.message}` }
  }

  const { error: markError } = await supabase
    .from('delete_history')
    .update({ restored_at: new Date().toISOString() })
    .eq('id', entry.id)
  if (markError) {
    // The record itself was restored; only the audit stamp failed. Surface
    // nothing fatal — the entry will simply still show a Restore button.
    console.error('Failed to mark delete_history entry as restored:', markError)
  }

  logActivity({ action: 'restore', entityType: entry.entity_type, entityId: entry.entity_id })

  return { ok: true }
}
