// Cloudflare Pages Function: staff (doctor/operator) account management for
// the Admin -> Users tab (src/components/admin/UsersTab.tsx), via
// src/lib/appUsers.ts. Phase 2 of SECURITY-HARDENING.md — see that doc and
// the Phase 2 plan for full context.
//
// Why this exists: once real RLS lands (migration 039), the browser's
// `authenticated` role has no INSERT/UPDATE/DELETE privilege on app_users
// at all (see 039's app_users policy comment) — every staff-account write
// must go through the Supabase Auth Admin API, which needs the
// service_role key. That key must never reach the browser, so it lives
// here as a Cloudflare secret, same pattern as the Google Drive OAuth
// secrets in _lib.ts.
//
// Gated by requireAdminToken (_authLib.ts) — the same trusted-device token
// admin-otp.ts mints, already proven out on the backup endpoints.
//
// POST /api/admin-users
//   { action: 'create', role, full_name, identifier, password, permissions }
//     -> { ok: true, id, auth_email }
//   { action: 'update', id, role, full_name, identifier, permissions }
//     -> { ok: true }
//   { action: 'set-password', id, password } -> { ok: true }
//   { action: 'set-active', id, is_active } -> { ok: true }
//   { action: 'delete', id } -> { ok: true }
//   { action: 'sync' }
//     -> { ok: true, created: [{ id, full_name, identifier, tempPassword }] }
//     One-shot migration/disaster-recovery tool: creates a Supabase Auth
//     user (random temp password) for every app_users row that doesn't
//     have one yet and links it. Safe to re-run — rows that already have
//     auth_user_id are skipped. See Phase 2 plan §E2 (the backup gap):
//     this is also how a restored project gets logins again.

import { createClient } from '@supabase/supabase-js'
import { requireAdminToken } from './_authLib'

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  ADMIN_AUTH_SECRET?: string
}

// Must stay byte-identical to src/lib/appUsers.ts's normalizeIdentifier and
// the client-side authEmailFor derived from it (src/pages/Login.tsx) — the
// browser computes the same email with no server round-trip at sign-in
// time, so any drift here breaks staff login silently.
function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.includes('@')) return trimmed.toLowerCase()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

const STAFF_EMAIL_DOMAIN = 'staff.clinicmx.local'

function authEmailFor(identifier: string): string {
  const n = normalizeIdentifier(identifier)
  return n.includes('@') ? n : `${n.replace(/^\+/, '')}@${STAFF_EMAIL_DOMAIN}`
}

function randomTempPassword(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 20)
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface Body {
  action?: string
  id?: string
  role?: 'doctor' | 'operator'
  full_name?: string
  identifier?: string
  password?: string
  permissions?: unknown
  is_active?: boolean
}

interface AppUserRow {
  id: string
  role: 'doctor' | 'operator' | 'admin'
  full_name: string
  identifier: string
  auth_user_id: string | null
  auth_email: string | null
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const authError = await requireAdminToken(request, env)
  if (authError) return authError

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Server is not configured for account management.' })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  switch (body.action) {
    case 'create': {
      if (!body.role || !body.full_name || !body.identifier || !body.password) {
        return json(400, { ok: false, error: 'Missing required fields.' })
      }
      const identifier = normalizeIdentifier(body.identifier)
      const email = authEmailFor(identifier)

      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        app_metadata: { app_role: body.role },
      })
      if (createErr || !created.user) {
        return json(400, { ok: false, error: createErr?.message || 'Could not create the login.' })
      }

      const { data: row, error: insertErr } = await supabase
        .from('app_users')
        .insert({
          role: body.role,
          full_name: body.full_name.trim(),
          identifier,
          permissions: body.permissions,
          auth_user_id: created.user.id,
          auth_email: email,
        })
        .select('id')
        .single()

      if (insertErr || !row) {
        // No cross-database transaction between auth.users and
        // public.app_users — compensate explicitly so a failed insert
        // doesn't leave an orphaned, unlinked auth user behind.
        await supabase.auth.admin.deleteUser(created.user.id)
        return json(400, {
          ok: false,
          error: insertErr?.code === '23505' ? 'This email/phone is already in use.' : insertErr?.message,
        })
      }

      return json(200, { ok: true, id: row.id, auth_email: email })
    }

    case 'update': {
      if (!body.id || !body.role || !body.full_name || !body.identifier) {
        return json(400, { ok: false, error: 'Missing required fields.' })
      }
      const { data: existing } = await supabase
        .from('app_users')
        .select('auth_user_id, auth_email, role, identifier')
        .eq('id', body.id)
        .maybeSingle<Pick<AppUserRow, 'auth_user_id' | 'auth_email' | 'role' | 'identifier'>>()
      if (!existing) return json(404, { ok: false, error: 'Account not found.' })

      const identifier = normalizeIdentifier(body.identifier)
      const email = authEmailFor(identifier)
      const identityChanged = identifier !== existing.identifier || body.role !== existing.role

      if (identityChanged && existing.auth_user_id) {
        const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(existing.auth_user_id, {
          email,
          app_metadata: { app_role: body.role },
        })
        if (authUpdateErr) return json(400, { ok: false, error: authUpdateErr.message })
      }

      const { error: updateErr } = await supabase
        .from('app_users')
        .update({
          role: body.role,
          full_name: body.full_name.trim(),
          identifier,
          permissions: body.permissions,
          auth_email: identityChanged ? email : existing.auth_email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.id)
      if (updateErr) {
        return json(400, { ok: false, error: updateErr.code === '23505' ? 'This email/phone is already in use.' : updateErr.message })
      }

      return json(200, { ok: true })
    }

    case 'set-password': {
      if (!body.id || !body.password) return json(400, { ok: false, error: 'Missing required fields.' })
      const { data: existing } = await supabase
        .from('app_users')
        .select('auth_user_id')
        .eq('id', body.id)
        .maybeSingle<Pick<AppUserRow, 'auth_user_id'>>()
      if (!existing?.auth_user_id) return json(404, { ok: false, error: 'Account has no linked login yet.' })

      const { error } = await supabase.auth.admin.updateUserById(existing.auth_user_id, { password: body.password })
      if (error) return json(400, { ok: false, error: error.message })
      return json(200, { ok: true })
    }

    case 'set-active': {
      if (!body.id || typeof body.is_active !== 'boolean') {
        return json(400, { ok: false, error: 'Missing required fields.' })
      }
      // Setting app_users.is_active is sufficient on its own: every RLS
      // helper (is_active_app_user, is_app_admin, app_can) requires
      // is_active, so this alone denies the account everything at the DB
      // layer immediately, and Login.tsx's post-auth check signs them out
      // with the existing "This account is disabled" message. We don't
      // also revoke the Supabase Auth session/token here (e.g. via
      // updateUserById ban_duration) — is_active is enough and keeps this
      // action a single fast write.
      const { error } = await supabase
        .from('app_users')
        .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
        .eq('id', body.id)
      if (error) return json(400, { ok: false, error: error.message })
      return json(200, { ok: true })
    }

    case 'delete': {
      if (!body.id) return json(400, { ok: false, error: 'Missing id.' })
      const { data: existing } = await supabase
        .from('app_users')
        .select('auth_user_id')
        .eq('id', body.id)
        .maybeSingle<Pick<AppUserRow, 'auth_user_id'>>()

      if (existing?.auth_user_id) {
        const { error: deleteAuthErr } = await supabase.auth.admin.deleteUser(existing.auth_user_id)
        // Not fatal: an already-missing auth user must not block cleaning
        // up the app_users row (e.g. manual dashboard deletion happened).
        if (deleteAuthErr) console.error('deleteUser failed (continuing):', deleteAuthErr.message)
      }

      const { error } = await supabase.from('app_users').delete().eq('id', body.id)
      if (error) return json(400, { ok: false, error: error.message })
      return json(200, { ok: true })
    }

    case 'sync': {
      const { data: rows, error: listErr } = await supabase
        .from('app_users')
        .select('id, role, full_name, identifier, auth_user_id')
        .is('auth_user_id', null)
      if (listErr) return json(400, { ok: false, error: listErr.message })

      const results: Array<{ id: string; full_name: string; identifier: string; tempPassword?: string; error?: string }> = []

      for (const row of (rows || []) as Pick<AppUserRow, 'id' | 'role' | 'full_name' | 'identifier'>[]) {
        const identifier = normalizeIdentifier(row.identifier)
        const email = authEmailFor(identifier)
        const tempPassword = randomTempPassword()

        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          app_metadata: { app_role: row.role },
        })
        if (createErr || !created.user) {
          results.push({ id: row.id, full_name: row.full_name, identifier, error: createErr?.message || 'create failed' })
          continue
        }

        const { error: linkErr } = await supabase
          .from('app_users')
          .update({ auth_user_id: created.user.id, auth_email: email })
          .eq('id', row.id)
        if (linkErr) {
          await supabase.auth.admin.deleteUser(created.user.id)
          results.push({ id: row.id, full_name: row.full_name, identifier, error: linkErr.message })
          continue
        }

        results.push({ id: row.id, full_name: row.full_name, identifier, tempPassword })
      }

      return json(200, { ok: true, created: results })
    }

    default:
      return json(400, { ok: false, error: 'Unknown action' })
  }
}
