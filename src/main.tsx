import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { IS_TAURI, openExternal } from './lib/runtimeEnv'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './index.css'

if (IS_TAURI) {
  // The Tauri desktop window has no browser chrome of its own, so any link
  // meant for an external destination (mailto:, tel:, wa.me, "View in Drive",
  // etc.) must be handed off to the OS instead of navigating — or doing
  // nothing — inside the app window. This is a single capture-phase
  // listener rather than editing every <a> across the app; it only acts on
  // hrefs that are already external by scheme or target="_blank", so
  // in-app react-router links (relative hrefs, no target) are untouched.
  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const rawHref = anchor.getAttribute('href') || ''
      const isExternalScheme = /^(mailto:|tel:|https?:)/i.test(rawHref)
      if (!isExternalScheme && anchor.target !== '_blank') return
      event.preventDefault()
      void openExternal(anchor.href)
    },
    true
  )
} else {
  // Register Service Worker for PWA & WebView offline capability. Skipped
  // under Tauri: the bundle is already local, a workbox SW registering
  // against the tauri:// custom protocol is unreliable, and it would add a
  // stale-cache layer with no benefit (see vite:preloadError guard below).
  registerSW({ immediate: true })
}

// Request persistent storage to protect local IndexedDB from Android OS eviction
if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {})
}

// After a new deploy, old lazy-loaded chunk files are gone from the server.
// An already-open tab/app still references the old filenames, so navigating
// to a not-yet-loaded page 404s. Reload once to pick up the current build.
// Guarded to at most once per minute so a persistently stale SW/cache can't loop.
const RELOAD_AT = 'clinicmx_chunk_reload_at'
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem(RELOAD_AT) || '0')
  if (Date.now() - last < 60_000) return // Max one recovery reload per minute
  sessionStorage.setItem(RELOAD_AT, String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
