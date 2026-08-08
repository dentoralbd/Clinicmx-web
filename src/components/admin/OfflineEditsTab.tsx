import { useEffect, useMemo, useState } from 'react'
import { CloudOff, RefreshCw, Trash2, ChevronDown, ChevronUp, Clock, User, AlertTriangle, Layers, Wifi, WifiOff, Smartphone, CheckCircle2 } from 'lucide-react'
import { SnapshotDetails } from '@/components/SnapshotDetails'
import {
  getVisiblePendingMutations,
  discardMutation,
  clearVisiblePending,
  syncMutationById,
  syncGroup,
  syncVisiblePending,
  cleanUpOptimisticEntry,
  reportPendingToServer,
  fetchSitewidePendingEdits,
  listRecentOfflineSyncAlerts,
  syncRemoteMutation,
  syncRemoteGroup,
  discardRemoteMutation,
  type PendingMutation,
  type SitewidePendingRow,
  type OfflineSyncAlertRow,
} from '@/lib/offlineSync'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { formatAuditActor } from '@/lib/appSession'

/**
 * Admin-only audit log of every offline edit staged on this device, across
 * every account — deliberately built as its own detail-first log (styled
 * after Delete History / Edit History: filter chips, collapsed rows that
 * expand to the full record, action in the expanded panel) rather than
 * reusing the compact action-card view at /offline-outbox. That page stays
 * scoped to "my own edits, act on them quickly"; this one is "see and audit
 * everything, with full detail, across the whole clinic."
 */

const TABLE_LABELS: Record<string, string> = {
  treatments: 'Treatment',
  invoices: 'Invoice',
  payments: 'Payment',
  patient_visits: 'Visit',
  prescriptions: 'Prescription',
  patients: 'Patient',
  delete_history: 'Delete Audit Log',
  edit_history: 'Edit Audit Log',
}

const ACTION_LABELS: Record<string, string> = {
  insert: 'Created',
  update: 'Updated',
  update_many: 'Bulk updated',
  delete: 'Deleted',
}

type EditsFilter = 'all' | 'treatments' | 'invoices' | 'payments' | 'patient_visits' | 'prescriptions' | 'audit'

const EDITS_FILTERS: Array<{ value: EditsFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'treatments', label: 'Treatments' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'payments', label: 'Payments' },
  { value: 'patient_visits', label: 'Visits' },
  { value: 'prescriptions', label: 'Prescriptions' },
  { value: 'audit', label: 'Audit Logs' },
]

const DECRYPT_ERROR_COPY: Record<string, string> = {
  'no-key': 'Log in again on this device to decrypt and approve this.',
  'key-mismatch': 'Encrypted with a previous app key — can\'t be approved here; approve from the device that originally queued it.',
  corrupt: 'This edit\'s staged data is unreadable and can\'t be approved from here.',
}

function matchesFilter(mut: PendingMutation, filter: EditsFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'audit') return mut.table === 'delete_history' || mut.table === 'edit_history'
  return mut.table === filter
}

interface LogRow {
  key: string
  groupId: string | null
  items: PendingMutation[]
}

function MutationPayloadDetails({ mut }: { mut: PendingMutation }) {
  if (mut.action === 'update_many') {
    const { ids, fields } = (mut.payload || {}) as { ids?: string[]; fields?: Record<string, unknown> }
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">Applied to {ids?.length ?? 0} record(s)</p>
        <SnapshotDetails payload={fields} />
      </div>
    )
  }
  if (Array.isArray(mut.payload)) {
    return (
      <div className="space-y-3">
        {mut.payload.map((item, idx) => (
          <div key={idx} className="border-t border-gray-200 pt-2 first:border-t-0 first:pt-0">
            <SnapshotDetails payload={item} />
          </div>
        ))}
      </div>
    )
  }
  return <SnapshotDetails payload={mut.payload} />
}

export function OfflineEditsTab() {
  const isOnline = useOnlineStatus()
  const [mutations, setMutations] = useState<PendingMutation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<EditsFilter>('all')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [remoteRows, setRemoteRows] = useState<SitewidePendingRow[]>([])
  const [syncedRows, setSyncedRows] = useState<OfflineSyncAlertRow[]>([])
  const [remoteBusyKey, setRemoteBusyKey] = useState<string | null>(null)
  const [remoteErrors, setRemoteErrors] = useState<Record<string, string>>({})

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
    setRemoteRows(await fetchSitewidePendingEdits())
  }

  async function loadSynced() {
    setSyncedRows(await listRecentOfflineSyncAlerts())
  }

  useEffect(() => {
    loadMutations()
    // Push this device's own queued edits up (in case they haven't been
    // reported yet) before reading the sitewide list — best-effort, doesn't
    // block the local list from showing immediately.
    void reportPendingToServer().then(loadRemote)
    loadRemote()
    loadSynced()
    const handleUpdate = () => {
      loadMutations()
      loadRemote()
      // A sync just happened somewhere — reportSyncedForReview() is
      // fire-and-forget, so give its insert a moment to land before refetching.
      setTimeout(loadSynced, 1200)
    }
    window.addEventListener('clinicmx_outbox_updated', handleUpdate)
    return () => window.removeEventListener('clinicmx_outbox_updated', handleUpdate)
  }, [])

  // Rows reported from a device other than this one — everything this
  // device already has locally is excluded so nothing shows twice.
  const remoteOnlyGroups = useMemo(() => {
    const localIds = new Set(mutations.map((m) => m.id))
    const byGroup = new Map<string, SitewidePendingRow[]>()
    const solo: SitewidePendingRow[][] = []
    for (const row of remoteRows) {
      if (localIds.has(row.client_mutation_id)) continue
      if (!matchesFilter({ table: row.table_name } as PendingMutation, filter)) continue
      if (row.group_id) {
        const arr = byGroup.get(row.group_id) || []
        arr.push(row)
        byGroup.set(row.group_id, arr)
      } else {
        solo.push([row])
      }
    }
    return [...Array.from(byGroup.values()), ...solo]
      .map((items) => items.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)))
      .sort((a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime())
  }, [remoteRows, mutations, filter])

  const rows = useMemo<LogRow[]>(() => {
    const byGroup = new Map<string, PendingMutation[]>()
    const solo: LogRow[] = []
    for (const m of mutations) {
      if (m.groupId) {
        const arr = byGroup.get(m.groupId) || []
        arr.push(m)
        byGroup.set(m.groupId, arr)
      } else {
        solo.push({ key: m.id, groupId: null, items: [m] })
      }
    }
    const grouped: LogRow[] = Array.from(byGroup.entries()).map(([groupId, items]) => ({
      key: groupId,
      groupId,
      items: items.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    }))
    return [...grouped, ...solo]
      .filter((row) => row.items.some((m) => matchesFilter(m, filter)))
      .sort((a, b) => new Date(b.items[0].timestamp).getTime() - new Date(a.items[0].timestamp).getTime())
  }, [mutations, filter])

  async function handleDiscard(row: LogRow) {
    if (!confirm('Discard this offline edit? It will be deleted permanently and never reach the server.')) return
    for (const mut of row.items) {
      const removed = await discardMutation(mut.id)
      if (removed) cleanUpOptimisticEntry(removed)
    }
    await loadMutations()
  }

  async function handleSync(row: LogRow) {
    if (!isOnline) {
      alert('You must be online to sync data to the server.')
      return
    }
    setBusyKey(row.key)
    setActionError(null)
    try {
      if (row.groupId) {
        const { failed, deferred } = await syncGroup(row.groupId)
        if (failed > 0 || deferred > 0) setActionError('Part of this group was not sent — see the note below.')
      } else {
        const ok = await syncMutationById(row.items[0].id)
        if (!ok) setActionError('Failed to sync this item — see the error below.')
      }
      await loadMutations()
    } catch (err: any) {
      setActionError(`Failed to sync: ${err?.message || 'Server error'}`)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSyncAll() {
    if (!isOnline) {
      alert('You must be online to sync data to the server.')
      return
    }
    setBusyKey('__all__')
    setActionError(null)
    try {
      const { failed, deferred } = await syncVisiblePending()
      if (failed > 0 || deferred > 0) setActionError(`${failed + deferred} item(s) were not sent — expand a row to see the note.`)
      await loadMutations()
    } catch (err: any) {
      setActionError(`Failed to sync all: ${err?.message || 'Server error'}`)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleClearAll() {
    if (!confirm('Discard every offline edit on this device, across every account? This cannot be undone.')) return
    const cleared = await clearVisiblePending()
    for (const mut of cleared) cleanUpOptimisticEntry(mut)
    await loadMutations()
  }

  function remoteKeyFor(items: SitewidePendingRow[]): string {
    return items[0].group_id || items[0].id
  }

  async function handleSyncRemote(items: SitewidePendingRow[]) {
    if (!isOnline) {
      alert('You must be online to sync data to the server.')
      return
    }
    const key = remoteKeyFor(items)
    setRemoteBusyKey(key)
    setRemoteErrors((prev) => ({ ...prev, [key]: '' }))
    try {
      if (items[0].group_id) {
        const { failed } = await syncRemoteGroup(items[0].group_id)
        if (failed > 0) setRemoteErrors((prev) => ({ ...prev, [key]: 'Some items in this group failed to sync.' }))
      } else {
        const { outcome, error } = await syncRemoteMutation(items[0])
        if (outcome !== 'ok' && outcome !== 'skipped') {
          setRemoteErrors((prev) => ({ ...prev, [key]: DECRYPT_ERROR_COPY[outcome] || error || 'Failed to sync.' }))
        }
      }
      await loadRemote()
      await loadMutations()
    } finally {
      setRemoteBusyKey(null)
    }
  }

  async function handleDiscardRemote(items: SitewidePendingRow[]) {
    if (!confirm('Discard this offline edit? It will be deleted permanently and never reach the server.')) return
    for (const row of items) await discardRemoteMutation(row.client_mutation_id)
    await loadRemote()
  }

  const anyBusy = busyKey !== null

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <CloudOff className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-800">Offline Edits</h2>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-xs text-gray-400">Every offline edit, from every account and every device, with full detail — for audit and approval. Edits queued on this device can be approved here; edits from other devices show for review only.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={mutations.length === 0 || anyBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
          <button
            type="button"
            onClick={handleSyncAll}
            disabled={!isOnline || mutations.length === 0 || anyBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busyKey === '__all__' ? 'animate-spin' : ''}`} />
            Approve &amp; Sync All
          </button>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {EDITS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f.value
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-text-secondary border-gray-200 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading offline edits…</p>
      ) : rows.length === 0 && remoteOnlyGroups.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          {filter === 'all' ? 'No offline edits staged anywhere.' : 'No offline edits in this category.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-2 px-1">Nothing on this device — see below for what's pending elsewhere.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map((row) => {
            const isExpanded = expandedKey === row.key
            const first = row.items[0]
            const failedItem = row.items.find((m) => m.status === 'failed' || m.lastError)
            const hasBlocked = row.items.some((m) => m.status === 'blocked')
            const rowLabel = row.groupId
              ? `${first.meta.label}`
              : `${TABLE_LABELS[first.table] || first.table}${first.meta.label ? `: ${first.meta.label}` : ''}`

            return (
              <div key={row.key} className="py-3">
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : row.key)}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {row.groupId ? <Layers className="w-4 h-4 text-primary flex-shrink-0" /> : <CloudOff className="w-4 h-4 text-teal-500 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {rowLabel}
                        {row.items.length > 1 && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-primary">{row.items.length} steps</span>
                        )}
                      </p>
                      {(first.meta.patientName || first.meta.detail) && (
                        <p className="text-xs font-medium text-gray-600 truncate">
                          {first.meta.patientName}
                          {first.meta.patientName && first.meta.detail ? ' · ' : ''}
                          {first.meta.detail}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 truncate">
                        {format_(first.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                      <User className="w-3 h-3 mr-1" />
                      {formatAuditActor(first.actor || 'doctor')}
                    </span>
                    {failedItem && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" />
                        {failedItem.status === 'failed' ? 'Failed' : 'Error'}
                      </span>
                    )}
                    {hasBlocked && !failedItem && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        Blocked
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                    {row.items.map((mut) => (
                      <div key={mut.id} className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                          <Clock className="w-3 h-3" />
                          <span>{TABLE_LABELS[mut.table] || mut.table} — {ACTION_LABELS[mut.action] || mut.action}</span>
                          <span className="text-gray-400 font-normal">· {format_(mut.timestamp)}</span>
                        </div>
                        <MutationPayloadDetails mut={mut} />
                        {mut.lastError && (
                          <p className="text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            Attempt {mut.attempts}: {mut.lastError}
                          </p>
                        )}
                      </div>
                    ))}

                    <div className="pt-2 border-t border-gray-200 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSync(row)}
                        disabled={!isOnline || anyBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${busyKey === row.key ? 'animate-spin' : ''}`} />
                        {busyKey === row.key ? 'Syncing…' : 'Approve & Sync'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscard(row)}
                        disabled={anyBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {remoteOnlyGroups.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">
            Pending on other devices ({remoteOnlyGroups.length})
          </h3>
          <div className="divide-y divide-gray-100">
            {remoteOnlyGroups.map((items) => {
              const first = items[0]
              const key = remoteKeyFor(items)
              const rowError = remoteErrors[key]
              const isRowBusy = remoteBusyKey === key
              return (
                <div key={key} className="py-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <Smartphone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700 truncate">
                        {first.meta.label}
                        {items.length > 1 && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-gray-400">{items.length} steps</span>
                        )}
                      </p>
                      {(first.meta.patientName || first.meta.detail) && (
                        <p className="text-xs text-gray-500 truncate">
                          {first.meta.patientName}
                          {first.meta.patientName && first.meta.detail ? ' · ' : ''}
                          {first.meta.detail}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">{format_(first.created_at)}</p>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 flex-shrink-0">
                      <User className="w-3 h-3 mr-1" />
                      {formatAuditActor(first.actor || 'doctor')}
                    </span>
                    {first.status !== 'pending' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
                        {first.status}
                      </span>
                    )}
                  </div>

                  {rowError && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 ml-7">{rowError}</p>
                  )}

                  {first.payload_encrypted ? (
                    <div className="flex items-center gap-2 ml-7">
                      <button
                        type="button"
                        onClick={() => handleSyncRemote(items)}
                        disabled={!isOnline || remoteBusyKey !== null}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRowBusy ? 'animate-spin' : ''}`} />
                        Approve &amp; Sync
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscardRemote(items)}
                        disabled={remoteBusyKey !== null}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Discard
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400 ml-7">No staged payload yet — not approvable from here.</p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 px-1">
            Staged on a different device, encrypted at rest — approvable from here (or the originating device) once it
            carries a payload.
          </p>
        </div>
      )}

      {syncedRows.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">
            Recently Synced — last 7 days ({syncedRows.length})
          </h3>
          <div className="divide-y divide-gray-100">
            {syncedRows.map((row) => (
              <div key={row.id} className="py-3 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {ENTITY_LABELS[row.entity_type] || row.entity_type}
                    {row.entity_label ? `: ${row.entity_label}` : ''}
                  </p>
                  {(row.patient_name || row.details) && (
                    <p className="text-xs text-gray-500 truncate">
                      {row.patient_name}
                      {row.patient_name && row.details ? ' · ' : ''}
                      {row.details?.replace(/^\[Offline Sync\]\s*/, '')}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">{format_(row.occurred_at)}</p>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
                  <User className="w-3 h-3 mr-1" />
                  {formatAuditActor(row.actor || 'doctor')}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 px-1">
            Approved &amp; synced to the server — who originally made the edit while offline, not who pressed Approve.
          </p>
        </div>
      )}
    </div>
  )
}

const ENTITY_LABELS: Record<string, string> = {
  treatment: 'Treatment',
  invoice: 'Invoice',
  payment: 'Payment',
  patient_visit: 'Visit',
  prescription: 'Prescription',
  patient: 'Patient',
}

function format_(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
