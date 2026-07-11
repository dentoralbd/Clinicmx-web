import { supabase } from './supabase'
import type { Json } from './database.types'
import { DEFAULT_PERMISSIONS, type AppPermissions, type AppRole } from './appSession'
import { logActivity } from './activityLog'

const PBKDF2_ITERATIONS = 100000

export interface AppUserRecord {
  id: string
  created_at: string
  updated_at: string
  role: 'doctor' | 'operator'
  full_name: string
  identifier: string
  password_hash: string
  password_salt: string
  is_active: boolean
  permissions: AppPermissions
  last_login_at: string | null
}

const encoder = new TextEncoder()

function bufferToBase64(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToBuffer(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)).buffer
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

async function deriveHash(password: string, saltBuffer: ArrayBuffer) {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await deriveHash(password, salt.buffer)
  return { salt: bufferToBase64(salt.buffer), hash: bufferToBase64(hash) }
}

export async function verifyPassword(password: string, saltB64: string, hashB64: string) {
  try {
    const hash = await deriveHash(password, base64ToBuffer(saltB64))
    return bufferToBase64(hash) === hashB64
  } catch {
    return false
  }
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
  password_hash: string
  password_salt: string
  is_active: boolean
  permissions: Json
  last_login_at: string | null
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

export async function listAppUsers(): Promise<AppUserRecord[]> {
  const { data, error } = await supabase.from('app_users').select('*').order('created_at', { ascending: true })
  if (error) throw friendlyError(error)
  return (data ?? []).map(mapRow)
}

export interface CreateAppUserInput {
  role: 'doctor' | 'operator'
  full_name: string
  identifier: string
  password: string
  permissions: AppPermissions
}

export async function createAppUser(input: CreateAppUserInput) {
  const { salt, hash } = await hashPassword(input.password)
  const { error } = await supabase.from('app_users').insert({
    role: input.role,
    full_name: input.full_name.trim(),
    identifier: normalizeIdentifier(input.identifier),
    password_hash: hash,
    password_salt: salt,
    permissions: input.permissions as unknown as Json,
  })
  if (error) throw friendlyError(error)
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
}

export async function updateAppUser(id: string, input: UpdateAppUserInput) {
  const { error } = await supabase
    .from('app_users')
    .update({
      role: input.role,
      full_name: input.full_name.trim(),
      identifier: normalizeIdentifier(input.identifier),
      permissions: input.permissions as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw friendlyError(error)
  logActivity({
    action: 'edit',
    entityType: 'app_user',
    entityId: id,
    entityLabel: input.full_name.trim(),
    details: 'Account/permissions updated',
  })
}

export async function setAppUserPassword(id: string, password: string, fullName?: string) {
  const { salt, hash } = await hashPassword(password)
  const { error } = await supabase
    .from('app_users')
    .update({ password_hash: hash, password_salt: salt, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw friendlyError(error)
  logActivity({
    action: 'edit',
    entityType: 'app_user',
    entityId: id,
    entityLabel: fullName ?? null,
    details: 'Password changed',
  })
}

export async function setAppUserActive(id: string, isActive: boolean, fullName?: string) {
  const { error } = await supabase
    .from('app_users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw friendlyError(error)
  logActivity({
    action: 'edit',
    entityType: 'app_user',
    entityId: id,
    entityLabel: fullName ?? null,
    details: isActive ? 'Account enabled' : 'Account disabled',
  })
}

export async function deleteAppUser(id: string, fullName?: string) {
  const { error } = await supabase.from('app_users').delete().eq('id', id)
  if (error) throw friendlyError(error)
  logActivity({
    action: 'delete',
    entityType: 'app_user',
    entityId: id,
    entityLabel: fullName ?? null,
    details: 'Account deleted',
  })
}

export async function findAppUserByIdentifier(identifier: string, role: 'doctor' | 'operator') {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('identifier', normalizeIdentifier(identifier))
    .eq('role', role)
    .maybeSingle()
  if (error) throw friendlyError(error)
  return data ? mapRow(data) : null
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
