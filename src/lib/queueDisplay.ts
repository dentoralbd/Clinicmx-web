import type { QueueEntry, QueueSettings } from './queueApi'

/**
 * The one formatter every board surface AND the TTS announcement must use.
 * The sandbox's privacy modes only ever changed the on-screen text — the
 * TTS call site read `entry.patient_name` directly, so even "Token Only"
 * mode spoke the patient's full name aloud. Routing both text and speech
 * through this function is what closes that gap.
 */
export function formatPatientDisplay(
  entry: Pick<QueueEntry, 'patient_name' | 'serial_number'>,
  privacyMode: QueueSettings['privacy_mode']
): string {
  switch (privacyMode) {
    case 'token_only':
      return `Token #${entry.serial_number}`
    case 'masked': {
      const parts = entry.patient_name.trim().split(/\s+/)
      const last = parts[parts.length - 1] ?? ''
      const initial = last ? `${last[0].toUpperCase()}.` : ''
      const firstPart = parts.slice(0, -1).join(' ')
      return `#${entry.serial_number} · ${firstPart ? `${firstPart} ${initial}` : initial}`.trim()
    }
    case 'full':
    default:
      return `#${entry.serial_number} ${entry.patient_name}`
  }
}
