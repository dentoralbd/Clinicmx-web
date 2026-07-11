import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatAuditActor } from '@/lib/appSession'
import {
  ACTIVITY_PAGE_SIZE,
  listActivityLog,
  type ActivityAction,
  type ActivityLogRow,
} from '@/lib/activityLog'

type ActionFilter = ActivityAction | 'all'

const ACTION_FILTERS: Array<{ value: ActionFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'create', label: 'Entry' },
  { value: 'edit', label: 'Edit' },
  { value: 'delete', label: 'Delete' },
  { value: 'restore', label: 'Restore' },
  { value: 'revert', label: 'Revert' },
  { value: 'login', label: 'Login' },
]

const ACTION_BADGES: Record<ActivityAction, { label: string; className: string }> = {
  create: { label: 'Entry', className: 'bg-green-100 text-green-700' },
  edit: { label: 'Edit', className: 'bg-blue-100 text-blue-700' },
  delete: { label: 'Delete', className: 'bg-red-100 text-red-700' },
  restore: { label: 'Restore', className: 'bg-emerald-100 text-emerald-700' },
  revert: { label: 'Revert', className: 'bg-amber-100 text-amber-700' },
  login: { label: 'Login', className: 'bg-violet-100 text-violet-700' },
}

const ENTITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'patient', label: 'Patients' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'treatment', label: 'Treatments' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'payment', label: 'Payments' },
  { value: 'patient_visit', label: 'Visits' },
  { value: 'patient_file', label: 'Patient Files' },
  { value: 'inventory_item', label: 'Inventory' },
  { value: 'doctor_profile', label: 'Clinic Profile' },
  { value: 'app_user', label: 'User Accounts' },
  { value: 'session', label: 'Login Sessions' },
]

const ENTITY_LABELS: Record<string, string> = Object.fromEntries(
  ENTITY_OPTIONS.filter((option) => option.value !== 'all').map((option) => [
    option.value,
    option.label.replace(/s$/, ''),
  ])
)

function entityLabelOf(entityType: string) {
  return ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, ' ')
}

export function ActivityLogTab() {
  const [rows, setRows] = useState<ActivityLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)

  async function load(nextPage: number, action: ActionFilter, entityType: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await listActivityLog(nextPage, { action, entityType })
      setRows((prev) => (nextPage === 0 ? data : [...prev, ...data]))
      setPage(nextPage)
      setHasMore(data.length === ACTIVITY_PAGE_SIZE)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity log.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(0, actionFilter, entityFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, entityFilter])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 sm:p-5 border-b border-gray-100">
        <h2 className="font-semibold flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" />
          Activity Log
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Every entry, change, delete and login — with who did it
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {ACTION_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setActionFilter(filter.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                actionFilter === filter.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="ml-auto px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {ENTITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="p-4 text-sm text-red-600">{error}</p>}

      {!error && rows.length === 0 && !loading && (
        <div className="p-8 text-center text-sm text-gray-400">No activity recorded yet.</div>
      )}

      <div className="divide-y divide-gray-100">
        {rows.map((row) => {
          const badge = ACTION_BADGES[row.action] ?? ACTION_BADGES.edit
          return (
            <div key={row.id} className="px-4 sm:px-5 py-3 flex items-start gap-3">
              <span
                className={`mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${badge.className}`}
              >
                {badge.label}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-medium text-gray-900">
                    {entityLabelOf(row.entity_type)}
                    {row.entity_label ? `: ${row.entity_label}` : ''}
                  </span>
                  {row.patient_name && (
                    <span className="text-text-secondary">· {row.patient_name}</span>
                  )}
                </div>
                {(row.details || (row.action === 'login' && !row.ip)) && (
                  <p className="text-xs text-text-secondary mt-0.5">
                    {row.details}
                    {row.action === 'login' && !row.ip ? 'IP unavailable' : ''}
                  </p>
                )}
                {row.action === 'login' && row.ip && (
                  <p className="text-xs text-text-secondary mt-0.5">IP: {row.ip}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">
                  {formatAuditActor(row.actor)}
                </span>
                <p className="text-[11px] text-gray-400 mt-1 whitespace-nowrap">
                  {format(new Date(row.occurred_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {loading && <div className="p-4 text-center text-sm text-gray-400">Loading…</div>}

      {!loading && hasMore && rows.length > 0 && (
        <div className="p-4 text-center border-t border-gray-100">
          <Button variant="outline" size="sm" onClick={() => load(page + 1, actionFilter, entityFilter)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
