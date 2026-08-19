import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ShieldAlert, RefreshCw, CheckCircle2, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getAppRole, getAppUser } from '@/lib/appSession'
import {
  listFindings,
  markFindingReviewed,
  getLastScanRun,
  runScan,
  type IntegrityFinding,
  type IntegritySeverity,
} from '@/lib/integrity'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

const SEVERITY_META: Record<IntegritySeverity, { label: string; badge: string }> = {
  critical: { label: 'Critical', badge: 'bg-rose-100 text-rose-700 border-rose-200' },
  warning: { label: 'Warning', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  info: { label: 'Info', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
}

type SeverityFilter = 'all' | IntegritySeverity
const SEVERITY_FILTERS: Array<{ value: SeverityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

// Plain-language description built from each check's details JSON, keyed by
// check_name (matches supabase/migrations/064_integrity_findings.sql's
// check names exactly). Falls back to a generic line for anything not
// listed here so an added-but-not-yet-described check still renders.
function describeFinding(f: IntegrityFinding): string {
  const d = f.details as Record<string, any>
  switch (f.check_name) {
    case 'orphan_payment_invoice':
      return `Payment of ${d.amount ?? '?'} references an invoice that no longer exists.`
    case 'orphan_patient_visit':
      return `Visit on ${d.visit_date ?? '?'} references a patient that no longer exists.`
    case 'orphan_treatment_patient':
      return `Treatment "${d.treatment_type ?? '?'}" references a patient that no longer exists.`
    case 'orphan_invoice_patient':
      return `Invoice ${d.invoice_number ?? f.entity_id} references a patient that no longer exists.`
    case 'orphan_prescription_patient':
      return `Prescription references a patient that no longer exists.`
    case 'orphan_appointment_patient':
      return `Appointment on ${d.date_time ?? '?'} references a patient that no longer exists.`
    case 'orphan_treatment_appointment':
      return `Treatment references an appointment that no longer exists.`
    case 'payments_ledger_mismatch':
      return `Invoice ${d.invoice_number ?? f.entity_id}: paid amount (${d.invoice_paid_amount}) doesn't match the sum of its payment records (${d.payments_sum}).`
    case 'invoice_overpaid':
      return `Invoice paid amount (${d.paid_amount}) exceeds its total (${d.total_amount}).`
    case 'invoice_negative_amount':
      return `Invoice has a negative total or paid amount.`
    case 'treatment_negative_cost':
      return `Treatment has a negative cost (${d.cost}).`
    case 'treatment_negative_discount':
      return `Treatment's original cost (${d.original_cost}) is less than its current cost (${d.cost}) — a negative discount.`
    case 'invoice_total_mismatch':
      return `Invoice ${d.invoice_number ?? f.entity_id}: stored total (${d.stored_total}) doesn't match the total recomputed from its line items (${d.recomputed_total}).`
    case 'treatment_flagged_invoiced_unlinked':
      return `Treatment is marked as invoiced but no live invoice links to it.`
    case 'treatment_referenced_but_unlinked':
      return `An invoice's line items reference this treatment, but the treatment's own invoice link disagrees.`
    case 'treatment_linked_to_merged_invoice':
      return `Treatment still links to an invoice that has since been merged into another one.`
    case 'invoice_status_mismatch':
      return `Invoice status is "${d.stored_status}" but its paid/total amounts suggest it should be "${d.expected_status}".`
    case 'treatment_completed_at_mismatch':
      return `Treatment status ("${d.status}") and its completed-at timestamp disagree — one was likely set outside the normal app flow.`
    case 'treatment_doctor_name_unmatched':
      return `Treatment's attributed doctor "${d.doctor_name}" doesn't match any active staff account — this doctor's payout analytics will show nothing for it.`
    case 'edit_history_orphan':
      return `An edit-history record (${d.entity_type}) references a row that no longer exists.`
    case 'edit_history_unknown_entity_type':
    case 'delete_history_unknown_entity_type':
      return `A history record has an entity type ("${d.entity_type}") outside the currently recognized list.`
    case 'doctor_profiles_not_singleton':
      return `There are ${d.row_count} clinic profile rows — only one is expected; the app always reads the first by creation date.`
    case 'patient_code_type_mismatch':
      return `Patient type "${d.patient_type}" doesn't match its code format ("${d.patient_code}").`
    case 'patient_code_missing':
      return `Patient "${[d.first_name, d.last_name].filter(Boolean).join(' ')}" has no patient code.`
    case 'patient_code_seq_drift':
      return `The patient-code sequence (${d.seq_last_value}) is out of sync with the highest patient code in use (${d.max_pt_offset}) — new patients could get a colliding or wrong-looking code.`
    default:
      return `${f.check_name.replace(/_/g, ' ')} on ${f.entity_table} ${f.entity_id}.`
  }
}

// Where the affected entity can actually be opened in the app. Returns null
// (no link) for findings with no single navigable row — e.g. the singleton
// and sequence-drift structural checks.
function entityLink(f: IntegrityFinding): string | null {
  switch (f.entity_table) {
    case 'patients':
      return f.entity_id === 'sequence' ? null : `/patients/${f.entity_id}`
    case 'invoices':
      return '/billing'
    case 'treatments':
      return '/treatments'
    default:
      return null
  }
}

export function IntegrityTab() {
  const queryClient = useQueryClient()
  const role = getAppRole()
  const isAdmin = role === 'admin'
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [showResolved, setShowResolved] = useState(false)
  const [error, setError] = useState('')

  const { data: findings = [], isPending } = useQuery({
    queryKey: ['integrity', 'findings', severityFilter, showResolved],
    queryFn: () =>
      listFindings({
        severity: severityFilter === 'all' ? undefined : severityFilter,
        includeResolved: showResolved,
      }),
  })

  const { data: lastRun } = useQuery({
    queryKey: ['integrity', 'lastRun'],
    queryFn: getLastScanRun,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['integrity'] })
  }

  const reviewMutation = useMutation({
    mutationFn: (id: string) => markFindingReviewed(id, getAppUser()?.id ?? null),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  })

  const scanMutation = useMutation({
    mutationFn: runScan,
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  })

  const counts = { critical: 0, warning: 0, info: 0 }
  for (const f of findings) if (!showResolved || !f.resolved_at) counts[f.severity]++

  const lastScanAgo = lastRun?.started_at
    ? formatDistanceToNow(new Date(lastRun.started_at), { addSuffix: true })
    : null
  const lastScanStale = lastRun?.started_at
    ? Date.now() - new Date(lastRun.started_at).getTime() > 48 * 60 * 60 * 1000
    : true

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">Integrity</h2>
            <p className="text-xs text-gray-400">
              Read-only scan for referential orphans, money mismatches, and treatment/invoice sync
              drift. Never writes to patient, billing, or clinical data — only to this list.
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button
            type="button"
            size="sm"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
            {scanMutation.isPending ? 'Running scan…' : 'Run scan'}
          </Button>
        )}
      </div>

      <p className={`text-xs ${lastScanStale ? 'text-amber-600' : 'text-gray-400'}`}>
        {lastRun
          ? `Last scan: ${lastScanAgo}${lastRun.status === 'failed' ? ' (failed)' : ''}`
          : isAdmin
            ? 'No scan has been run yet — tap "Run scan" to check the database now.'
            : 'No scan has been run yet.'}
      </p>

      {error && (
        <p className="text-sm text-error flex items-center justify-between gap-2">
          {error}
          <button type="button" onClick={() => setError('')} className="text-error/70 hover:text-error">
            <X className="w-3.5 h-3.5" />
          </button>
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">Critical</p>
          <p className="text-lg font-bold text-rose-700">{counts.critical}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Warning</p>
          <p className="text-lg font-bold text-amber-700">{counts.warning}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Info</p>
          <p className="text-lg font-bold text-gray-700">{counts.info}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SEVERITY_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setSeverityFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              severityFilter === f.value
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-text-secondary border-gray-200 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-1">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>

      {isPending ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading findings…</p>
      ) : findings.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No findings for this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {findings.map((f) => {
            const link = entityLink(f)
            return (
              <div
                key={f.id}
                className={`border rounded-lg px-3 py-2.5 ${f.resolved_at ? 'border-gray-100 bg-gray-50/50 opacity-60' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className={`flex-shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${SEVERITY_META[f.severity].badge}`}
                    >
                      {SEVERITY_META[f.severity].label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">{describeFinding(f)}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {f.check_name} · last seen {formatDistanceToNow(new Date(f.last_seen_at), { addSuffix: true })}
                        {f.resolved_at && ' · resolved'}
                        {f.reviewed && !f.resolved_at && ' · reviewed'}
                        {link && (
                          <>
                            {' · '}
                            <a href={link} className="text-primary hover:underline">
                              open
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  {isAdmin && !f.reviewed && !f.resolved_at && (
                    <button
                      type="button"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate(f.id)}
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-primary border border-gray-200 hover:border-primary rounded-lg px-2.5 py-1 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark reviewed
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isAdmin && (
        <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <AlertTriangle className="w-3 h-3" />
          Read-only — only admin can run a scan or mark findings reviewed.
        </p>
      )}
    </div>
  )
}
