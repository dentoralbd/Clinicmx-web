import { supabase } from '@/lib/supabase'
import { getAppUser } from '@/lib/appSession'
import { treatmentTypeToConditionLabel } from '@/lib/toothConditions'

// Auto-sync a tooth-linked treatment onto the Anatomic Odontogram. When a treatment for a
// specific tooth reaches "In Progress" or "Completed", the tooth's chart condition is updated
// to reflect the procedure (e.g. a completed Root Canal marks the tooth root_canal), and a
// dated row is appended to dental_record_history so it appears on the timeline.
//
// Persistence is "untagged" (user decision 2026-09-04): rows aren't linked to the treatment id,
// and idempotency is by comparing the tooth's current condition to the target — so re-saving or
// the In Progress -> Completed transition (both map to the same condition) never duplicates.
// Fire-and-forget and failure-isolated: a failure here must never block/rollback the treatment
// status change (mirrors the labWork.ts auto-create pattern).

const SYNCED_STATUSES = new Set(['In Progress', 'Completed'])

export interface ToothSyncInput {
  patientId: string
  toothNumber: number | null | undefined
  treatmentType: string | null | undefined
  status: string
}

/**
 * Returns true if the chart was actually changed (so the caller can refresh its view).
 * Returns false for no-op cases (no tooth, unmapped type, non-syncing status, already synced).
 */
export async function syncToothChartFromTreatment({
  patientId,
  toothNumber,
  treatmentType,
  status,
}: ToothSyncInput): Promise<boolean> {
  if (!patientId || toothNumber == null) return false
  if (!SYNCED_STATUSES.has(status)) return false
  const targetLabel = treatmentTypeToConditionLabel(treatmentType)
  if (!targetLabel) return false

  try {
    const { data: existing } = await supabase
      .from('dental_records')
      .select('id, condition')
      .eq('patient_id', patientId)
      .eq('tooth_number', toothNumber)
      .maybeSingle()

    if (existing?.condition === targetLabel) return false // already reflects this procedure

    const note = `Auto-synced from treatment: ${treatmentType}`

    if (existing) {
      const { error } = await supabase
        .from('dental_records')
        .update({ condition: targetLabel, notes: note, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('dental_records')
        .insert([{ patient_id: patientId, tooth_number: toothNumber, condition: targetLabel, notes: note }])
      if (error) throw error
    }

    const { error: histErr } = await supabase.from('dental_record_history').insert([
      {
        patient_id: patientId,
        tooth_number: toothNumber,
        condition: targetLabel,
        notes: note,
        procedure_date: new Date().toISOString().split('T')[0],
        doctor_name: getAppUser()?.name || null,
      },
    ])
    if (histErr) throw histErr

    return true
  } catch (e) {
    console.error('[toothChartSync] failed to sync tooth', toothNumber, 'from treatment', treatmentType, e)
    return false
  }
}

/** Runs the sync for several treatments; resolves true if any of them changed the chart. */
export async function syncToothChartFromTreatments(inputs: ToothSyncInput[]): Promise<boolean> {
  const results = await Promise.all(inputs.map((i) => syncToothChartFromTreatment(i)))
  return results.some(Boolean)
}
