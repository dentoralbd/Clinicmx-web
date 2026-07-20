// Keys for localStorage
export const MEMORY_KEYS = {
  COMPLAINTS: 'clinicmx_complaints',
  EXAMINATIONS: 'clinicmx_examinations',
  MEDICATIONS: 'clinicmx_medications',
  INVESTIGATIONS: 'clinicmx_investigations',
  VISIT_NOTES: 'clinicmx_visit_notes',
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
