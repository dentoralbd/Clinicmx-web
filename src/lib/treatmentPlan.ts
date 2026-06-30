// Shared mapping between a free-text treatment plan (entered on a prescription)
// and the structured fields used by the patient's Operations/treatments table.
import type { ClinicalEntry } from './clinicalEntries'

const TREATMENT_TYPE_KEYWORDS: Array<[string, string[]]> = [
  ['Root Canal', ['rct', 'root canal']],
  ['Crown', ['crown', 'cap']],
  ['Bridge', ['bridge']],
  ['Extraction', ['extraction', 'ext']],
  ['Implant', ['implant']],
  ['Cleaning', ['cleaning', 'scaling']],
  ['Whitening', ['whitening', 'bleaching']],
  ['Braces', ['braces', 'ortho']],
  ['Dentures', ['denture']],
  ['Veneer', ['veneer']],
  ['Consultation', ['consultation', 'consult']],
  ['Filling', ['filling', 'restoration']],
]

export function mapTreatmentPlanToOperation(treatmentPlan: string) {
  const text = treatmentPlan.toLowerCase()
  const match = TREATMENT_TYPE_KEYWORDS.find(([, keywords]) =>
    keywords.some((kw) => text.includes(kw))
  )
  const treatment_type = match ? match[0] : 'Other'
  const toothMatch = treatmentPlan.match(/-\s*(\d{2})\s*$/)
  const tooth_number = toothMatch ? parseInt(toothMatch[1], 10) : null
  return { treatment_type, tooth_number, description: treatmentPlan }
}

function deriveTreatmentType(text: string) {
  const lower = text.toLowerCase()
  const match = TREATMENT_TYPE_KEYWORDS.find(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
  return match ? match[0] : 'Other'
}

// Maps a single Treatment Plan entry to a structured treatments-table operation.
// Uses entry.teeth directly when present; falls back to the legacy "-NN" suffix
// regex for entries recovered from old plain-text records that have no teeth tagged.
export function mapEntryToOperation(entry: ClinicalEntry, tooth?: number | null) {
  const treatment_type = deriveTreatmentType(entry.text)
  const tooth_number = tooth ?? (entry.teeth.length > 0 ? entry.teeth[0] : null)
  return { treatment_type, tooth_number, description: entry.text }
}
