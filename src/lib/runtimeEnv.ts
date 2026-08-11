// Detects when the app is running inside the Tauri v2 Windows desktop wrapper
// (src-tauri, packaged as ClinicMx.exe) rather than a regular browser tab or
// the Capacitor Android APK.
//
// Why not check window.location.hostname === 'tauri.localhost'? Tauri exposes
// a global on the window as soon as the JS runtime boots, before any
// navigation-dependent value is reliable, and it's true in both `tauri dev`
// (which loads http://localhost:5173, indistinguishable by hostname from a
// plain browser dev session) and a packaged build. See Login.tsx's existing
// hostname-based check for the kind of false negative that approach caused.

export const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// The exe bundles a static dist/ build and has no Cloudflare Pages Functions
// behind it, so every relative /api/* call must instead go to the deployed
// site. functions/api/_middleware.ts there allows this origin via CORS —
// see API.md §2.
export const API_BASE = IS_TAURI ? 'https://clinicmx-web.pages.dev' : ''

/**
 * Opens a URL (https://, mailto:, tel:, wa.me links, etc.) in the user's
 * default browser/mail/WhatsApp app instead of navigating the app's own
 * window. In a normal browser tab, `window.open` already does this; inside
 * the Tauri window there is no separate "system browser" concept unless the
 * opener plugin is used — without it, `window.open`/`location.href` to an
 * external URL either does nothing or navigates the app frame away from the
 * UI (see sharePdf.ts's prior mailto handling).
 */
export async function openExternal(url: string): Promise<void> {
  if (IS_TAURI) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank')
}
