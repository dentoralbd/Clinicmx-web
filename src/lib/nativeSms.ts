/**
 * Bridge to the SMS-inbox reader injected by Clinicmx-web-apk's MainActivity.java
 * (window.AndroidNative — the same custom addJavascriptInterface bridge already used
 * there for window.print()/navigator.share(), not a Capacitor plugin; this app doesn't
 * use Capacitor's plugin system for any native bridge). Absent everywhere else (regular
 * browsers, desktop) — every export here is a safe no-op there.
 */

export interface NativeSmsMessage {
  sender: string | null
  body: string
  timestampMs: number
}

interface AndroidNativeSmsBridge {
  hasSmsPermission?: () => boolean
  requestSmsPermission?: () => void
  readSmsSince?: (sinceMillis: number) => string
}

function getBridge(): AndroidNativeSmsBridge | null {
  const bridge = (window as unknown as { AndroidNative?: AndroidNativeSmsBridge }).AndroidNative
  return bridge && typeof bridge.readSmsSince === 'function' ? bridge : null
}

export function isNativeSmsAvailable(): boolean {
  return getBridge() !== null
}

export function hasSmsPermission(): boolean {
  const bridge = getBridge()
  if (!bridge?.hasSmsPermission) return false
  try {
    return !!bridge.hasSmsPermission()
  } catch {
    return false
  }
}

/** Fire-and-forget — shows the OS permission dialog. Callers re-check hasSmsPermission() afterward; there's no result callback wired up (see MainActivity's requestSmsPermission() comment). */
export function requestSmsPermission(): void {
  try {
    getBridge()?.requestSmsPermission?.()
  } catch {
    // Nothing to recover — the caller's own re-check handles a still-ungranted permission.
  }
}

export function readRecentSms(sinceMillis: number): NativeSmsMessage[] {
  const bridge = getBridge()
  if (!bridge?.readSmsSince) return []
  try {
    const raw = bridge.readSmsSince(sinceMillis)
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
