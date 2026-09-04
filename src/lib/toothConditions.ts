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
