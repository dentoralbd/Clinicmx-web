// Lightweight in-app notification center: a localStorage-backed list plus a
// custom DOM event so any component (the Header bell, backup logic running
// in a different part of the tree) can react to changes without prop
// drilling or a state-management library — matches the vanilla approach
// already used by backupReminders.ts.

import { getAppRole, type AppRole } from './appSession'

export interface AppNotification {
  id: string
  title: string
  message: string
  createdAt: string
  read: boolean
  linkTo?: string
  // Restricts which logged-in role sees this entry. Undefined = visible to
  // any role. Login is client-side and the same browser/localStorage is
  // reused across role switches, so entries meant for one role (e.g.
  // admin-only backup reminders) must be scoped or they leak to whichever
  // role logs in next on that device.
  audience?: AppRole
}

const STORAGE_KEY = 'clinicmx_notifications'
const CHANGE_EVENT = 'clinicmx-notifications-changed'
const MAX_STORED = 50

function readAll(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(list: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_STORED)))
  } catch {
    // ignore (e.g. private browsing / storage disabled)
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // ignore (non-browser environment)
  }
}

function forCurrentRole(list: AppNotification[]): AppNotification[] {
  const role = getAppRole()
  return list.filter((n) => !n.audience || n.audience === role)
}

export function getNotifications(): AppNotification[] {
  return forCurrentRole(readAll())
}

export function getUnreadCount(): number {
  return forCurrentRole(readAll()).filter((n) => !n.read).length
}

export function addNotification(entry: { title: string; message: string; linkTo?: string; audience?: AppRole }): void {
  const notification: AppNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: entry.title,
    message: entry.message,
    linkTo: entry.linkTo,
    audience: entry.audience,
    createdAt: new Date().toISOString(),
    read: false,
  }
  writeAll([notification, ...readAll()])
}

/** Marks read only the entries visible to the current role — a stored entry
 * scoped to a different role must not be silently marked read on its behalf. */
export function markAllRead(): void {
  const role = getAppRole()
  writeAll(readAll().map((n) => (!n.audience || n.audience === role ? { ...n, read: true } : n)))
}

export function dismissNotification(id: string): void {
  writeAll(readAll().filter((n) => n.id !== id))
}

export function subscribeToNotifications(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
