import { supabase } from './supabase'
import type { Json } from './database.types'
import { getAppRole } from './appSession'

export type DeletedEntityType =
  | 'patient'
  | 'treatment'
  | 'prescription'
  | 'invoice'
  | 'patient_file'
  | 'inventory_item'

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
    deleted_by: getAppRole() ?? 'doctor',
  })
  if (error) {
    throw new Error(`Failed to record delete history: ${error.message}`)
  }
}
