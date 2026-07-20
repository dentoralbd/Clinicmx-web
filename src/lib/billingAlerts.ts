import { supabase } from './supabase'
import type { ActivityLogRow } from './activityLog'

export type BillingAlertRow = Pick<
  ActivityLogRow,
  'id' | 'occurred_at' | 'action' | 'entity_type' | 'entity_label' | 'patient_id' | 'patient_name' | 'details' | 'actor'
>

const LOOKBACK_DAYS = 7
const SEEN_STORAGE_KEY = 'clinicmx_billing_alerts_seen'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/**
 * Recent invoice/payment edits and deletes, for the admin notification bell.
 * Cross-device by design (read fresh from Supabase, not localStorage) — a
 * doctor's edit on their own device must still reach the admin's device.
 * Best-effort: a failed poll must not break the bell, so this never throws.
 */
export async function listRecentBillingAlerts(): Promise<BillingAlertRow[]> {
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('activity_log')
      .select('id, occurred_at, action, entity_type, entity_label, patient_id, patient_name, details, actor')
      .in('action', ['edit', 'delete'])
      .in('entity_type', ['invoice', 'payment'])
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(10)
    if (error) return []
    return (data || []) as BillingAlertRow[]
  } catch {
    return []
  }
}

/**
 * Per-device "last seen" watermark for the billing-alert unread dot. A fresh
 * device initializes to now, so it doesn't inherit a backlog of red dots for
 * events that happened before it ever opened the bell — the entries still
 * list, they just don't count as unread.
 */
export function getBillingAlertsSeen(): string {
  if (!canUseStorage()) return new Date().toISOString()
  const stored = localStorage.getItem(SEEN_STORAGE_KEY)
  if (stored) return stored
  const now = new Date().toISOString()
  localStorage.setItem(SEEN_STORAGE_KEY, now)
  return now
}

export function setBillingAlertsSeen(iso: string) {
  if (!canUseStorage()) return
  localStorage.setItem(SEEN_STORAGE_KEY, iso)
}
