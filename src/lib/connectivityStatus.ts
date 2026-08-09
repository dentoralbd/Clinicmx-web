/**
 * Ambient "have we recently seen a real connectivity failure" signal, fed
 * exclusively by isConnectivityError() (supabaseErrors.ts) the moment it
 * actually matches a resolved fetch failure — never by navigator.onLine or
 * the browser's online/offline DOM events, which never fire on a degraded
 * mobile connection (weak signal, packet loss, timeouts): the network
 * INTERFACE stays up, so neither fires, even though real requests are
 * failing (this is exactly why the amber offline banner in Header.tsx never
 * appeared on a real flaky mobile network — its useOnlineStatus() trusted
 * those events alone).
 *
 * There's no cheap way to positively confirm "back online" without making a
 * network call, so recovery is time-based: after DECAY_MS with no further
 * observed failure, we stop treating the app as "recently offline". 20s is
 * long enough to bridge a user's next save attempt a few seconds after a
 * failed one (so the banner doesn't flicker off between retries during the
 * same degraded-network episode), short enough that a genuinely-recovered
 * connection clears within roughly one normal user action instead of leaving
 * a stale "offline" indicator up for minutes.
 */
const DECAY_MS = 20_000

export const CONNECTIVITY_CHANGED_EVENT = 'clinicmx_connectivity_changed'

let lastFailureAt = 0
let decayTimer: ReturnType<typeof setTimeout> | null = null

function dispatchChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CONNECTIVITY_CHANGED_EVENT))
  }
}

/**
 * Call the instant a real connectivity failure is observed. Records the
 * timestamp, notifies subscribers immediately, and schedules a follow-up
 * notification for exactly when the decay window elapses so an
 * event-driven (not polling) subscriber still recovers on its own without
 * needing a new failure to happen.
 */
export function markConnectivityFailureObserved(): void {
  lastFailureAt = Date.now()
  dispatchChanged()
  if (decayTimer) clearTimeout(decayTimer)
  decayTimer = setTimeout(() => {
    decayTimer = null
    dispatchChanged()
  }, DECAY_MS)
}

/** True when a real connectivity failure was observed within the decay window. */
export function isRecentlyObservedOffline(): boolean {
  return Date.now() - lastFailureAt < DECAY_MS
}
