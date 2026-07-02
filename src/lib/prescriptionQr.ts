// QR payload helpers for printed prescriptions.
// The QR encodes enough to find the patient again: patient id (UUID),
// patient code (PT-xxxxx), patient name, prescription id, and prescribed date.

export interface PrescriptionQrData {
  patientId: string
  patientName: string
  patientCode?: string
  prescriptionId: string
  prescribedDate: string
}

export interface ParsedPrescriptionQr {
  patientId?: string
  patientCode?: string
}

const PATIENT_CODE_PATTERN = /^PT-\d+$/i
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildPrescriptionQrPayload(data: PrescriptionQrData): string {
  return JSON.stringify({
    t: 'rx',
    pid: data.patientId,
    ...(data.patientCode ? { code: data.patientCode } : {}),
    name: data.patientName,
    rx: data.prescriptionId,
    d: data.prescribedDate.slice(0, 10),
  })
}

// Accepts the JSON payload above, or (as a fallback) a bare patient code /
// patient UUID scanned from some other source. Returns null if unrecognized.
export function parsePrescriptionQr(text: string): ParsedPrescriptionQr | null {
  const trimmed = text.trim()
  if (!trimmed) return null

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
