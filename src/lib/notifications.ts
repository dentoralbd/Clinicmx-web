// Shared (system-wide) in-app notification center, backed by the
// app_notifications table (migration 032) instead of localStorage — a
// backup reminder or auto-upload result now means the same thing to every
// admin on every device, instead of each device keeping its own private
// list. Same API shape as before, now async. A custom DOM event still
// drives same-device instant refresh (the Header bell, backup logic
// running elsewhere in the tree) without prop drilling; cross-device
// refresh happens on NotificationBell's existing poll cycle.

import { supabase } from './supabase'
import { getAppRole, type AppRole } from './appSession'

export interface AppNotification {
  id: string
  title: string
  message: string
  createdAt: string
  read: boolean
  linkTo?: string
  // Restricts which logged-in role sees this entry. Undefined = visible to
  // any role.
  audience?: AppRole
}

const CHANGE_EVENT = 'clinicmx-notifications-changed'
const MAX_STORED = 50

function notifyChanged() {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // ignore (non-browser environment)
  }
}

type Row = {
  id: string
  title: string
  message: string
  link_to: string | null
  audience: string | null
  read: boolean
  created_at: string
}

function fromRow(row: Row): AppNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    linkTo: row.link_to ?? undefined,
    audience: (row.audience as AppRole | null) ?? undefined,
    createdAt: row.created_at,
    read: row.read,
  }
}

/** Fetches the shared list, newest first, filtered to entries visible to the
 * current role (null audience = everyone). Best-effort: a fetch failure
 * (offline, RLS hiccup) returns an empty list rather than throwing, so a
 * flaky poll can't crash the bell. */
export async function getNotifications(): Promise<AppNotification[]> {
  const role = getAppRole()
  try {
    const { data, error } = await (supabase as any)
      .from('app_notifications')
      .select('*')
      .or(`audience.is.null,audience.eq.${role}`)
      .order('created_at', { ascending: false })
      .limit(MAX_STORED)
    if (error) throw error
    return ((data as Row[]) || []).map(fromRow)
  } catch {
    return []
  }
}

export async function getUnreadCount(): Promise<number> {
  return (await getNotifications()).filter((n) => !n.read).length
}

/** Inserts a shared notification, visible to every device. Fire-and-forget
 * on failure — the browser push (if any) already fired, and reminder/overdue
 * posts naturally re-post next cycle, so a dropped insert isn't fatal. */
export async function addNotification(entry: {
  title: string
  message: string
  linkTo?: string
  audience?: AppRole
}): Promise<void> {
  try {
    const { error } = await (supabase as any).from('app_notifications').insert({
      title: entry.title,
      message: entry.message,
      link_to: entry.linkTo ?? null,
      audience: entry.audience ?? null,
    })
    if (error) throw error
    notifyChanged()
  } catch {
    // ignore — best-effort
  }
}

/** Same as addNotification, but skips the insert if a same-title entry
 * already exists since `sinceIso`. Used for scheduled reminder/overdue posts
 * so two admins with the app open on different devices, both reacting to the
 * same missed schedule, don't create two rows for it. */
export async function addNotificationOnce(
  entry: { title: string; message: string; linkTo?: string; audience?: AppRole },
  sinceIso: string
): Promise<void> {
  try {
    const { data, error } = await (supabase as any)
      .from('app_notifications')
      .select('id')
      .eq('title', entry.title)
      .gte('created_at', sinceIso)
      .limit(1)
    if (error) throw error
    if (data && data.length > 0) return
    await addNotification(entry)
  } catch {
    // Best-effort: if the dedup check itself fails, fall through and post —
    // an occasional duplicate is far less harmful than silently dropping a
    // reminder the admin actually needs to see.
    await addNotification(entry)
  }
}

/** Marks read every entry visible to the current role — global, so opening
 * the bell on one device clears the unread dot everywhere. */
export async function markAllRead(): Promise<void> {
  const role = getAppRole()
  try {
    const { error } = await (supabase as any)
      .from('app_notifications')
      .update({ read: true })
      .eq('read', false)
      .or(`audience.is.null,audience.eq.${role}`)
    if (error) throw error
    notifyChanged()
  } catch {
    // ignore — best-effort
  }
}

/** Deletes a notification — gone from every device. */
export async function dismissNotification(id: string): Promise<void> {
  try {
    const { error } = await (supabase as any).from('app_notifications').delete().eq('id', id)
    if (error) throw error
    notifyChanged()
  } catch {
    // ignore — best-effort
  }
}

export function subscribeToNotifications(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}
