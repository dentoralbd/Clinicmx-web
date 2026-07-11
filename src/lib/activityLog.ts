import { supabase } from './supabase'
import { getAuditActor } from './appSession'

export type ActivityAction = 'create' | 'edit' | 'delete' | 'restore' | 'revert' | 'login'

export interface ActivityLogInput {
  action: ActivityAction
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  patientId?: string | null
  patientName?: string | null
  details?: string | null
  ip?: string | null
}

/**
 * Fire-and-forget ledger write for the Admin zone Activity Log. Never throws
 * and is never awaited by callers — a failed log line must not break the main
 * operation it describes.
 */
export function logActivity(input: ActivityLogInput): void {
  try {
    void supabase
      .from('activity_log')
      .insert({
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        entity_label: input.entityLabel ?? null,
        patient_id: input.patientId ?? null,
        patient_name: input.patientName ?? null,
        details: input.details ?? null,
        ip: input.ip ?? null,
        actor: getAuditActor(),
      })
      .then(({ error }) => {
        if (error) console.warn('activity_log insert failed:', error.message)
      })
  } catch (err) {
    console.warn('activity_log insert failed:', err)
  }
}

/**
 * Records a login event with the client's public IP (best effort — if the IP
 * lookup fails or times out, the login is still logged without it). Call
 * AFTER setAppRole/setAppUser so the actor is stamped with the right name.
 * Fire-and-forget: login must never wait on the IP fetch.
 */
export function logLogin(): void {
  void (async () => {
    let ip: string | null = null
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3000)
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) {
        const data = (await res.json()) as { ip?: string }
        ip = data.ip ?? null
      }
    } catch {
      // IP lookup unavailable — log the login without it.
    }
    logActivity({ action: 'login', entityType: 'session', ip })
  })()
}

export interface ActivityLogRow {
  id: string
  occurred_at: string
  action: ActivityAction
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  patient_id: string | null
  patient_name: string | null
  details: string | null
  ip: string | null
  actor: string
}

export const ACTIVITY_PAGE_SIZE = 50

export async function listActivityLog(
  page: number,
  filters: { action?: ActivityAction | 'all'; entityType?: string }
): Promise<ActivityLogRow[]> {
  const from = page * ACTIVITY_PAGE_SIZE
  let query = supabase
    .from('activity_log')
    .select('*')
    .order('occurred_at', { ascending: false })
    .range(from, from + ACTIVITY_PAGE_SIZE - 1)
  if (filters.action && filters.action !== 'all') {
    query = query.eq('action', filters.action)
  }
  if (filters.entityType && filters.entityType !== 'all') {
    query = query.eq('entity_type', filters.entityType)
  }
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load activity log: ${error.message}`)
  }
  return (data || []) as ActivityLogRow[]
}
