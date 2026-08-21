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
  ['Drug History', ['drug history', 'medication history', 'on medication']],
]

export const MEDICAL_HISTORY_LABELS = MEDICAL_HISTORY_KEYWORDS.map(([label]) => label)

// The Drug History note is stored inline as its own "Drug History: <note>"
// segment, but segments are themselves split on comma/semicolon/newline — so
// any of those characters typed into the note have to be swapped for a
// lookalike full-width character before storing, and swapped back on read,
// or they'd fracture the note into stray unmatched segments.
const NOTE_COMMA = '，'
const NOTE_SEMICOLON = '；'
function escapeNote(text: string): string {
  return text.replace(/,/g, NOTE_COMMA).replace(/;/g, NOTE_SEMICOLON).replace(/\n+/g, ' ')
}
function unescapeNote(text: string): string {
  return text.split(NOTE_COMMA).join(',').split(NOTE_SEMICOLON).join(';')
}

export function getMedicalHistoryChecks(medicalHistory?: string | null) {
  const raw = (medicalHistory || '').trim()
  const segments = raw ? raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean) : []
  const checked = new Set<string>()
  const otherSegments: string[] = []
  let drugHistoryNote = ''
  for (const segment of segments) {
    const lower = segment.toLowerCase()
    if (lower.startsWith('drug history')) {
      checked.add('Drug History')
      const colonIdx = segment.indexOf(':')
      if (colonIdx !== -1) {
        drugHistoryNote = unescapeNote(segment.slice(colonIdx + 1).trim())
      }
      continue
    }
    const matched = MEDICAL_HISTORY_KEYWORDS.find(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
    if (matched) {
      checked.add(matched[0])
    } else {
      otherSegments.push(segment)
    }
  }
  const items = MEDICAL_HISTORY_KEYWORDS.map(([label]) => ({ label, checked: checked.has(label) }))
  return { items, other: otherSegments.join(', '), drugHistoryNote }
}

// Inverse of getMedicalHistoryChecks: serializes checkbox state back into the
// same comma-separated text format the parser above expects, so editing and
// printing stay losslessly round-trippable.
export function buildMedicalHistoryString(checkedLabels: string[], other: string, drugHistoryNote = ''): string {
  const segments = MEDICAL_HISTORY_LABELS.filter((label) => label !== 'Drug History' && checkedLabels.includes(label))
  if (checkedLabels.includes('Drug History')) {
    const note = escapeNote(drugHistoryNote.trim())
    segments.push(note ? `Drug History: ${note}` : 'Drug History')
  }
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
