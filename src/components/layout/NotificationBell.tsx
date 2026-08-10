import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Bell, CalendarDays, CloudOff, Receipt, Wifi, X } from 'lucide-react'
import {
  getNotifications,
  markAllRead,
  dismissNotification,
  subscribeToNotifications,
  type AppNotification,
} from '@/lib/notifications'
import { getAppRole, getAppUser, formatAuditActor } from '@/lib/appSession'
import { countPendingIpRequests, listPendingIpRequestsForUser } from '@/lib/ipAccess'
import { listRecentBillingAlerts, getBillingAlertsSeen, setBillingAlertsSeen } from '@/lib/billingAlerts'
import {
  getVisiblePendingMutations,
  listRecentOfflineSyncAlerts,
  getOfflineSyncAlertsSeen,
  setOfflineSyncAlertsSeen,
  fetchSitewidePendingEdits,
  fetchRemoteApprovableEdits,
  countDistinctPendingEdits,
  countDistinctSitewideEdits,
} from '@/lib/offlineSync'
import { getPendingLeaveCount } from '@/lib/leaveAlerts'

/** Synthetic, never-persisted entry derived live from Supabase (network
 * access status, billing changes) — always identical across every device
 * since it's read fresh from the database, unlike the stored list which is
 * per-browser. */
interface LiveEntry {
  id: string
  kind: 'ip' | 'billing' | 'leave' | 'offlineSync'
  title: string
  message: string
  linkTo?: string
  unread: boolean
}

/** "2 from Dr. Jane, 1 from Operator Alex" — who the pending sitewide offline edits belong to, for the admin bell entry. Caps at 3 named actors so the message doesn't run on forever with a busy clinic. */
function summarizeByActor(rows: Array<{ actor: string }>): string {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const name = formatAuditActor(row.actor || 'doctor')
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  const parts = Array.from(counts.entries()).map(([name, count]) => `${count} from ${name}`)
  if (parts.length <= 3) return parts.join(', ')
  return `${parts.slice(0, 3).join(', ')}, and ${parts.length - 3} more`
}

const LIVE_POLL_MS = 20000

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([])
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  /** Newest occurred_at seen across billing-alert polls, used to advance the
   * per-device "seen" watermark when the bell is opened. */
  const latestBillingIsoRef = useRef<string | null>(null)
  /** Same idea as latestBillingIsoRef, for offline-sync-completed alerts. */
  const latestOfflineSyncIsoRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getNotifications().then((list) => {
        if (!cancelled) setNotifications(list)
      })
    }
    refresh()
    const unsubscribe = subscribeToNotifications(refresh)
    // Cross-device changes (another admin posting/dismissing/reading on a
    // different device) only show up here on the next poll, matching the
    // cadence of the live IP/billing entries below.
    const interval = setInterval(refresh, LIVE_POLL_MS)
    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const role = getAppRole()
    if (role !== 'admin' && role !== 'doctor' && role !== 'operator') return

    let cancelled = false
    const refreshLive = async () => {
      try {
        if (role === 'admin') {
          const [count, billingRows, leaveCount, offlineSyncRows] = await Promise.all([
            countPendingIpRequests(),
            listRecentBillingAlerts(),
            getPendingLeaveCount().catch(() => 0),
            listRecentOfflineSyncAlerts(),
          ])
          if (cancelled) return

          const seen = getBillingAlertsSeen()
          if (billingRows[0]) latestBillingIsoRef.current = billingRows[0].occurred_at

          const offlineSyncSeen = getOfflineSyncAlertsSeen()
          if (offlineSyncRows[0]) latestOfflineSyncIsoRef.current = offlineSyncRows[0].occurred_at

          const ipEntries: LiveEntry[] =
            count > 0
              ? [
                  {
                    id: 'live-ip-admin',
                    kind: 'ip',
                    title: 'Network access pending',
                    message: `${count} network access request${count > 1 ? 's' : ''} waiting for your approval.`,
                    linkTo: '/doctor-profile',
                    unread: true,
                  },
                ]
              : []

          const leaveEntries: LiveEntry[] =
            leaveCount > 0
              ? [
                  {
                    id: 'live-leave-admin',
                    kind: 'leave',
                    title: 'Leave requests pending',
                    message: `${leaveCount} leave request${leaveCount > 1 ? 's' : ''} waiting for your approval.`,
                    linkTo: '/hr-payroll',
                    unread: true,
                  },
                ]
              : []

          const billingEntries: LiveEntry[] = billingRows.map((row) => ({
            id: `live-billing-${row.id}`,
            kind: 'billing',
            title: `${row.entity_type === 'invoice' ? 'Invoice' : 'Payment'} ${row.action === 'delete' ? 'deleted' : 'edited'}`,
            message: `${row.patient_name ?? 'Unknown patient'} — ${row.details ?? row.entity_label ?? ''} · by ${formatAuditActor(row.actor)}`,
            linkTo: row.patient_id ? `/patients/${row.patient_id}?section=ptlog` : undefined,
            unread: row.occurred_at > seen,
          }))

          // Invoice/payment offline-syncs already surface above via
          // billingEntries (same activity_log rows, generic "edited"
          // wording) — skip those two entity types here so they don't show
          // twice, and phrase the rest as an explicit sync notification.
          const offlineSyncEntries: LiveEntry[] = offlineSyncRows
            .filter((row) => row.entity_type !== 'invoice' && row.entity_type !== 'payment')
            .map((row) => ({
              id: `live-offline-sync-${row.id}`,
              kind: 'offlineSync' as const,
              title: 'Offline edit synced',
              message: `${formatAuditActor(row.actor)} — ${row.patient_name ? `${row.patient_name}: ` : ''}${row.entity_label || row.entity_type}`,
              linkTo: row.patient_id ? `/patients/${row.patient_id}?section=ptlog` : '/admin?tab=offline',
              unread: row.occurred_at > offlineSyncSeen,
            }))

          // Sitewide (offline_edit_queue, migration 054) rather than just
          // this device's own local outbox — admin should know about
          // pending edits queued on ANY device/account, not just the one
          // they happen to be looking at right now.
          const [sitewideRows, approvableRows] = await Promise.all([
            fetchSitewidePendingEdits().catch(() => []),
            fetchRemoteApprovableEdits().catch(() => []),
          ])
          // Not every staged edit can be approved from here — a row with no
          // decryptable payload (staged by a session with no encryption key
          // at the time) is metadata-only and view-only until re-reported by
          // a session that has the key. Call that out explicitly instead of
          // reporting one count while a different page (or this same click-
          // through) turns up fewer actionable rows.
          const sitewideEditCount = countDistinctSitewideEdits(sitewideRows)
          const approvableCount = countDistinctSitewideEdits(approvableRows)
          // One row per group (offline_edit_queue has a row per queued
          // mutation, e.g. an invoice's insert/link/payment/balance-update
          // share one group_id) so the per-actor breakdown counts edits, not
          // the raw mutation rows that compose them.
          const distinctSitewideRows = Array.from(
            new Map(sitewideRows.map((r) => [r.group_id ?? r.id, r])).values()
          )
          const outboxEntries: LiveEntry[] =
            sitewideEditCount > 0
              ? [
                  {
                    id: 'live-outbox-pending',
                    kind: 'ip',
                    title: 'Offline edits pending verification',
                    message: `${sitewideEditCount} offline edit${sitewideEditCount > 1 ? 's' : ''} staged clinic-wide${approvableCount < sitewideEditCount ? ` (${approvableCount} approvable now)` : ''} — ${summarizeByActor(distinctSitewideRows)}. Click to review in Admin → Offline Edits.`,
                    // Admins get the full sitewide audit log, deep-linked
                    // straight to the right tab instead of /offline-outbox
                    // (that page is the "my own edits" quick-action view).
                    linkTo: '/admin?tab=offline',
                    unread: true,
                  },
                ]
              : []

          setLiveEntries([...outboxEntries, ...offlineSyncEntries, ...leaveEntries, ...ipEntries, ...billingEntries])
        } else {
          const userId = getAppUser()?.id
          if (!userId) return
          const [rows, outboxList, remoteRows] = await Promise.all([
            listPendingIpRequestsForUser(userId).catch(() => []),
            getVisiblePendingMutations().catch(() => []),
            // RLS scopes this to the caller's own account for a non-admin —
            // same "your other devices" data /offline-outbox already shows,
            // so the bell shouldn't stay silent about an edit queued on a
            // phone while the doctor's looking at a desktop.
            fetchRemoteApprovableEdits().catch(() => []),
          ])
          if (cancelled) return
          const localIds = new Set(outboxList.map((m) => m.id))
          const remoteOnlyRows = remoteRows.filter((r) => !localIds.has(r.client_mutation_id))
          const localEditCount = countDistinctPendingEdits(outboxList)
          const remoteEditCount = countDistinctSitewideEdits(remoteOnlyRows)
          const totalEditCount = localEditCount + remoteEditCount
          const outboxMessage =
            remoteEditCount > 0
              ? `${totalEditCount} offline edit${totalEditCount > 1 ? 's' : ''} pending — ${localEditCount} on this device, ${remoteEditCount} on another. Click to verify & sync.`
              : `${localEditCount} offline edit${localEditCount > 1 ? 's' : ''} staged on your device. Click to verify & sync to server.`
          const outboxEntries: LiveEntry[] =
            totalEditCount > 0
              ? [
                  {
                    id: 'live-outbox-pending',
                    kind: 'ip',
                    title: 'Offline edits pending verification',
                    message: outboxMessage,
                    linkTo: '/offline-outbox',
                    unread: true,
                  },
                ]
              : []
          const userIpEntries: LiveEntry[] = rows.map((row) => ({
            id: `live-ip-${row.id}`,
            kind: 'ip',
            title: 'Access pending on another device',
            message: `Your login from IP ${row.ip} is waiting for admin approval.`,
            unread: true,
          }))
          setLiveEntries([...outboxEntries, ...userIpEntries])
        }
      } catch {
        // Best-effort — a failed poll must not break the bell.
      }
    }

    refreshLive()
    window.addEventListener('clinicmx_outbox_updated', refreshLive)
    const interval = setInterval(refreshLive, LIVE_POLL_MS)
    return () => {
      cancelled = true
      window.removeEventListener('clinicmx_outbox_updated', refreshLive)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev
      if (next) {
        // Optimistic local update so the dot clears immediately on this
        // device; the actual write is global (every device's unread state
        // clears too, on their next poll).
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        markAllRead()
        if (latestBillingIsoRef.current) {
          setBillingAlertsSeen(latestBillingIsoRef.current)
          setLiveEntries((prev) => prev.map((entry) => (entry.kind === 'billing' ? { ...entry, unread: false } : entry)))
        }
        if (latestOfflineSyncIsoRef.current) {
          setOfflineSyncAlertsSeen(latestOfflineSyncIsoRef.current)
          setLiveEntries((prev) => prev.map((entry) => (entry.kind === 'offlineSync' ? { ...entry, unread: false } : entry)))
        }
        // Fixed-position, computed from the button's actual on-screen rect
        // rather than a CSS anchor — the bell isn't the header's rightmost
        // icon (profile/logout follow it), so a plain `right-0` dropdown can
        // extend past the left edge of the viewport on narrow screens.
        const rect = buttonRef.current?.getBoundingClientRect()
        if (rect) {
          const margin = 8
          // Clamp width to what's actually left after the right offset, or a
          // right-aligned panel can still overflow past the left edge on a
          // narrow screen even though its right offset alone looks fine.
          const right = Math.max(margin, window.innerWidth - rect.right)
          const width = Math.min(320, window.innerWidth - right - margin)
          setPanelStyle({
            position: 'fixed',
            top: rect.bottom + margin,
            right,
            width,
          })
        }
      }
      return next
    })
  }

  const unread = notifications.filter((n) => !n.read).length + liveEntries.filter((n) => n.unread).length

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        aria-label="Notifications"
        onClick={handleToggle}
        className="icon-button p-2 hover:bg-gray-100 hover:shadow-elevation-low rounded-lg transition-all duration-150 relative"
      >
        <Bell className="w-5 h-5 text-text-secondary" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        )}
      </button>
      {open && (
        <div style={panelStyle} className="bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="px-4 py-2 border-b border-gray-100 text-sm font-semibold text-gray-900">
            Notifications
          </div>
          {notifications.length === 0 && liveEntries.length === 0 ? (
            <div className="px-4 py-6 text-sm text-text-secondary text-center">No notifications</div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {liveEntries.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 flex items-start gap-2 ${n.kind === 'billing' ? 'bg-blue-50/60' : n.kind === 'leave' ? 'bg-teal-50/60' : n.kind === 'offlineSync' ? 'bg-emerald-50/60' : 'bg-amber-50/60'} ${n.linkTo ? 'hover:bg-opacity-80 transition-colors cursor-pointer' : ''}`}
                  onClick={() => {
                    if (n.linkTo) {
                      setOpen(false)
                      navigate(n.linkTo)
                    }
                  }}
                >
                  {n.kind === 'billing' ? (
                    <Receipt className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  ) : n.kind === 'leave' ? (
                    <CalendarDays className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  ) : n.kind === 'offlineSync' ? (
                    <CloudOff className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Wifi className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{n.message}</p>
                  </div>
                </div>
              ))}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 flex items-start gap-2 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => {
                    if (n.linkTo) {
                      setOpen(false)
                      navigate(n.linkTo)
                    }
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <button
                    aria-label="Dismiss notification"
                    className="p-1 rounded hover:bg-gray-200 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      // Optimistic local removal; the actual delete is
                      // global so it disappears from every device too.
                      setNotifications((prev) => prev.filter((item) => item.id !== n.id))
                      dismissNotification(n.id)
                    }}
                  >
                    <X className="w-3.5 h-3.5 text-text-secondary" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
