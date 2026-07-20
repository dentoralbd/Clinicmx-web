import { supabase } from './supabase'

// Lab work tracking: crowns, bridges, dentures, ortho appliances and other
// prosthetics sent out to a dental laboratory. This tracks what the CLINIC
// OWES THE LAB (accounts payable) — it is intentionally separate from patient
// invoicing (see supabase/migrations/030_lab_work.sql).

export const LAB_WORK_TYPES = [
  'Crown',
  'Bridge',
  'Denture',
  'Ortho Appliance',
  'Veneer',
  'Inlay/Onlay',
  'Implant Prosthesis',
  'Post & Core',
  'Splint/Night Guard',
  'Other',
] as const
export type LabWorkType = (typeof LAB_WORK_TYPES)[number]

export const LAB_STATUSES = ['Pending', 'Sent', 'Received', 'Delivered', 'Cancelled'] as const
export type LabStatus = (typeof LAB_STATUSES)[number]

/** Advance-one-step map, mirroring STATUS_TRANSITIONS in Treatments.tsx. */
export const LAB_STATUS_TRANSITIONS: Record<string, string> = {
  Pending: 'Sent',
  Sent: 'Received',
  Received: 'Delivered',
}

export interface LabWorkRecord {
  id: string
  patient_id: string
  lab_name: string
  work_type: string
  teeth: number[]
  unit_count: number
  shade: string | null
  material: string | null
  pricing_mode: 'per_unit' | 'flat'
  unit_price: number
  flat_price: number
  status: string
  date_sent: string | null
  expected_date: string | null
  date_received: string | null
  is_paid: boolean
  notes: string | null
  source_plan_group_id: string | null
  source_treatment_id: string | null
  created_at: string
  updated_at: string
  patients: {
    first_name: string
    last_name: string
    date_of_birth?: string | null
  }
}

/** Normalizes the JSONB teeth column into number[] (tolerates null / bad data). */
export function parseTeeth(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((n): n is number => typeof n === 'number').sort((a, b) => a - b)
}

/** Single source of truth for what a lab record costs the clinic. */
export function labWorkTotal(row: Pick<LabWorkRecord, 'pricing_mode' | 'unit_price' | 'unit_count' | 'flat_price'>): number {
  return row.pricing_mode === 'flat'
    ? Number(row.flat_price) || 0
    : (Number(row.unit_price) || 0) * (Number(row.unit_count) || 0)
}

/** Page-level roll-up. Cancelled records are excluded from every figure. */
export function sumLabTotals(rows: LabWorkRecord[]): { total: number; paid: number; due: number } {
  let total = 0
  let paid = 0
  for (const row of rows) {
    if (row.status === 'Cancelled') continue
    const rowTotal = labWorkTotal(row)
    total += rowTotal
    if (row.is_paid) paid += rowTotal
  }
  return { total, paid, due: total - paid }
}

/**
 * Keyword -> canonical lab work type. Order matters: more specific patterns
 * are listed before looser ones (e.g. "post and core" before "crown").
 * Matched against treatment_type strings, including free-text-derived ones
 * from the Add Visit flow (mapEntryToOperation), so this is regex-based
 * rather than an exact-match set.
 */
const LAB_TYPE_KEYWORDS: Array<[RegExp, LabWorkType]> = [
  [/post\s*(and|&)\s*core/i, 'Post & Core'],
  [/inlay|onlay/i, 'Inlay/Onlay'],
  [/veneer|laminate/i, 'Veneer'],
  [/night\s*guard|occlusal\s*(guard|splint)|splint/i, 'Splint/Night Guard'],
  [/denture|partial\s*plate/i, 'Denture'],
  [/brace|ortho|aligner|retainer|expander/i, 'Ortho Appliance'],
  [/bridge|pontic/i, 'Bridge'],
  [/crown|\bcap\b/i, 'Crown'],
  [/implant/i, 'Implant Prosthesis'],
]

/** Returns the matching lab work type for a treatment_type string, or null if it's not lab-related. */
export function matchLabWorkType(treatmentType: string | null | undefined): LabWorkType | null {
  if (!treatmentType) return null
  for (const [pattern, workType] of LAB_TYPE_KEYWORDS) {
    if (pattern.test(treatmentType)) return workType
  }
  return null
}

export interface AutoCreateTreatmentRow {
  id?: string
  treatment_type: string
  tooth_number: number | null
}

export interface AutoCreateLabWorkInput {
  patientId: string
  /** treatments.treatment_plan_group_id when the flow has one; null otherwise
   *  (a fresh UUID is generated so each submission still stays independently unique). */
  planGroupId: string | null
  rows: AutoCreateTreatmentRow[]
}

/**
 * Creates lab_work rows for any lab-related treatments that were just saved
 * (Crown, Bridge, Denture, Ortho Appliance, etc.), grouped one record per
 * (plan group x work type) — a "Crown on 11, 12, 21" plan becomes a single
 * 3-unit lab case rather than three separate rows.
 *
 * FIRE-AND-FORGET and FAILURE-ISOLATED: the treatments are already committed
 * by the time this runs, so this must never throw, block, or surface an error
 * to the user (same contract as logActivity in activityLog.ts). Callers must
 * not await it.
 *
 * Idempotent via the lab_work_source_dedup unique constraint on
 * (source_plan_group_id, work_type) — re-running for the same plan group and
 * work type is a no-op, so a double-submit cannot create duplicate lab cases.
 * Rows created by hand have a NULL source_plan_group_id, which Postgres
 * treats as distinct in a unique index, so they never collide with this.
 */
export function autoCreateLabWorkForTreatments(input: AutoCreateLabWorkInput): void {
  try {
    const groupId = input.planGroupId ?? crypto.randomUUID()
    const buckets = new Map<LabWorkType, { teeth: Set<number>; sourceId: string | null }>()

    for (const row of input.rows) {
      const workType = matchLabWorkType(row.treatment_type)
      if (!workType) continue
      const bucket = buckets.get(workType) ?? { teeth: new Set<number>(), sourceId: row.id ?? null }
      if (row.tooth_number != null) bucket.teeth.add(row.tooth_number)
      if (!bucket.sourceId && row.id) bucket.sourceId = row.id
      buckets.set(workType, bucket)
    }
    if (buckets.size === 0) return

    const payload = Array.from(buckets.entries()).map(([workType, bucket]) => {
      const teeth = Array.from(bucket.teeth).sort((a, b) => a - b)
      return {
        patient_id: input.patientId,
        work_type: workType,
        teeth,
        // Units default to the tooth count; an appliance covering many teeth
        // is corrected by the user on the Lab page (e.g. down to 1).
        unit_count: teeth.length,
        status: 'Pending',
        source_plan_group_id: groupId,
        source_treatment_id: bucket.sourceId,
      }
    })

    void supabase
      .from('lab_work')
      .upsert(payload, { onConflict: 'source_plan_group_id,work_type', ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) console.warn('lab_work auto-create failed:', error.message)
      })
  } catch (err) {
    console.warn('lab_work auto-create failed:', err)
  }
}
