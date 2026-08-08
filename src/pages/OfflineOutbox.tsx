import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Trash2,
  RefreshCw,
  WifiOff,
  Wifi,
  Stethoscope,
  Receipt,
  DollarSign,
  Calendar,
  Pill,
  AlertCircle,
  AlertTriangle,
  FileCheck2,
  Trash,
  User,
  Clock,
  Layers,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  getVisiblePendingMutations,
  discardMutation,
  clearVisiblePending,
  syncMutationById,
  syncGroup,
  syncVisiblePending,
  cleanUpOptimisticEntry,
  reportPendingToServer,
  reconcileOutboxWithServer,
  fetchRemoteApprovableEdits,
  syncRemoteMutation,
  syncRemoteGroup,
  discardRemoteMutation,
  type PendingMutation,
  type SitewidePendingRow,
} from '@/lib/offlineSync'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { formatAuditActor, getAppRole } from '@/lib/appSession'

interface DisplayGroup {
  key: string
  groupId: string | null
  items: PendingMutation[]
}

interface RemoteDisplayGroup {
  key: string
  groupId: string | null
  items: SitewidePendingRow[]
}

const DECRYPT_ERROR_COPY: Record<string, string> = {
  'no-key': 'Log in again on this device to approve this — the session that would decrypt it has expired.',
  'key-mismatch': 'This was encrypted with a previous app key and can\'t be approved here — approve it from the device that originally queued it.',
  corrupt: 'This edit\'s staged data is unreadable and can\'t be approved from here.',
}

export function OfflineOutbox() {
  const isOnline = useOnlineStatus()
  const [mutations, setMutations] = useState<PendingMutation[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingKey, setSyncingKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [remoteRows, setRemoteRows] = useState<SitewidePendingRow[]>([])
  const [remoteBusyKey, setRemoteBusyKey] = useState<string | null>(null)
  const [remoteErrors, setRemoteErrors] = useState<Record<string, string>>({})

  const isAdmin = getAppRole() === 'admin'

  async function loadMutations() {
    setLoading(true)
    try {
      setMutations(await getVisiblePendingMutations())
    } catch {
      setMutations([])
    } finally {
      setLoading(false)
    }
  }

  async function loadRemote() {
    setRemoteRows(await fetchRemoteApprovableEdits())
  }

  useEffect(() => {
    loadMutations()
    // Drop anything the server already knows is done elsewhere, then report
    // what's still ours before reading what other devices have staged.
    void reconcileOutboxWithServer().then(loadMutations)
    void reportPendingToServer().then(loadRemote)
    loadRemote()
    const handleUpdate = () => {
      loadMutations()
      loadRemote()
    }
    window.addEventListener('clinicmx_outbox_updated', handleUpdate)
    return () => window.removeEventListener('clinicmx_outbox_updated', handleUpdate)
  }, [])

  // Rows reported from a device other than this one — anything already in
  // this device's own outbox is excluded so it isn't shown (and approvable)
  // twice.
  const remoteGroups = useMemo<RemoteDisplayGroup[]>(() => {
    const localIds = new Set(mutations.map((m) => m.id))
    const byGroup = new Map<string, SitewidePendingRow[]>()
    const solo: RemoteDisplayGroup[] = []
    for (const row of remoteRows) {
      if (localIds.has(row.client_mutation_id)) continue
      if (row.group_id) {
        const arr = byGroup.get(row.group_id) || []
        arr.push(row)
        byGroup.set(row.group_id, arr)
      } else {
        solo.push({ key: row.id, groupId: null, items: [row] })
      }
    }
    const grouped: RemoteDisplayGroup[] = Array.from(byGroup.entries()).map(([groupId, items]) => ({
      key: groupId,
      groupId,
      items: items.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    }))
    return [...grouped, ...solo].sort(
      (a, b) => new Date(a.items[0].created_at).getTime() - new Date(b.items[0].created_at).getTime()
    )
  }, [remoteRows, mutations])

  const groups = useMemo<DisplayGroup[]>(() => {
    const byGroup = new Map<string, PendingMutation[]>()
    const solo: DisplayGroup[] = []
    for (const m of mutations) {
      if (m.groupId) {
        const arr = byGroup.get(m.groupId) || []
        arr.push(m)
        byGroup.set(m.groupId, arr)
      } else {
        solo.push({ key: m.id, groupId: null, items: [m] })
      }
    }
    const grouped: DisplayGroup[] = Array.from(byGroup.entries()).map(([groupId, items]) => ({
      key: groupId,
      groupId,
      items: items.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    }))
    return [...grouped, ...solo].sort(
      (a, b) => new Date(a.items[0].timestamp).getTime() - new Date(b.items[0].timestamp).getTime()
    )
  }, [mutations])

  async function handleSyncGroup(group: DisplayGroup) {
    if (!isOnline) {
      alert('You must be online to sync data to the server.')
      return
    }
    setSyncingKey(group.key)
    setActionError(null)
    try {
      if (group.groupId) {
        const { failed } = await syncGroup(group.groupId)
        if (failed > 0) setActionError(`Some items in this group failed to sync — see the error on the card below.`)
      } else {
        const ok = await syncMutationById(group.items[0].id)
        if (!ok) setActionError(`Failed to sync item (${group.items[0].table}) — see the error on the card below.`)
      }
      await loadMutations()
    } catch (err: any) {
      setActionError(`Failed to sync: ${err?.message || 'Server error'}`)
    } finally {
      setSyncingKey(null)
    }
  }

  async function handleDiscardGroup(group: DisplayGroup) {
    if (!confirm('Discard this offline edit? It will be deleted permanently and not sent to the server.')) return
    for (const mut of group.items) {
      const removed = await discardMutation(mut.id)
      if (removed) await cleanUpOptimisticEntry(removed)
    }
    await loadMutations()
  }

  async function handleSyncAll() {
    if (!isOnline) {
      alert('You must be online to sync data to the server.')
      return
    }
    setSyncingKey('__all__')
    setActionError(null)
    try {
      const { failed } = await syncVisiblePending()
      if (failed > 0) setActionError(`${failed} item(s) failed to sync — see the error on each card below.`)
      await loadMutations()
    } catch (err: any) {
      setActionError(`Failed to sync all items: ${err?.message || 'Server error'}`)
    } finally {
      setSyncingKey(null)
    }
  }

  async function handleClearAll() {
    if (!confirm(isAdmin ? 'Discard ALL offline pending edits across every account? This cannot be undone.' : 'Discard all of your offline pending edits? This cannot be undone.')) return
    const cleared = await clearVisiblePending()
    for (const mut of cleared) {
      await cleanUpOptimisticEntry(mut)
    }
    await loadMutations()
  }

  async function handleSyncRemoteGroup(group: RemoteDisplayGroup) {
    if (!isOnline) {
      alert('You must be online to sync data to the server.')
      return
    }
    setRemoteBusyKey(group.key)
    setRemoteErrors((prev) => ({ ...prev, [group.key]: '' }))
    try {
      if (group.groupId) {
        const { failed } = await syncRemoteGroup(group.groupId)
        if (failed > 0) setRemoteErrors((prev) => ({ ...prev, [group.key]: 'Some items in this group failed to sync.' }))
      } else {
        const { outcome, error } = await syncRemoteMutation(group.items[0])
        if (outcome !== 'ok' && outcome !== 'skipped') {
          setRemoteErrors((prev) => ({ ...prev, [group.key]: DECRYPT_ERROR_COPY[outcome] || error || 'Failed to sync.' }))
        }
      }
      await loadRemote()
      await loadMutations()
    } finally {
      setRemoteBusyKey(null)
    }
  }

  async function handleDiscardRemoteGroup(group: RemoteDisplayGroup) {
    if (!confirm('Discard this offline edit? It will be deleted permanently and not sent to the server.')) return
    for (const row of group.items) {
      await discardRemoteMutation(row.client_mutation_id)
    }
    await loadRemote()
  }

  function getTableIcon(table: string) {
    switch (table) {
      case 'treatments':
        return <Stethoscope className="w-5 h-5 text-emerald-600" />
      case 'invoices':
        return <Receipt className="w-5 h-5 text-blue-600" />
      case 'payments':
        return <DollarSign className="w-5 h-5 text-amber-600" />
      case 'patient_visits':
        return <Calendar className="w-5 h-5 text-purple-600" />
      case 'prescriptions':
        return <Pill className="w-5 h-5 text-rose-600" />
      default:
        return <FileCheck2 className="w-5 h-5 text-gray-600" />
    }
  }

  function actionBadgeClass(action: string) {
    if (action === 'insert') return 'bg-emerald-100 text-emerald-700'
    if (action === 'delete') return 'bg-rose-100 text-rose-700'
    return 'bg-blue-100 text-blue-700'
  }

  const anyBusy = syncingKey !== null

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-elevation-md border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">Verify Offline Edits</h1>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {isOnline ? 'Online (ready to sync)' : 'Offline (staged locally)'}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            Nothing here uploads automatically. Review each offline edit and press Approve &amp; Sync — or Approve &amp;
            Sync All — when you're ready to send it to the server.{' '}
            {isAdmin
              ? "As admin, you're seeing and can act on offline edits from every account, on this device and any other."
              : "Only your own account's offline edits are shown here — including ones queued on your other devices — plus an admin can review and sync any account's."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={handleClearAll}
            disabled={mutations.length === 0 || anyBusy}
            className="text-rose-600 border-rose-200 hover:bg-rose-50"
          >
            <Trash className="w-4 h-4 mr-2" />
            Clear All Drafts
          </Button>

          <Button
            variant="primary"
            onClick={handleSyncAll}
            disabled={!isOnline || mutations.length === 0 || anyBusy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncingKey === '__all__' ? 'animate-spin' : ''}`} />
            {syncingKey === '__all__' ? 'Syncing...' : 'Approve & Sync All'}
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-text-secondary">Loading offline outbox items...</p>
        </div>
      ) : groups.length === 0 && remoteGroups.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-text-primary">All Offline Edits Verified &amp; Synced</h3>
          <p className="text-sm text-text-secondary max-w-md mx-auto">
            There are no pending offline edits waiting for review. Anything created while offline will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.length > 0 && (
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
              Pending Drafts ({groups.length})
            </h2>
          </div>
          )}

          {groups.length > 0 && (
          <div className="grid gap-4">
            {groups.map((group) => {
              const first = group.items[0]
              const hasBlocked = group.items.some((m) => m.status === 'blocked')
              const failedItem = group.items.find((m) => m.status === 'failed' || m.lastError)
              const isGroupSyncing = syncingKey === group.key || syncingKey === '__all__'

              return (
                <div
                  key={group.key}
                  className="bg-white rounded-2xl p-5 border border-gray-100 shadow-elevation-low hover:shadow-elevation-md transition-all flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-gray-50 rounded-xl flex-shrink-0">
                        {group.groupId ? <Layers className="w-5 h-5 text-primary" /> : getTableIcon(first.table)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-text-primary">{first.meta.label}</span>
                          {group.items.length > 1 && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                              {group.items.length} steps
                            </span>
                          )}
                          {!group.groupId && (
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${actionBadgeClass(first.action)}`}>
                              {first.action}
                            </span>
                          )}
                        </div>
                        {(first.meta.patientName || first.meta.detail) && (
                          <p className="text-xs font-medium text-text-secondary pt-0.5">
                            {first.meta.patientName}
                            {first.meta.patientName && first.meta.detail ? ' · ' : ''}
                            {first.meta.detail}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-text-muted pt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(first.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary px-3 py-1.5 rounded-xl border border-primary/10">
                      <User className="w-3.5 h-3.5 text-primary" />
                      <span>
                        Created by: <strong>{formatAuditActor(first.actor || 'doctor')}</strong>
                      </span>
                    </div>
                  </div>

                  {group.items.length > 1 && (
                    <div className="grid gap-1.5 text-xs text-text-secondary">
                      {group.items.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 flex-wrap">
                          {getTableIcon(m.table)}
                          <span className="flex-1 min-w-[8rem]">
                            {m.meta.label}
                            {m.meta.detail ? <span className="text-text-muted"> · {m.meta.detail}</span> : null}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${actionBadgeClass(m.action)}`}>
                            {m.action}
                          </span>
                          {m.status === 'blocked' && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                              blocked
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {failedItem?.lastError && (
                    <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          {failedItem.status === 'failed'
                            ? `Failed after ${failedItem.attempts} attempts — retry manually below.`
                            : `Sync error (attempt ${failedItem.attempts}):`}
                        </p>
                        <p className="font-mono">{failedItem.lastError}</p>
                      </div>
                    </div>
                  )}

                  {hasBlocked && !failedItem && (
                    <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>An earlier step in this group failed, so the rest is on hold. Retry to try the whole group again.</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 border-t pt-3 border-gray-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDiscardGroup(group)}
                      disabled={anyBusy}
                      className="text-rose-600 hover:bg-rose-50 border-rose-200"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Discard
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!isOnline || anyBusy}
                      onClick={() => handleSyncGroup(group)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <RefreshCw className={`w-4 h-4 mr-1.5 ${isGroupSyncing ? 'animate-spin' : ''}`} />
                      Approve & Sync
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
          )}

          {remoteGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
                  Pending on your other devices ({remoteGroups.length})
                </h2>
              </div>

              <div className="grid gap-4">
                {remoteGroups.map((group) => {
                  const first = group.items[0]
                  const hasBlocked = group.items.some((m) => m.status === 'blocked')
                  const failedItem = group.items.find((m) => m.status === 'failed' || m.last_error)
                  const isGroupSyncing = remoteBusyKey === group.key
                  const groupError = remoteErrors[group.key]

                  return (
                    <div
                      key={group.key}
                      className="bg-white rounded-2xl p-5 border border-dashed border-gray-200 shadow-elevation-low hover:shadow-elevation-md transition-all flex flex-col gap-4"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-gray-50 rounded-xl flex-shrink-0">
                            {group.groupId ? <Layers className="w-5 h-5 text-primary" /> : <Smartphone className="w-5 h-5 text-gray-500" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-text-primary">{first.meta.label}</span>
                              {group.items.length > 1 && (
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                                  {group.items.length} steps
                                </span>
                              )}
                            </div>
                            {(first.meta.patientName || first.meta.detail) && (
                              <p className="text-xs font-medium text-text-secondary pt-0.5">
                                {first.meta.patientName}
                                {first.meta.patientName && first.meta.detail ? ' · ' : ''}
                                {first.meta.detail}
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 text-xs text-text-muted pt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>{new Date(first.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary px-3 py-1.5 rounded-xl border border-primary/10">
                          <User className="w-3.5 h-3.5 text-primary" />
                          <span>
                            Created by: <strong>{formatAuditActor(first.actor || 'doctor')}</strong>
                          </span>
                        </div>
                      </div>

                      {hasBlocked && !failedItem && (
                        <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span>An earlier step in this group failed, so the rest is on hold.</span>
                        </div>
                      )}

                      {groupError && (
                        <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{groupError}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 border-t pt-3 border-gray-100">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDiscardRemoteGroup(group)}
                          disabled={remoteBusyKey !== null}
                          className="text-rose-600 hover:bg-rose-50 border-rose-200"
                        >
                          <Trash2 className="w-4 h-4 mr-1.5" />
                          Discard
                        </Button>

                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!isOnline || remoteBusyKey !== null}
                          onClick={() => handleSyncRemoteGroup(group)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <RefreshCw className={`w-4 h-4 mr-1.5 ${isGroupSyncing ? 'animate-spin' : ''}`} />
                          Approve & Sync
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-text-muted px-1">
                Queued on a different device tied to your account (or, for admin, any account) and now approvable from
                here — the payload is encrypted at rest and only decryptable while logged in.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
