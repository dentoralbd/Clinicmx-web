import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Check, Wifi, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { listAppUsers } from '@/lib/appUsers'
import {
  MAX_APPROVED_IPS_PER_USER,
  approveIp,
  denyIp,
  listAuthorizedIps,
  removeIp,
  type AuthorizedIpRow,
} from '@/lib/ipAccess'

interface AccessRequestsTabProps {
  /** Reports the pending-request count so the Admin zone tab badge stays current. */
  onPendingCountChange?: (count: number) => void
}

export function AccessRequestsTab({ onPendingCountChange }: AccessRequestsTabProps) {
  const [rows, setRows] = useState<AuthorizedIpRow[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ipRows, users] = await Promise.all([listAuthorizedIps(), listAppUsers()])
      setRows(ipRows)
      setUserNames(Object.fromEntries(users.map((u) => [u.id, u.full_name])))
      onPendingCountChange?.(ipRows.filter((r) => r.status === 'pending').length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load network access list.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function nameOf(row: AuthorizedIpRow) {
    return userNames[row.user_id] ?? row.requested_by ?? 'Unknown user'
  }

  async function runAction(row: AuthorizedIpRow, action: (r: AuthorizedIpRow, name?: string) => Promise<void>) {
    setBusyId(row.id)
    setError(null)
    try {
      await action(row, userNames[row.user_id])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  const pending = rows.filter((r) => r.status === 'pending')
  const approved = rows.filter((r) => r.status === 'approved')
  const denied = rows.filter((r) => r.status === 'denied')

  // Approved IPs grouped per user, newest decision first.
  const approvedByUser = new Map<string, AuthorizedIpRow[]>()
  for (const row of approved) {
    const list = approvedByUser.get(row.user_id) ?? []
    list.push(row)
    approvedByUser.set(row.user_id, list)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 sm:p-5 border-b border-gray-100">
        <h2 className="font-semibold flex items-center gap-2">
          <Wifi className="w-4 h-4 text-primary" />
          Network Access
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Doctors and operators can log in only from networks you approve (up to{' '}
          {MAX_APPROVED_IPS_PER_USER} per user, oldest replaced). Everyone on the clinic WiFi shows
          the same IP, but each user still needs their own approval for it.
        </p>
      </div>

      {error && <p className="p-4 text-sm text-red-600">{error}</p>}

      {/* Pending requests */}
      <div className="p-4 sm:p-5 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Pending requests{pending.length > 0 ? ` (${pending.length})` : ''}
        </h3>
        {pending.length === 0 && !loading && (
          <p className="text-sm text-gray-400">No pending requests.</p>
        )}
        <div className="space-y-2">
          {pending.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-2 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{nameOf(row)}</p>
                <p className="text-xs text-text-secondary">
                  IP {row.ip} · {format(new Date(row.requested_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => runAction(row, approveIp)}
                  disabled={busyId === row.id}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(row, denyIp)}
                  disabled={busyId === row.id}
                >
                  <X className="w-4 h-4 mr-1" />
                  Deny
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approved networks per user */}
      <div className="p-4 sm:p-5 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Approved networks</h3>
        {approvedByUser.size === 0 && !loading && (
          <p className="text-sm text-gray-400">No approved networks yet.</p>
        )}
        <div className="space-y-3">
          {Array.from(approvedByUser.entries()).map(([userId, userRows]) => (
            <div key={userId}>
              <p className="text-xs font-medium text-gray-500 mb-1">
                {userNames[userId] ?? 'Unknown user'} ({userRows.length}/{MAX_APPROVED_IPS_PER_USER})
              </p>
              <div className="space-y-1">
                {userRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{row.ip}</span>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {row.decided_at ? format(new Date(row.decided_at), 'MMM d, yyyy') : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove ${row.ip} for ${nameOf(row)}? They will need a new approval to log in from it.`)) {
                          runAction(row, removeIp)
                        }
                      }}
                      disabled={busyId === row.id}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Denied */}
      {denied.length > 0 && (
        <div className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Denied ({denied.length})</h3>
          <div className="space-y-1">
            {denied.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-1.5"
              >
                <span className="text-sm text-gray-500 flex-1 min-w-0 truncate">
                  {nameOf(row)} · {row.ip}
                </span>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                  {row.decided_at ? format(new Date(row.decided_at), 'MMM d, yyyy') : ''}
                </span>
                <button
                  type="button"
                  onClick={() => runAction(row, removeIp)}
                  disabled={busyId === row.id}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  Clear
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Clearing a denied entry lets that user request access from the network again.
          </p>
        </div>
      )}

      {loading && <div className="p-4 text-center text-sm text-gray-400">Loading…</div>}
    </div>
  )
}
