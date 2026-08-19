// QR payload helpers for printed prescriptions.
// The QR is a clinic-website URL carrying the patient id (UUID) and patient
// code (PT-xxxxx) in its fragment, so a patient scanning it with a phone
// camera just opens the clinic site while the in-app scanners still resolve
// the patient. The fragment is used rather than a query string because
// browsers never send it to the server, so the ids stay out of web logs.

const CLINIC_SITE_URL = 'https://www.dentoralbd.com/'

export interface PrescriptionQrData {
  patientId: string
  patientCode?: string
}

export interface ParsedPrescriptionQr {
  patientId?: string
  patientCode?: string
}

// PT- (full patients) or CO- (consultation-only, see migration 034)
const PATIENT_CODE_PATTERN = /^(PT|CO)-\d+$/i
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildPrescriptionQrPayload(data: PrescriptionQrData): string {
  const fragment = new URLSearchParams()
  fragment.set('pid', data.patientId)
  if (data.patientCode) fragment.set('code', data.patientCode)
  return `${CLINIC_SITE_URL}#${fragment.toString()}`
}

// Accepts the clinic-site URL above, the older raw-JSON payload (already
// printed on prescriptions from before this format changed), or (as a
// fallback) a bare patient code / patient UUID scanned from some other
// source. Returns null if unrecognized.
export function parsePrescriptionQr(text: string): ParsedPrescriptionQr | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
      const rawPid = fragment.get('pid')?.trim()
      const rawCode = fragment.get('code')?.trim()
      const patientId = rawPid && UUID_PATTERN.test(rawPid) ? rawPid : undefined
      const patientCode = rawCode && PATIENT_CODE_PATTERN.test(rawCode) ? rawCode.toUpperCase() : undefined
      if (patientId || patientCode) return { patientId, patientCode }
    } catch {
      // not a valid URL — fall through to the other formats
    }
    return null
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') {
        const patientId =
          typeof parsed.pid === 'string' && UUID_PATTERN.test(parsed.pid.trim())
            ? parsed.pid.trim()
            : undefined
        const patientCode =
          typeof parsed.code === 'string' && PATIENT_CODE_PATTERN.test(parsed.code.trim())
            ? parsed.code.trim().toUpperCase()
            : undefined
        if (patientId || patientCode) return { patientId, patientCode }
      }
    } catch {
      // not valid JSON — fall through to plain-text formats
    }
    return null
  }

  if (PATIENT_CODE_PATTERN.test(trimmed)) return { patientCode: trimmed.toUpperCase() }
  if (UUID_PATTERN.test(trimmed)) return { patientId: trimmed }
  return null
}
