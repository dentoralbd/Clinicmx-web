const APP_AUTH_STORAGE_KEY = 'clinicmx_auth'
const APP_ACTOR_STORAGE_KEY = 'clinicmx_actor_id'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function isAppAuthenticated() {
  return canUseStorage() && localStorage.getItem(APP_AUTH_STORAGE_KEY) === 'true'
}

export function getOrCreateAppActorId() {
  if (!canUseStorage()) return 'clinicmx-local'

  let actorId = localStorage.getItem(APP_ACTOR_STORAGE_KEY)
  if (actorId) return actorId

  actorId = globalThis.crypto?.randomUUID?.() || `clinicmx-${Date.now()}-${Math.random().toString(16).slice(2)}`
  localStorage.setItem(APP_ACTOR_STORAGE_KEY, actorId)
  return actorId
}

export function getScopedStorageKey(prefix: string) {
  return `${prefix}:${getOrCreateAppActorId()}`
}
