import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Bell, Wifi, X } from 'lucide-react'
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  dismissNotification,
  subscribeToNotifications,
  type AppNotification,
} from '@/lib/notifications'
import { getAppRole, getAppUser } from '@/lib/appSession'
import { countPendingIpRequests, listPendingIpRequestsForUser } from '@/lib/ipAccess'

/** Synthetic, never-persisted entry derived live from Supabase (network
 * access status) — always identical across every device since it's read
 * fresh from the database, unlike the stored list which is per-browser. */
interface LiveEntry {
  id: string
  title: string
  message: string
  linkTo?: string
}

const LIVE_POLL_MS = 20000

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getNotifications())
  const [unreadCount, setUnreadCount] = useState(() => getUnreadCount())
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([])
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const refresh = () => {
      setNotifications(getNotifications())
      setUnreadCount(getUnreadCount())
    }
    return subscribeToNotifications(refresh)
  }, [])

  useEffect(() => {
    const role = getAppRole()
    if (role !== 'admin' && role !== 'doctor' && role !== 'operator') return

    let cancelled = false
    const refreshLive = async () => {
      try {
        if (role === 'admin') {
          const count = await countPendingIpRequests()
          if (cancelled) return
          setLiveEntries(
            count > 0
              ? [
                  {
                    id: 'live-ip-admin',
                    title: 'Network access pending',
                    message: `${count} network access request${count > 1 ? 's' : ''} waiting for your approval.`,
                    linkTo: '/doctor-profile',
                  },
                ]
              : []
          )
        } else {
          const userId = getAppUser()?.id
          if (!userId) return
          const rows = await listPendingIpRequestsForUser(userId)
          if (cancelled) return
          setLiveEntries(
            rows.map((row) => ({
              id: `live-ip-${row.id}`,
              title: 'Access pending on another device',
              message: `Your login from IP ${row.ip} is waiting for admin approval.`,
            }))
          )
        }
      } catch {
        // Best-effort — a failed poll must not break the bell.
      }
    }

    refreshLive()
    const interval = setInterval(refreshLive, LIVE_POLL_MS)
    return () => {
      cancelled = true
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
        markAllRead()
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

  const unread = unreadCount + liveEntries.length

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
                  className={`px-4 py-3 flex items-start gap-2 bg-amber-50/60 ${n.linkTo ? 'hover:bg-amber-50 transition-colors cursor-pointer' : ''}`}
                  onClick={() => {
                    if (n.linkTo) {
                      setOpen(false)
                      navigate(n.linkTo)
                    }
                  }}
                >
                  <Wifi className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
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
