const APP_AUTH_STORAGE_KEY = 'clinicmx_auth'
const APP_ACTOR_STORAGE_KEY = 'clinicmx_actor_id'
const APP_ROLE_STORAGE_KEY = 'clinicmx_role'
const APP_USER_STORAGE_KEY = 'clinicmx_user'

export type AppRole = 'admin' | 'doctor' | 'operator'

export type AppPageKey =
  | 'patients'
  | 'appointments'
  | 'treatments'
  | 'prescriptions'
  | 'billing'
  | 'inventory'
  | 'qr-search'

export interface AppPermissions {
  can_delete: boolean
  can_revert: boolean
  can_edit_clinic_profile: boolean
  pages: Record<AppPageKey, boolean>
}

const ALL_PAGES_ON: Record<AppPageKey, boolean> = {
  patients: true,
  appointments: true,
  treatments: true,
  prescriptions: true,
  billing: true,
  inventory: true,
  'qr-search': true,
}

export const DEFAULT_PERMISSIONS: Record<AppRole, AppPermissions> = {
  admin: {
    can_delete: true,
    can_revert: true,
    can_edit_clinic_profile: true,
    pages: { ...ALL_PAGES_ON },
  },
  doctor: {
    can_delete: false,
    can_revert: true,
    can_edit_clinic_profile: false,
    pages: { ...ALL_PAGES_ON },
  },
  operator: {
    can_delete: false,
    can_revert: false,
    can_edit_clinic_profile: false,
    pages: { ...ALL_PAGES_ON },
  },
}

export interface AppSessionUser {
  id: string
  name: string
  permissions: AppPermissions
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function isAppAuthenticated() {
  return canUseStorage() && localStorage.getItem(APP_AUTH_STORAGE_KEY) === 'true'
}

export function getAppRole(): AppRole | null {
  if (!canUseStorage()) return null
  const role = localStorage.getItem(APP_ROLE_STORAGE_KEY)
  return role === 'admin' || role === 'doctor' || role === 'operator' ? role : null
}

export function setAppRole(role: AppRole) {
  if (!canUseStorage()) return
  localStorage.setItem(APP_ROLE_STORAGE_KEY, role)
}

export function clearAppRole() {
  if (!canUseStorage()) return
  localStorage.removeItem(APP_ROLE_STORAGE_KEY)
}

export function setAppUser(user: AppSessionUser) {
  if (!canUseStorage()) return
  localStorage.setItem(APP_USER_STORAGE_KEY, JSON.stringify(user))
}

export function getAppUser(): AppSessionUser | null {
  if (!canUseStorage()) return null
  const raw = localStorage.getItem(APP_USER_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AppSessionUser
    return parsed && typeof parsed === 'object' && typeof parsed.id === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function clearAppUser() {
  if (!canUseStorage()) return
  localStorage.removeItem(APP_USER_STORAGE_KEY)
}

export function canDelete() {
  const role = getAppRole()
  if (role === 'admin') return true
  return getAppUser()?.permissions?.can_delete === true
}

export function canRevert() {
  const role = getAppRole()
  if (role === 'admin') return true
  return getAppUser()?.permissions?.can_revert === true
}

export function canEditClinicProfile() {
  const role = getAppRole()
  if (role === 'admin') return true
  return getAppUser()?.permissions?.can_edit_clinic_profile === true
}

export function hasPageAccess(page: AppPageKey) {
  const role = getAppRole()
  if (role === 'admin') return true
  const pages = getAppUser()?.permissions?.pages
  // Missing keys fail open so sessions from before this feature keep working.
  if (!pages || !(page in pages)) return true
  return pages[page] === true
}

/**
 * Identity string written into delete_history.deleted_by / edit_history.edited_by
 * so the admin can see who changed what.
 */
export function getAuditActor() {
  const role = getAppRole()
  if (role === 'admin') return 'admin'
  const name = getAppUser()?.name
  if (role && name) return `${role}:${name}`
  return role ?? 'doctor'
}

/** Human-readable form of a getAuditActor() string, e.g. "Doctor — Jane Smith". */
export function formatAuditActor(actor: string) {
  if (actor === 'admin') return 'Admin'
  if (actor === 'doctor') return 'Doctor'
  if (actor === 'operator') return 'Operator'
  const match = actor.match(/^(doctor|operator):(.+)$/)
  if (match) return `${match[1] === 'doctor' ? 'Doctor' : 'Operator'} — ${match[2]}`
  return actor
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
