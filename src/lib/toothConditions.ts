import type { ToothCondition } from '@/types/dentalChart'

// The dental_records / dental_record_history tables store a human-readable condition LABEL
// (as they always have: "Healthy", "Cavity", ...). The Anatomic Odontogram works in AGY's
// canonical ToothCondition codes. These maps bridge the two without rewriting existing rows —
// legacy "Cavity" reads as `decayed`; new saves write the expanded label set below.

const LABEL_TO_CONDITION: Record<string, ToothCondition> = {
  Healthy: 'healthy',
  Cavity: 'decayed', // legacy label kept as an alias
  Decayed: 'decayed',
  Filled: 'filled',
  'Root Canal': 'root_canal',
  Crown: 'crown',
  Bridge: 'bridge',
  Missing: 'missing',
  Implant: 'implant',
  Extracted: 'extracted',
  Impacted: 'impacted',
}

/** All chart conditions, in the order shown in pickers/legends. */
export const ALL_TOOTH_CONDITIONS: ToothCondition[] = [
  'healthy', 'decayed', 'filled', 'root_canal', 'crown', 'bridge', 'implant', 'missing', 'extracted', 'impacted',
]

const CONDITION_TO_LABEL: Record<ToothCondition, string> = {
  healthy: 'Healthy',
  decayed: 'Decayed',
  filled: 'Filled',
  root_canal: 'Root Canal',
  crown: 'Crown',
  bridge: 'Bridge',
  missing: 'Missing',
  implant: 'Implant',
  extracted: 'Extracted',
  impacted: 'Impacted',
}

export function labelToCondition(label: string | null | undefined): ToothCondition {
  if (!label) return 'healthy'
  return LABEL_TO_CONDITION[label] ?? 'healthy'
}

export function conditionToLabel(condition: ToothCondition): string {
  return CONDITION_TO_LABEL[condition] ?? 'Healthy'
}

// Clinical phrasing for a condition when it is written into a prescription's "On Examination"
// field (via the "Add from odontogram" toggle). `null` = don't surface it there (healthy teeth).
const CONDITION_TO_EXAM_PHRASE: Record<ToothCondition, string | null> = {
  healthy: null,
  decayed: 'Caries',
  filled: 'Filling',
  root_canal: 'Root canal treated',
  crown: 'Crown',
  bridge: 'Bridge',
  implant: 'Implant',
  missing: 'Missing tooth',
  extracted: 'Extracted',
  impacted: 'Impacted',
}

// Stable display order so the generated On Examination entries always come out the same way.
const EXAM_CONDITION_ORDER: ToothCondition[] = [
  'decayed', 'filled', 'root_canal', 'crown', 'bridge', 'implant', 'impacted', 'missing', 'extracted',
]

/**
 * Groups a patient's dental_records rows into "On Examination" entries — one per condition,
 * phrased clinically, with the involved teeth. Legacy labels ("Cavity") normalise through
 * labelToCondition. Healthy / unrecognised rows are skipped.
 */
export function buildExaminationEntriesFromDentalRecords(
  records: { tooth_number: number; condition: string | null }[]
): { text: string; teeth: number[] }[] {
  const byCondition = new Map<ToothCondition, number[]>()
  for (const r of records) {
    const cond = labelToCondition(r.condition)
    if (!CONDITION_TO_EXAM_PHRASE[cond]) continue // healthy / no phrase
    if (typeof r.tooth_number !== 'number') continue
    const list = byCondition.get(cond) ?? []
    if (!list.includes(r.tooth_number)) list.push(r.tooth_number)
    byCondition.set(cond, list)
  }
  return EXAM_CONDITION_ORDER.filter((c) => byCondition.has(c)).map((c) => ({
    text: CONDITION_TO_EXAM_PHRASE[c] as string,
    teeth: (byCondition.get(c) as number[]).slice().sort((a, b) => a - b),
  }))
}

// Keyword → resulting chart condition label, used to auto-sync the tooth chart when a
// tooth-linked treatment goes In Progress / Completed. Order matters (most specific first).
// treatment_type is free-text / catalog-driven, so we match on substrings. A type with no
// clear tooth-state outcome (scaling, cleaning, whitening, consultation, checkup, x-ray…)
// returns null and leaves the tooth unchanged.
const TREATMENT_KEYWORD_CONDITIONS: [RegExp, string][] = [
  [/root\s*canal|\brct\b|endodont/i, 'Root Canal'],
  [/extract|exodont/i, 'Extracted'],
  [/implant/i, 'Implant'],
  [/bridge|\bfpd\b|abutment/i, 'Bridge'],
  [/crown|\bcap\b|onlay|inlay/i, 'Crown'],
  [/fill|restor|composite|amalgam|\bgic\b|glass\s*ionomer|sealant/i, 'Filled'],
]

export function treatmentTypeToConditionLabel(treatmentType: string | null | undefined): string | null {
  if (!treatmentType) return null
  for (const [re, label] of TREATMENT_KEYWORD_CONDITIONS) {
    if (re.test(treatmentType)) return label
  }
  return null
}
