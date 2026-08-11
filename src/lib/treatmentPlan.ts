// Shared mapping between a free-text treatment plan (entered on a prescription)
// and the structured fields used by the patient's Operations/treatments table.
import type { ClinicalEntry } from './clinicalEntries'
import type { TreatmentCatalogItem } from './catalog'

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

// Finds the real Catalog procedure this treatment-plan entry's text was picked
// from (exact match — the case when the entry was chosen from the Catalog-backed
// suggestion dropdown) or most specifically mentions (longest substring match).
// Lets a prescription's Treatment Plan stay in sync with the real Catalog
// instead of only the hardcoded keyword guesses below, both for the
// treatment_type saved onto the resulting treatments row (so it matches
// exactly what TreatmentTypeSelect shows elsewhere) and for prefilling that
// row's cost from the procedure's default_fee.
export function findCatalogMatch(text: string, catalogItems?: TreatmentCatalogItem[]): TreatmentCatalogItem | undefined {
  if (!catalogItems || catalogItems.length === 0) return undefined
  const trimmed = text.trim().toLowerCase()
  if (!trimmed) return undefined
  const exact = catalogItems.find((item) => item.name.trim().toLowerCase() === trimmed)
  if (exact) return exact
  const substringMatches = catalogItems.filter((item) => trimmed.includes(item.name.trim().toLowerCase()))
  if (substringMatches.length === 0) return undefined
  return substringMatches.reduce((best, item) => (item.name.length > best.name.length ? item : best))
}

// Maps a single Treatment Plan entry to a structured treatments-table operation.
// Uses entry.teeth directly when present; falls back to the legacy "-NN" suffix
// regex for entries recovered from old plain-text records that have no teeth tagged.
// When catalogItems is provided and the entry text matches a real Catalog
// procedure, treatment_type is that procedure's exact name; otherwise falls
// back to the keyword-based guess (unchanged legacy behavior).
export function mapEntryToOperation(entry: ClinicalEntry, tooth?: number | null, catalogItems?: TreatmentCatalogItem[]) {
  const catalogMatch = findCatalogMatch(entry.text, catalogItems)
  const treatment_type = catalogMatch?.name ?? deriveTreatmentType(entry.text)
  const tooth_number = tooth ?? (entry.teeth.length > 0 ? entry.teeth[0] : null)
  return { treatment_type, tooth_number, description: entry.text }
}
