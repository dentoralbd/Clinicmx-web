import { supabase } from './supabase'
import { logActivity } from './activityLog'

/**
 * Per-user network access gate for doctor/operator logins (authorized_ips
 * table). Each user may log in only from IPs the admin has approved; each new
 * IP creates a pending request the admin decides in the Admin zone "Network
 * Access" tab. Users with the "Entry from any IP" permission skip the gate
 * entirely. Admin logins are never gated.
 */

export const MAX_APPROVED_IPS_PER_USER = 5

export type IpAccessStatus = 'approved' | 'pending' | 'denied' | 'unknown'

export interface AuthorizedIpRow {
  id: string
  user_id: string
  ip: string
  status: 'pending' | 'approved' | 'denied'
  requested_by: string | null
  requested_at: string
  decided_at: string | null
}

/**
 * Client public IP via api.ipify.org with a 3s timeout (same approach as
 * logLogin in activityLog.ts). Returns null when the lookup fails — the login
 * gate treats that as "cannot verify" and blocks users without the
 * "Entry from any IP" permission.
 */
export async function fetchClientIp(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as { ip?: string }
    return data.ip ?? null
  } catch {
    return null
  }
}

export async function checkIpAccess(userId: string, ip: string): Promise<IpAccessStatus> {
  const { data, error } = await supabase
    .from('authorized_ips')
    .select('status')
    .eq('user_id', userId)
    .eq('ip', ip)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to check network access: ${error.message}`)
  }
  if (!data) return 'unknown'
  const status = (data as { status: string }).status
  return status === 'approved' || status === 'pending' || status === 'denied' ? status : 'unknown'
}

/**
 * Creates a pending request for this user+IP, or refreshes the timestamp of an
 * existing pending one. Callers must not invoke this when the row is denied
 * (checkIpAccess returns 'denied' → login is refused before requesting).
 */
export async function requestIpApproval(userId: string, ip: string, requestedBy: string): Promise<void> {
  const { error } = await supabase
    .from('authorized_ips')
    .insert({ user_id: userId, ip, requested_by: requestedBy })
  if (error) {
    // Unique (user_id, ip) violation: request already exists — refresh it if
    // still pending, leave approved/denied rows untouched.
    if (error.code === '23505') {
      await supabase
        .from('authorized_ips')
        .update({ requested_by: requestedBy, requested_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('ip', ip)
        .eq('status', 'pending')
      return
    }
    throw new Error(`Failed to request network approval: ${error.message}`)
  }
  logActivity({
    action: 'create',
    entityType: 'ip_access',
    entityLabel: ip,
    details: `Network access requested by ${requestedBy} from ${ip}`,
    ip,
  })
}

export async function listAuthorizedIps(): Promise<AuthorizedIpRow[]> {
  const { data, error } = await supabase
    .from('authorized_ips')
    .select('*')
    .order('requested_at', { ascending: false })
  if (error) {
    throw new Error(`Failed to load network access list: ${error.message}`)
  }
  return (data || []) as AuthorizedIpRow[]
}

/** This user's own pending requests — surfaced as an informational bell entry
 * on any of their already-logged-in devices/sessions while another device
 * waits on admin approval. */
export async function listPendingIpRequestsForUser(userId: string): Promise<AuthorizedIpRow[]> {
  const { data, error } = await supabase
    .from('authorized_ips')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
  if (error) {
    throw new Error(`Failed to load your pending requests: ${error.message}`)
  }
  return (data || []) as AuthorizedIpRow[]
}

export async function countPendingIpRequests(): Promise<number> {
  const { count, error } = await supabase
    .from('authorized_ips')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) {
    throw new Error(`Failed to count pending requests: ${error.message}`)
  }
  return count ?? 0
}

/** Approves the request, then keeps only the user's 5 most recent approved IPs. */
export async function approveIp(row: AuthorizedIpRow, userName?: string): Promise<void> {
  const { error } = await supabase
    .from('authorized_ips')
    .update({ status: 'approved', decided_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) {
    throw new Error(`Failed to approve: ${error.message}`)
  }
  // Trim beyond the cap — best effort, an error here must not fail the approval.
  const { data } = await supabase
    .from('authorized_ips')
    .select('id')
    .eq('user_id', row.user_id)
    .eq('status', 'approved')
    .order('decided_at', { ascending: false })
  if (data && data.length > MAX_APPROVED_IPS_PER_USER) {
    const excess = data.slice(MAX_APPROVED_IPS_PER_USER).map((r) => (r as { id: string }).id)
    await supabase.from('authorized_ips').delete().in('id', excess)
  }
  logActivity({
    action: 'edit',
    entityType: 'ip_access',
    entityLabel: row.ip,
    details: `Approved network ${row.ip}${userName ? ` for ${userName}` : ''}`,
  })
}

export async function denyIp(row: AuthorizedIpRow, userName?: string): Promise<void> {
  const { error } = await supabase
    .from('authorized_ips')
    .update({ status: 'denied', decided_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) {
    throw new Error(`Failed to deny: ${error.message}`)
  }
  logActivity({
    action: 'edit',
    entityType: 'ip_access',
    entityLabel: row.ip,
    details: `Denied network ${row.ip}${userName ? ` for ${userName}` : ''}`,
  })
}

export async function removeIp(row: AuthorizedIpRow, userName?: string): Promise<void> {
  const { error } = await supabase.from('authorized_ips').delete().eq('id', row.id)
  if (error) {
    throw new Error(`Failed to remove: ${error.message}`)
  }
  logActivity({
    action: 'delete',
    entityType: 'ip_access',
    entityLabel: row.ip,
    details: `Removed network ${row.ip}${userName ? ` for ${userName}` : ''}`,
  })
}
