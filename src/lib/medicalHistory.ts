// Shared keyword mapping between the patient medical_history free-text column
// and the fixed checkbox list shown on the printed prescription / profile UI.
export const MEDICAL_HISTORY_KEYWORDS: Array<[string, string[]]> = [
  ['HTN', ['htn', 'bp', 'hypertension', 'blood pressure']],
  ['Heart Disease', ['heart', 'cardiac']],
  ['Diabetic', ['diabet']],
  ['Hepatitis', ['hepatitis', 'hep b', 'hep c']],
  ['Bleeding disorder', ['bleed']],
  ['Allergy', ['allerg']],
  ['Pregnant/Lactating mother', ['pregnan', 'lactat']],
  ['Kidney disease', ['kidney', 'renal']],
]

export const MEDICAL_HISTORY_LABELS = MEDICAL_HISTORY_KEYWORDS.map(([label]) => label)

export function getMedicalHistoryChecks(medicalHistory?: string | null) {
  const raw = (medicalHistory || '').trim()
  const segments = raw ? raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean) : []
  const checked = new Set<string>()
  const otherSegments: string[] = []
  for (const segment of segments) {
    const lower = segment.toLowerCase()
    const matched = MEDICAL_HISTORY_KEYWORDS.find(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
    if (matched) {
      checked.add(matched[0])
    } else {
      otherSegments.push(segment)
    }
  }
  const items = MEDICAL_HISTORY_KEYWORDS.map(([label]) => ({ label, checked: checked.has(label) }))
  return { items, other: otherSegments.join(', ') }
}

// Inverse of getMedicalHistoryChecks: serializes checkbox state back into the
// same comma-separated text format the parser above expects, so editing and
// printing stay losslessly round-trippable.
export function buildMedicalHistoryString(checkedLabels: string[], other: string): string {
  const segments = MEDICAL_HISTORY_LABELS.filter((label) => checkedLabels.includes(label))
  const trimmedOther = other.trim()
  if (trimmedOther) {
    // Stored as a plain segment (no "Other:" prefix) — getMedicalHistoryChecks
    // already buckets any unmatched segment into `other`, and the UI adds the
    // "Other:" label itself when displaying. Prefixing here would double up
    // ("Other: Other: ...") after a save → reload round-trip.
    segments.push(trimmedOther)
  }
  return segments.join(', ')
}
