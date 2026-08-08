import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activityLog'
import { logDeletion } from '@/lib/deleteHistory'
import { autoCreateLabWorkForTreatments } from '@/lib/labWork'
import { queryClient } from '@/lib/queryClient'
import { qk } from '@/repositories/keys'
import { enqueueMutation, newGroupId } from '@/lib/offlineSync'

export interface TreatmentPlanRow {
  patient_id: string
  tooth_number: number | null
  treatment_type: string
  description: string | null
  status: string
  cost: number
  original_cost: number
  notes: string | null
  doctor_name: string | null
  doctor_share_pct: number
  treatment_plan_group_id: string
}

/**
 * Inserts a treatment plan's rows (already built by the caller via the same
 * discount math the form preview uses — see `computeTreatmentPlanDiscount`
 * in PatientProfile.tsx) online or, offline/on a connectivity failure,
 * queues them to the outbox instead. Optimistically writes the inserted
 * rows into the patient bundle cache either way so they show up instantly.
 */
export async function saveTreatmentPlan({
  patientId,
  planGroupId,
  rows,
  patientName,
}: {
  patientId: string
  planGroupId: string
  rows: TreatmentPlanRow[]
  patientName?: string | null
}): Promise<{ insertedRows: any[]; isOffline: boolean }> {
  const withIds = rows.map((r) => ({ ...r, id: crypto.randomUUID(), created_at: new Date().toISOString() }))
  const label = `Treatment plan: ${rows.map((r) => r.treatment_type).filter(Boolean).join(', ') || 'treatment'}`
  let insertedRows: any[] = withIds
  let isOffline = false

  const enqueueOffline = () =>
    enqueueMutation({
      table: 'treatments',
      action: 'insert',
      payload: withIds,
      meta: { patientId, label },
    })

  if (!navigator.onLine) {
    isOffline = true
    await enqueueOffline()
  } else {
    try {
      const { data, error } = await supabase.from('treatments').insert(withIds).select()
      if (error) throw error
      if (data && data.length > 0) insertedRows = data
    } catch (err: any) {
      if (!navigator.onLine || err?.message === 'Failed to fetch' || err?.name === 'TypeError') {
        isOffline = true
        await enqueueOffline()
      } else {
        throw err
      }
    }
  }

  queryClient.setQueryData(qk.patients.bundle(patientId), (old: any) => {
    if (!old) return old
    return { ...old, treatments: [...insertedRows, ...(old.treatments || [])] }
  })

  // Additive, fire-and-forget: auto-creates a placeholder Lab record for any
  // lab-related items in this plan. Never throws and never blocks. Offline,
  // this itself fails silently against the network — lab-record creation for
  // an offline-saved plan simply doesn't happen; the treatments still save.
  autoCreateLabWorkForTreatments({ patientId, planGroupId, rows: insertedRows })

  logActivity({
    action: 'create',
    entityType: 'treatment',
    entityLabel: rows.map((r) => r.treatment_type).filter(Boolean).join(', '),
    patientId,
    patientName: patientName || null,
    details: `${rows.length} planned item(s)${isOffline ? ' (Saved Offline)' : ''}`,
  })

  return { insertedRows, isOffline }
}

/**
 * Deletes a treatment row, audit-logging the snapshot first. Offline, the
 * audit log and the delete are queued as one group (audit at seq 0, delete
 * at seq 1) so sync preserves the log-before-delete order even though both
 * already happened locally in that order.
 */
export async function deleteTreatmentRow({
  treatment,
  patientName,
}: {
  treatment: any
  patientName?: string | null
}): Promise<{ isOffline: boolean }> {
  const groupId = newGroupId()
  const label = `Delete treatment: ${treatment.treatment_type || 'treatment'}`

  await logDeletion({
    entityType: 'treatment',
    entityId: treatment.id,
    entityLabel: treatment.treatment_type,
    patientId: treatment.patient_id,
    patientName: patientName || null,
    payload: treatment,
    offlineGroup: { groupId, seq: 0 },
  })

  let isOffline = false
  const enqueueOffline = () =>
    enqueueMutation({
      table: 'treatments',
      action: 'delete',
      payload: { id: treatment.id },
      meta: { patientId: treatment.patient_id, label },
      groupId,
      seq: 1,
    })

  if (!navigator.onLine) {
    isOffline = true
    await enqueueOffline()
  } else {
    try {
      const { error } = await supabase.from('treatments').delete().eq('id', treatment.id)
      if (error) throw error
    } catch (err: any) {
      if (!navigator.onLine || err?.message === 'Failed to fetch' || err?.name === 'TypeError') {
        isOffline = true
        await enqueueOffline()
      } else {
        throw err
      }
    }
  }

  if (treatment.patient_id) {
    queryClient.setQueryData(qk.patients.bundle(treatment.patient_id), (old: any) => {
      if (!old) return old
      return { ...old, treatments: (old.treatments || []).filter((t: any) => t.id !== treatment.id) }
    })
  }

  return { isOffline }
}
