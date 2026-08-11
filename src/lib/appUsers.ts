import { supabase } from './supabase'
import type { Json } from './database.types'
import { DEFAULT_PERMISSIONS, type AppPermissions, type AppRole } from './appSession'
import { logActivity } from './activityLog'
import { getAdminDeviceToken } from './adminOtp'
import { API_BASE } from './runtimeEnv'

// Phase 2 (SECURITY-HARDENING.md): staff accounts are now real Supabase
// Auth users. Creation/password-reset/disable/delete go through
// functions/api/admin-users.ts (service_role — the anon/authenticated
// roles have no write privilege on app_users at all once migration 039
// lands, see that migration's app_users policy comment). This file keeps
// the exact same exported function signatures as before so
// components/admin/UsersTab.tsx needs no changes.

export interface AppUserRecord {
  id: string
  created_at: string
  updated_at: string
  role: 'doctor' | 'operator'
  full_name: string
  identifier: string
  is_active: boolean
  permissions: AppPermissions
  last_login_at: string | null
  auth_user_id: string | null
  auth_email: string | null
  default_share_pct: number | null
}

const ADMIN_TOKEN_HEADER = 'X-ClinicMx-Auth'

/** Staff identifiers can be emails or phone numbers; Supabase Auth needs an
 * email. Derived deterministically (no lookup) so the browser can resolve
 * it before it has any session. Must stay byte-identical to the same
 * function in functions/api/admin-users.ts — that's what actually creates
 * the Auth user this has to match. */
const STAFF_EMAIL_DOMAIN = 'staff.clinicmx.local'
export function authEmailFor(identifier: string): string {
  const n = normalizeIdentifier(identifier)
  return n.includes('@') ? n : `${n.replace(/^\+/, '')}@${STAFF_EMAIL_DOMAIN}`
}

/**
 * Normalizes a login identifier so the same value matches at account creation
 * and at login: emails are lowercased, phone numbers are reduced to digits
 * (keeping a leading +).
 */
export function normalizeIdentifier(raw: string) {
  const trimmed = raw.trim()
  if (trimmed.includes('@')) return trimmed.toLowerCase()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

function mergePermissions(role: AppRole, raw: unknown): AppPermissions {
  const defaults = DEFAULT_PERMISSIONS[role]
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<AppPermissions>) : {}
  return {
    ...defaults,
    ...stored,
    pages: { ...defaults.pages, ...(stored.pages ?? {}) },
  }
}

function mapRow(row: {
  id: string
  created_at: string
  updated_at: string
  role: string
  full_name: string
  identifier: string
  is_active: boolean
  permissions: Json
  last_login_at: string | null
  auth_user_id: string | null
  auth_email: string | null
  default_share_pct: number | null
}): AppUserRecord {
  const role = row.role === 'operator' ? 'operator' : 'doctor'
  return {
    ...row,
    role,
    permissions: mergePermissions(role, row.permissions),
  }
}

function friendlyError(error: { code?: string; message: string }) {
  if (error.code === '23505') return new Error('This email/phone is already in use.')
  return new Error(error.message)
}

// Explicit column list, no password fields — app_users' column-level
// grants (migration 039) deny `select('*')` outright once applied
// (`permission denied for column password_hash`), and even before that
// there's no reason to ever fetch a hash to the browser again.
const APP_USER_COLUMNS =
  'id, created_at, updated_at, role, full_name, identifier, is_active, permissions, last_login_at, auth_user_id, auth_email, default_share_pct'

export async function listAppUsers(): Promise<AppUserRecord[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select(APP_USER_COLUMNS)
    // Admin has a real app_users row too (role='admin', migration 038) so
    // every RLS helper is a single uniform lookup — but it must not show
    // up here as a deletable "Doctor" account.
    .in('role', ['doctor', 'operator'])
    .order('created_at', { ascending: true })
  if (error) throw friendlyError(error)
  return (data ?? []).map(mapRow as (row: unknown) => AppUserRecord)
}

async function callAdminUsersFunction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/admin-users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ADMIN_TOKEN_HEADER]: getAdminDeviceToken() ?? '' },
    body: JSON.stringify(body),
  })
  let data: Record<string, unknown>
  try {
    data = await res.json()
  } catch {
    throw new Error(`Request failed (HTTP ${res.status}).`)
  }
  if (res.status === 401) throw new Error('Your device trust expired — log out and log in as admin again to refresh it.')
  if (!res.ok || data.ok !== true) throw new Error((data.error as string) || `Request failed (HTTP ${res.status}).`)
  return data
}

export interface CreateAppUserInput {
  role: 'doctor' | 'operator'
  full_name: string
  identifier: string
  password: string
  permissions: AppPermissions
  default_share_pct?: number | null
}

export async function createAppUser(input: CreateAppUserInput) {
  await callAdminUsersFunction({
    action: 'create',
    role: input.role,
    full_name: input.full_name.trim(),
    identifier: input.identifier,
    password: input.password,
    permissions: input.permissions,
    default_share_pct: input.default_share_pct ?? null,
  })
  logActivity({
    action: 'create',
    entityType: 'app_user',
    entityLabel: input.full_name.trim(),
    details: `${input.role} account created`,
  })
}

export interface UpdateAppUserInput {
  role: 'doctor' | 'operator'
  full_name: string
  identifier: string
  permissions: AppPermissions
  default_share_pct?: number | null
}

export async function updateAppUser(id: string, input: UpdateAppUserInput) {
  await callAdminUsersFunction({
    action: 'update',
    id,
    role: input.role,
    full_name: input.full_name.trim(),
    identifier: input.identifier,
    permissions: input.permissions,
    default_share_pct: input.default_share_pct ?? null,
  })
  logActivity({
    action: 'edit',
    entityType: 'app_user',
    entityId: id,
    entityLabel: input.full_name.trim(),
    details: 'Account/permissions updated',
  })
}

export async function setAppUserPassword(id: string, password: string, fullName?: string) {
  await callAdminUsersFunction({ action: 'set-password', id, password })
  logActivity({
    action: 'edit',
    entityType: 'app_user',
    entityId: id,
    entityLabel: fullName ?? null,
    details: 'Password changed',
  })
}

export async function setAppUserActive(id: string, isActive: boolean, fullName?: string) {
  await callAdminUsersFunction({ action: 'set-active', id, is_active: isActive })
  logActivity({
    action: 'edit',
    entityType: 'app_user',
    entityId: id,
    entityLabel: fullName ?? null,
    details: isActive ? 'Account enabled' : 'Account disabled',
  })
}

export async function deleteAppUser(id: string, fullName?: string) {
  await callAdminUsersFunction({ action: 'delete', id })
  logActivity({
    action: 'delete',
    entityType: 'app_user',
    entityId: id,
    entityLabel: fullName ?? null,
    details: 'Account deleted',
  })
}

/** Migration/disaster-recovery tool: creates a Supabase Auth login for
 * every app_users row that doesn't have one yet (temp passwords returned
 * for the admin to distribute). Safe to re-run. See Phase 2 plan §E2. */
export async function syncAppUserLogins() {
  const data = await callAdminUsersFunction({ action: 'sync' })
  return data.created as Array<{ id: string; full_name: string; identifier: string; tempPassword?: string; error?: string }>
}

/** Post-sign-in lookup: resolves the caller's own profile/permissions row
 * by their Supabase Auth session. Replaces the old pre-auth
 * findAppUserByIdentifier() — there is no pre-auth app_users read anymore
 * (see src/pages/Login.tsx), so this only ever runs with a real session. */
export async function loadOwnAppUser(authUserId: string): Promise<AppUserRecord | null> {
  const { data, error } = await supabase
    .from('app_users')
    .select(APP_USER_COLUMNS)
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) throw friendlyError(error)
  return data ? mapRow(data as Parameters<typeof mapRow>[0]) : null
}

/** Best-effort login timestamp — never blocks or fails a login. */
export function touchLastLogin(id: string) {
  void supabase
    .from('app_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id)
    .then(({ error }) => {
      if (error) console.error('Failed to update last_login_at:', error)
    })
}
