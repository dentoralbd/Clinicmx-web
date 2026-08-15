import type { QueueEntry, QueueSettings } from './queueApi'

/**
 * The on-screen formatter — includes the "#N" serial prefix, which is
 * correct for a visual board (a token badge next to a name is normal).
 * Do NOT pass this into the TTS announcement: `announcePatientCall()`
 * already speaks the serial number in words via its own `serialNumber`
 * param ("টোকেন নম্বর ১"), so a "#N"-prefixed string handed to it as the
 * name gets read again, literally, as "hash one" — the number announced
 * twice, once in words and once as a mispronounced symbol (found live,
 * 2026-08-15). Use formatSpokenName() for anything that gets spoken.
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

/**
 * The spoken counterpart to formatPatientDisplay() — same privacy modes,
 * but never includes the "#N" serial prefix, since announcePatientCall()
 * speaks the serial separately, in words. token_only mode returns '' (no
 * name at all is said, just the token number) rather than the literal
 * string "Token #N" a TTS engine would otherwise mangle.
 */
export function formatSpokenName(
  entry: Pick<QueueEntry, 'patient_name'>,
  privacyMode: QueueSettings['privacy_mode']
): string {
  switch (privacyMode) {
    case 'token_only':
      return ''
    case 'masked': {
      const parts = entry.patient_name.trim().split(/\s+/)
      const last = parts[parts.length - 1] ?? ''
      const initial = last ? `${last[0].toUpperCase()}.` : ''
      const firstPart = parts.slice(0, -1).join(' ')
      return (firstPart ? `${firstPart} ${initial}` : initial).trim()
    }
    case 'full':
    default:
      return entry.patient_name
  }
}
