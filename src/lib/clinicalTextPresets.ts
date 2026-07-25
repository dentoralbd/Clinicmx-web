import { MEMORY_KEYS } from './prescriptionMemory'

// Curated starter suggestions shown alongside a doctor's own remembered
// entries (from prescriptionMemory.ts) in the ClinicalSuggestInput picker
// (src/components/SuggestField.tsx). Presets only seed the dropdown — they
// are never written to memory themselves; only picking/typing a value does
// that (via rememberItem). Keep these short and generic; the doctor's own
// history quickly dominates the top of the list in normal use.

export const CHIEF_COMPLAINT_PRESETS: string[] = [
  'Toothache',
  'Sensitivity to cold/hot',
  'Bleeding gums',
  'Swelling on face',
  'Broken/fractured tooth',
  'Pain on chewing',
  'Loose tooth',
  'Bad breath',
  'Difficulty opening mouth',
]

export const ON_EXAMINATION_PRESETS: string[] = [
  'Deep caries present',
  'Periapical tenderness on percussion',
  'Gingival inflammation noted',
  'Grade I mobility',
  'Pocket depth within normal limits',
  'No visible caries',
  'Fractured restoration',
  'Localized swelling, tender on palpation',
]

export const DIAGNOSIS_PRESETS: string[] = [
  'Dental caries',
  'Irreversible pulpitis',
  'Reversible pulpitis',
  'Periapical abscess',
  'Chronic periodontitis',
  'Gingivitis',
  'Dentoalveolar trauma',
  'Impacted tooth',
]

export const TREATMENT_PLAN_PRESETS: string[] = [
  'Root canal treatment',
  'Extraction',
  'Scaling and polishing',
  'Composite restoration',
  'Crown placement',
  'Review after 1 week',
  'Refer for OPG',
]

export const VISIT_NOTES_PRESETS: string[] = [
  'Advised warm saline rinse',
  'Post-extraction instructions given',
  'Oral hygiene instructions given',
  'Review after 7 days',
  'Medications prescribed',
  'Patient advised to avoid hard food',
  'Follow-up for suture removal',
  'Smoking cessation advised',
]

export const MED_INSTRUCTIONS_PRESETS: string[] = [
  'Take after meals',
  'Complete the full course',
  'Avoid alcohol while on this medication',
  'Take with plenty of water',
  'Discontinue if rash appears',
]

export const CLINICIAN_NOTES_PRESETS: string[] = [
  'Review after 1 week',
  'Return if pain persists or worsens',
  'Follow-up X-ray advised',
  'Refer to specialist if no improvement',
]

export const TREATMENT_DESCRIPTION_PRESETS: string[] = [
  'Composite restoration',
  'Root canal treatment',
  'Extraction',
  'Scaling and polishing',
  'Crown placement',
  'Fluoride application',
]

// Maps a MEMORY_KEYS value to its preset list so call sites only need to pass
// memoryKey and ClinicalSuggestInput can look presets up itself. Keys not
// listed here (mostly non-clinical notes fields) have no seeded presets —
// their picker is populated purely from the doctor's own remembered history.
export const PRESETS_BY_MEMORY_KEY: Record<string, string[]> = {
  [MEMORY_KEYS.COMPLAINTS]: CHIEF_COMPLAINT_PRESETS,
  [MEMORY_KEYS.EXAMINATIONS]: ON_EXAMINATION_PRESETS,
  [MEMORY_KEYS.DIAGNOSIS]: DIAGNOSIS_PRESETS,
  [MEMORY_KEYS.TREATMENT_PLAN]: TREATMENT_PLAN_PRESETS,
  [MEMORY_KEYS.VISIT_NOTES]: VISIT_NOTES_PRESETS,
  [MEMORY_KEYS.MED_INSTRUCTIONS]: MED_INSTRUCTIONS_PRESETS,
  [MEMORY_KEYS.CLINICIAN_NOTES]: CLINICIAN_NOTES_PRESETS,
  [MEMORY_KEYS.TREATMENT_DESCRIPTION]: TREATMENT_DESCRIPTION_PRESETS,
}
