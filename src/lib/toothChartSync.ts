import { supabase } from '@/lib/supabase'
import { getAppUser } from '@/lib/appSession'
import { treatmentTypeToConditionLabel, conditionToLabel } from '@/lib/toothConditions'
import type { ToothCondition } from '@/types/dentalChart'

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

// Sentinel stored in treatment_catalog_items.chart_condition to mean "explicitly make no chart
// change" (suppresses the keyword fallback), vs NULL which means "auto-guess from the name".
const NO_CHANGE = '__none__'

/** name(lowercased) -> chart_condition (a ToothCondition code, or the NO_CHANGE sentinel). */
type CatalogConditionMap = Map<string, string>

async function fetchCatalogConditionMap(): Promise<CatalogConditionMap> {
  const map: CatalogConditionMap = new Map()
  try {
    const { data } = await supabase.from('treatment_catalog_items').select('name, chart_condition')
    for (const row of data || []) {
      if (row?.name && row.chart_condition) map.set(String(row.name).trim().toLowerCase(), row.chart_condition)
    }
  } catch (e) {
    console.error('[toothChartSync] failed to load catalog condition map; falling back to keywords', e)
  }
  return map
}

/**
 * Resolves the target dental_records condition LABEL for a treatment type:
 * 1. an explicit mapping on the matching catalog item (Catalog → Procedures) wins;
 * 2. the NO_CHANGE sentinel returns null (no chart change, keyword fallback suppressed);
 * 3. otherwise fall back to the keyword map (treatmentTypeToConditionLabel).
 */
function resolveTargetLabel(treatmentType: string | null | undefined, catalogMap: CatalogConditionMap): string | null {
  const key = (treatmentType || '').trim().toLowerCase()
  const catalogValue = key ? catalogMap.get(key) : undefined
  if (catalogValue === NO_CHANGE) return null
  if (catalogValue) return conditionToLabel(catalogValue as ToothCondition)
  return treatmentTypeToConditionLabel(treatmentType)
}

export interface ToothSyncInput {
  patientId: string
  toothNumber: number | null | undefined
  treatmentType: string | null | undefined
  status: string
}

/**
 * Returns true if the chart was actually changed (so the caller can refresh its view).
 * Returns false for no-op cases (no tooth, unmapped type, non-syncing status, already synced).
 * Pass a preloaded `catalogMap` when syncing several treatments to avoid refetching it each time.
 */
export async function syncToothChartFromTreatment(
  { patientId, toothNumber, treatmentType, status }: ToothSyncInput,
  catalogMap?: CatalogConditionMap
): Promise<boolean> {
  if (!patientId || toothNumber == null) return false
  if (!SYNCED_STATUSES.has(status)) return false
  const map = catalogMap ?? (await fetchCatalogConditionMap())
  const targetLabel = resolveTargetLabel(treatmentType, map)
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
  const catalogMap = await fetchCatalogConditionMap()
  const results = await Promise.all(inputs.map((i) => syncToothChartFromTreatment(i, catalogMap)))
  return results.some(Boolean)
}
