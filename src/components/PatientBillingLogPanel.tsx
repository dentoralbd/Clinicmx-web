import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatAuditActor } from '@/lib/appSession'
import { PATIENT_LOG_PAGE_SIZE, listPatientBillingLog, type ActivityAction, type ActivityLogRow } from '@/lib/activityLog'

const ACTION_BADGES: Record<ActivityAction, { label: string; className: string }> = {
  create: { label: 'Entry', className: 'bg-green-100 text-green-700' },
  edit: { label: 'Edit', className: 'bg-blue-100 text-blue-700' },
  delete: { label: 'Delete', className: 'bg-red-100 text-red-700' },
  restore: { label: 'Restore', className: 'bg-emerald-100 text-emerald-700' },
  revert: { label: 'Revert', className: 'bg-amber-100 text-amber-700' },
  login: { label: 'Login', className: 'bg-violet-100 text-violet-700' },
}

function entityLabelOf(entityType: string) {
  return entityType === 'invoice' ? 'Invoice' : entityType === 'payment' ? 'Payment' : entityType.replace(/_/g, ' ')
}

interface PatientBillingLogPanelProps {
  patientId: string
}

/**
 * Read-only, patient-scoped feed of invoice/payment creates, edits, and
 * deletes ("Pt. Log") — who changed what and when, for accountability in
 * the billing workflow. Sibling of the admin-wide ActivityLogTab, but
 * pre-filtered to one patient and to invoice/payment entity types only.
 */
export function PatientBillingLogPanel({ patientId }: PatientBillingLogPanelProps) {
  const [rows, setRows] = useState<ActivityLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(nextPage: number) {
    setLoading(true)
    setError(null)
    try {
      const data = await listPatientBillingLog(patientId, nextPage)
      setRows((prev) => (nextPage === 0 ? data : [...prev, ...data]))
      setPage(nextPage)
      setHasMore(data.length === PATIENT_LOG_PAGE_SIZE)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Pt. Log.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setRows([])
    setPage(0)
    setHasMore(true)
    load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 sm:p-5 border-b border-gray-100">
        <h2 className="font-semibold flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" />
          Pt. Log
        </h2>
      </div>

      {error && <p className="p-4 text-sm text-red-600">{error}</p>}

      {!error && rows.length === 0 && !loading && (
        <div className="p-8 text-center text-sm text-gray-400">No invoice or payment activity recorded yet.</div>
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
                </div>
                {row.details && <p className="text-xs text-text-secondary mt-0.5">{row.details}</p>}
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
          <Button variant="outline" size="sm" onClick={() => load(page + 1)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
