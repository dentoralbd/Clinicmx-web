/**
 * postgrest-js (2.x, verified against the installed 2.108.2) does NOT reject
 * when the underlying fetch fails — it catches the rejection and RESOLVES
 * with `{ data: null, count: null, status: 0, statusText: '', error: {
 * message: `${name ?? 'FetchError'}: ${message}`, details, hint, code: '' }
 * }` (see node_modules/@supabase/postgrest-js/dist/index.mjs, the
 * `res.catch(...)` wrapping the request). Three consequences that broke the
 * offline-detection predicate this module replaces (previously duplicated
 * across treatmentsRepo.ts, deleteHistory.ts, editHistory.ts, payments.ts):
 *
 *   1. `error.message` is PREFIXED — "TypeError: Failed to fetch", never the
 *      bare "Failed to fetch" an old `===` comparison tested for.
 *   2. `error.name` is undefined — the resolved object is a plain literal,
 *      not an Error, so an `err?.name === 'TypeError'` test never fires.
 *   3. `status === 0` is the one unambiguous machine-readable signal.
 *
 * The old predicate therefore only ever passed via `!navigator.onLine`,
 * which lies on captive-portal wifi, flaky clinic wifi, and notably the
 * Capacitor Android WebView this app also ships as (its `server.url` points
 * straight at the live deployment — see CLAUDE.md).
 */

// Engine-specific wordings for "the request never reached a server":
// Chromium/Android WebView "Failed to fetch"; Firefox "NetworkError when
// attempting to fetch resource."; Safari/iOS "Load failed"; React Native/some
// WebViews "Network request failed"; Chromium net-stack codes that can
// surface verbatim in the error text.
const NETWORK_MESSAGE_RE =
  /failed to fetch|networkerror|network request failed|load failed|err_(internet_disconnected|network_changed|name_not_resolved|connection_[a-z_]+)/i

/**
 * True when this Supabase/PostgREST failure means "the request never
 * reached the server", as opposed to a real server-side rejection (RLS
 * denial, constraint violation, missing column) that must NOT be swallowed
 * into the offline outbox. Accepts either the resolved `error` object or a
 * thrown value; pass the response's `status` when available — it's the
 * strongest signal.
 */
export function isConnectivityError(error: unknown, status?: number | null): boolean {
  const e = (error ?? {}) as { message?: string; details?: string; hint?: string; status?: number }
  const text = [e.message, e.details, e.hint].filter(Boolean).join(' ')
  // postgrest-js also resolves an aborted/timed-out request with status 0,
  // but tags it in `hint`. An abort is not "we are offline" — don't queue it.
  if (/aborterror|request was aborted/i.test(text)) return false
  if ((status ?? e.status) === 0) return true
  if (!error) return false
  return NETWORK_MESSAGE_RE.test(text)
}

/**
 * The predicate every offline-capable write path should branch on: queue to
 * the outbox when the browser says it's offline OR the failure is a
 * connectivity failure regardless of what navigator.onLine claims.
 */
export function isOfflineFailure(error?: unknown, status?: number | null): boolean {
  return !navigator.onLine || isConnectivityError(error, status)
}
