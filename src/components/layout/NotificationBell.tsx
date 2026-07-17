import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Bell, X } from 'lucide-react'
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  dismissNotification,
  subscribeToNotifications,
  type AppNotification,
} from '@/lib/notifications'

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getNotifications())
  const [unreadCount, setUnreadCount] = useState(() => getUnreadCount())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refresh = () => {
      setNotifications(getNotifications())
      setUnreadCount(getUnreadCount())
    }
    return subscribeToNotifications(refresh)
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
      if (next) markAllRead()
      return next
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Notifications"
        onClick={handleToggle}
        className="icon-button p-2 hover:bg-gray-100 hover:shadow-elevation-low rounded-lg transition-all duration-150 relative"
      >
        <Bell className="w-5 h-5 text-text-secondary" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="px-4 py-2 border-b border-gray-100 text-sm font-semibold text-gray-900">
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-sm text-text-secondary text-center">No notifications</div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
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
