// Keys for localStorage
export const MEMORY_KEYS = {
  COMPLAINTS: 'clinicmx_complaints',
  EXAMINATIONS: 'clinicmx_examinations',
  MEDICATIONS: 'clinicmx_medications',
  INVESTIGATIONS: 'clinicmx_investigations',
  VISIT_NOTES: 'clinicmx_visit_notes',
  DIAGNOSIS: 'clinicmx_diagnosis',
  TREATMENT_PLAN: 'clinicmx_treatment_plan',
  MED_INSTRUCTIONS: 'clinicmx_med_instructions',
  INVESTIGATION_NOTES: 'clinicmx_investigation_notes',
  CLINICIAN_NOTES: 'clinicmx_clinician_notes',
  TREATMENT_DESCRIPTION: 'clinicmx_treatment_description',
  TREATMENT_NOTES: 'clinicmx_treatment_notes',
  APPOINTMENT_NOTES: 'clinicmx_appointment_notes',
  PAYMENT_NOTES: 'clinicmx_payment_notes',
  INVOICE_NOTES: 'clinicmx_invoice_notes',
  INVENTORY_DESCRIPTION: 'clinicmx_inventory_description',
  INVENTORY_NOTES: 'clinicmx_inventory_notes',
  LAB_NOTES: 'clinicmx_lab_notes',
  PATIENT_NOTES: 'clinicmx_patient_notes',
  CONSULTATION_NOTES: 'clinicmx_consultation_notes',
}

// Save a string value to memory (max 30, deduplicated by lowercase trim)
export function rememberItem(key: string, value: string): void {
  if (!value?.trim()) return
  try {
    const existing = getMemory(key)
    const deduped = existing.filter(
      (v) => v.toLowerCase() !== value.trim().toLowerCase()
    )
    const updated = [value.trim(), ...deduped].slice(0, 30)
    localStorage.setItem(key, JSON.stringify(updated))
  } catch {
    // localStorage unavailable – silently skip
  }
}

// Get all remembered items for a key
export function getMemory(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Clear a specific memory
export function clearMemory(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// Remove a single remembered item (case-insensitive trimmed match), used by
// the "Recent Written History" × delete control.
export function removeMemoryItem(key: string, value: string): void {
  try {
    const existing = getMemory(key)
    const target = value.trim().toLowerCase()
    const updated = existing.filter((v) => v.toLowerCase() !== target)
    localStorage.setItem(key, JSON.stringify(updated))
  } catch {
    // localStorage unavailable – silently skip
  }
}
