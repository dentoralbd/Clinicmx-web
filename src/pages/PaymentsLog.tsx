import { useEffect, useMemo, useState } from 'react'
import { Receipt, ChevronDown, ChevronRight, Zap, UserCheck, History, Send, XCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatBDT, safeFormat } from '@/lib/utils'
import { formatAuditActor } from '@/lib/appSession'
import { logActivity } from '@/lib/activityLog'
import { type AnalyticsRange, filterByRange, monthKey, monthLabel } from '@/lib/analytics'
import { PAYMENT_METHOD_CATEGORIES, getPaymentMethodCategory, type PaymentMethodCategory } from '@/lib/paymentMethodLabel'
import { BanglaQrPaymentModal } from '@/components/BanglaQrPaymentModal'

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
]

interface PaymentRow {
  id: string
  invoice_id: string
  amount: number
  payment_date: string
  payment_method: string | null
  gateway_provider: string | null
  gateway_status: string | null
  patientName: string
  invoiceNumber: string | null
  confirmedBy: string | null
}

interface HoldRow {
  invoiceId: string
  invoiceNumber: string | null
  patientId: string | null
  patientName: string
  patientPhone: string | null
  invoiceTotal: number
  invoicePaid: number
  holdAmount: number
}

// A durable, in-page record of the Bangla QR hold lifecycle — who requested it, who
// dismissed it, who confirmed it — independent of the Notifications bell's 7-day/10-row
// feed, which is too narrow to answer "who did this" after the fact.
interface HistoryEvent {
  id: string
  type: 'requested' | 'dismissed' | 'confirmed'
  timestamp: string
  actor: string | null
  patientName: string
  invoiceNumber: string | null
  details: string
}

// Access is gated the same way as Billing itself (RequirePage page="billing" in App.tsx),
// not admin-only — front-desk staff need to be able to confirm a Bangla QR hold into Paid
// from here too, not just from Billing's own Record Payment flow. Accountability instead
// comes from the "Confirmed by" line on each row (see confirmedBy below), not from
// restricting who can open the page.
export function PaymentsLog() {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [holds, setHolds] = useState<HoldRow[]>([])
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [category, setCategory] = useState<PaymentMethodCategory | 'all'>('all')
  const [range, setRange] = useState<AnalyticsRange>('1m')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [confirmingHold, setConfirmingHold] = useState<HoldRow | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: paymentsData }, { data: invoicesData }, { data: patientsData }, { data: activityData }, { data: holdActivityData }] = await Promise.all([
        supabase.from('payments').select('id, invoice_id, amount, payment_date, payment_method, gateway_provider, gateway_status'),
        supabase.from('invoices').select('id, patient_id, invoice_number, status, total_amount, paid_amount, bangla_qr_hold_amount'),
        supabase.from('patients').select('id, first_name, last_name, phone'),
        supabase.from('activity_log').select('entity_id, actor').eq('entity_type', 'payment').eq('action', 'create'),
        supabase
          .from('activity_log')
          .select('id, occurred_at, action, entity_label, patient_name, details, actor')
          .eq('entity_type', 'bangla_qr_hold')
          .order('occurred_at', { ascending: false })
          .limit(500),
      ])

      const invoiceById = new Map((invoicesData || []).map((inv: any) => [inv.id, inv]))
      const nameById = new Map((patientsData || []).map((p: any) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient']))
      const phoneById = new Map((patientsData || []).map((p: any) => [p.id, p.phone ?? null]))
      // entity_id only populated going forward (see BanglaQrPaymentModal.tsx / PaymentEntryModal.tsx) —
      // payments recorded before this change simply won't resolve an actor here.
      const actorByPaymentId = new Map((activityData || []).filter((a: any) => a.entity_id).map((a: any) => [a.entity_id, a.actor]))

      const resolvedPayments: PaymentRow[] = []
      for (const p of paymentsData || []) {
        const inv = invoiceById.get(p.invoice_id)
        if (!inv || inv.status === 'Merged') continue
        resolvedPayments.push({
          id: p.id,
          invoice_id: p.invoice_id,
          amount: p.amount || 0,
          payment_date: p.payment_date,
          payment_method: p.payment_method,
          gateway_provider: p.gateway_provider,
          gateway_status: p.gateway_status,
          patientName: inv.patient_id ? nameById.get(inv.patient_id) || 'Patient' : 'Unknown Patient',
          invoiceNumber: inv.invoice_number ?? null,
          confirmedBy: actorByPaymentId.get(p.id) ?? null,
        })
      }

      const resolvedHolds: HoldRow[] = []
      for (const inv of invoicesData || []) {
        if (!inv.bangla_qr_hold_amount || inv.status === 'Paid' || inv.status === 'Merged') continue
        resolvedHolds.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number ?? null,
          patientId: inv.patient_id ?? null,
          patientName: inv.patient_id ? nameById.get(inv.patient_id) || 'Patient' : 'Unknown Patient',
          patientPhone: inv.patient_id ? phoneById.get(inv.patient_id) ?? null : null,
          invoiceTotal: inv.total_amount || 0,
          invoicePaid: inv.paid_amount || 0,
          holdAmount: inv.bangla_qr_hold_amount,
        })
      }

      const requestedDismissed: HistoryEvent[] = (holdActivityData || []).map((a: any) => ({
        id: a.id,
        type: a.action === 'delete' ? 'dismissed' : 'requested',
        timestamp: a.occurred_at,
        actor: a.actor ?? null,
        patientName: a.patient_name || 'Patient',
        invoiceNumber: a.entity_label ?? null,
        details: a.details || (a.action === 'delete' ? 'Bangla QR hold dismissed' : 'Bangla QR payment requested'),
      }))
      // Confirmed events reuse the payments already resolved above (gateway_provider set
      // means it went through Bangla QR/bKash/Nagad verification) rather than a separate
      // query — same data, no extra round trip.
      const confirmed: HistoryEvent[] = resolvedPayments
        .filter((p) => p.gateway_provider)
        .map((p) => ({
          id: p.id,
          type: 'confirmed' as const,
          timestamp: p.payment_date,
          actor: p.confirmedBy,
          patientName: p.patientName,
          invoiceNumber: p.invoiceNumber,
          details: `Confirmed paid — ${formatBDT(p.amount)}`,
        }))
      setHistory([...requestedDismissed, ...confirmed].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)))

      setPayments(resolvedPayments)
      setHolds(resolvedHolds)
    } finally {
      setLoading(false)
    }
  }

  const filteredByCategory = useMemo(() => {
    if (category === 'all') return payments
    return payments.filter((p) => getPaymentMethodCategory(p) === category)
  }, [payments, category])

  const rangeFiltered = useMemo(
    () => filterByRange(filteredByCategory, (p) => p.payment_date, range, customStart, customEnd),
    [filteredByCategory, range, customStart, customEnd]
  )

  const monthGroups = useMemo(() => {
    const byMonth = new Map<string, PaymentRow[]>()
    for (const p of rangeFiltered) {
      const key = monthKey(p.payment_date)
      if (!key) continue
      const rows = byMonth.get(key) || []
      rows.push(p)
      byMonth.set(key, rows)
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([month, rows]) => ({
        month,
        label: monthLabel(month),
        rows: rows.sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1)),
        total: rows.reduce((sum, r) => sum + r.amount, 0),
      }))
  }, [rangeFiltered])

  const categoryTotals = useMemo(() => {
    const rangeAll = filterByRange(payments, (p) => p.payment_date, range, customStart, customEnd)
    const totals = new Map<PaymentMethodCategory, number>()
    for (const p of rangeAll) {
      const cat = getPaymentMethodCategory(p)
      totals.set(cat, (totals.get(cat) || 0) + p.amount)
    }
    return totals
  }, [payments, range, customStart, customEnd])

  const showHoldSection = category === 'all' || category === 'bangla_qr'

  const historyFiltered = useMemo(
    () => filterByRange(history, (h) => h.timestamp, range, customStart, customEnd),
    [history, range, customStart, customEnd]
  )

  const historyIcon = { requested: Send, dismissed: XCircle, confirmed: CheckCircle2 } as const
  const historyColor = {
    requested: 'text-blue-600 bg-blue-50',
    dismissed: 'text-gray-500 bg-gray-100',
    confirmed: 'text-emerald-600 bg-emerald-50',
  } as const

  function toggleMonth(month: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  // Clears a Hold with no payment recorded — for a test/abandoned QR open, not a real
  // pending collection. Logged the same way as a confirmed payment (accountability was
  // the whole point of adding "Confirmed by" earlier), so dismissing a real patient's
  // still-pending request in error is traceable too.
  async function handleDismissHold(hold: HoldRow) {
    if (!confirm(`Dismiss this ${formatBDT(hold.holdAmount)} Bangla QR hold for ${hold.patientName}? No payment will be recorded — only do this for a test or mistaken request.`)) {
      return
    }
    const { error } = await supabase.from('invoices').update({ bangla_qr_hold_amount: null }).eq('id', hold.invoiceId)
    if (error) {
      alert('Failed to dismiss hold: ' + error.message)
      return
    }
    logActivity({
      action: 'delete',
      entityType: 'bangla_qr_hold',
      entityId: hold.invoiceId,
      entityLabel: hold.invoiceNumber,
      patientId: hold.patientId,
      patientName: hold.patientName,
      details: `Bangla QR hold of ${formatBDT(hold.holdAmount)} dismissed without payment`,
    })
    loadData()
  }

  function confirmationBadge(row: PaymentRow) {
    if (row.gateway_status === 'sms_auto_verified') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
          <Zap className="w-3 h-3" /> Automatic
        </span>
      )
    }
    if (row.gateway_status === 'sms_verified' || row.gateway_status === 'manual_verified') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
          <UserCheck className="w-3 h-3" /> Manual
        </span>
      )
    }
    return null
  }

  return (
    <div className="space-y-6 page-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Receipt className="w-6 h-6 text-teal-600" /> Payments Log
        </h1>
        <p className="text-text-secondary text-sm mt-1">Every payment, by method — Cash, Bangla QR, bKash, Nagad, and more.</p>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading payments...</p>
      ) : (
        <>
          {/* Date range */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-gray-100 p-1 rounded-xl">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                    range === option.value ? 'bg-primary text-white shadow-elevation-low' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {range === 'custom' && (
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                />
                <span className="text-xs font-semibold text-slate-500">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                />
              </div>
            )}
          </div>

          {/* Per-method summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {PAYMENT_METHOD_CATEGORIES.map((c) => (
              <div key={c.key} className="border border-gray-200 rounded-lg p-2.5 bg-card">
                <p className="text-[10px] text-text-secondary truncate">{c.label}</p>
                <p className="text-sm font-semibold tabular-nums">{formatBDT(categoryTotals.get(c.key) || 0)}</p>
              </div>
            ))}
          </div>

          {/* Method filter tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                category === 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-text-secondary border-gray-200 hover:border-primary/40'
              }`}
            >
              All
            </button>
            {PAYMENT_METHOD_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                  category === c.key ? 'bg-primary text-white border-primary' : 'bg-white text-text-secondary border-gray-200 hover:border-primary/40'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Currently on Hold */}
          {showHoldSection && (
            <div className="bg-card rounded-lg shadow-sm border border-amber-200 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-amber-900">Currently on Hold</h3>
              {holds.length === 0 ? (
                <p className="text-xs text-text-secondary">No payments currently on hold.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {holds.map((hold) => (
                    <div key={hold.invoiceId} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{hold.patientName}</p>
                        <p className="text-xs text-text-secondary">Invoice {hold.invoiceNumber || hold.invoiceId.slice(0, 8).toUpperCase()}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="pill-warning">Hold</span>
                        <span className="font-semibold tabular-nums">{formatBDT(hold.holdAmount)}</span>
                        <button
                          type="button"
                          onClick={() => handleDismissHold(hold)}
                          className="px-2.5 py-1 text-xs font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingHold(hold)}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          Confirm Payment
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bangla QR Activity History — who requested/dismissed/confirmed, full record
              (not the Notifications bell's 7-day/10-row window), scoped to this page's
              date range. */}
          {showHoldSection && (
            <div className="bg-card rounded-lg shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => setHistoryExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-surface-subtle"
              >
                <span className="flex items-center gap-1.5">
                  {historyExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                  )}
                  <History className="w-4 h-4 text-teal-600" />
                  Bangla QR Activity History
                </span>
                <span className="text-xs font-normal text-text-secondary">{historyFiltered.length} event{historyFiltered.length !== 1 ? 's' : ''}</span>
              </button>
              {historyExpanded && (
                historyFiltered.length === 0 ? (
                  <p className="text-xs text-text-secondary px-4 pb-3">No Bangla QR activity in this range.</p>
                ) : (
                  <div className="divide-y divide-gray-50 px-4 pb-2">
                    {historyFiltered.map((event) => {
                      const Icon = historyIcon[event.type]
                      return (
                        <div key={event.id} className="flex items-center gap-3 py-2 text-sm">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${historyColor[event.type]}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              <span className="font-medium">{event.patientName}</span>
                              {event.invoiceNumber && ` • Invoice ${event.invoiceNumber}`}
                            </p>
                            <p className="text-xs text-text-secondary truncate">{event.details}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-text-secondary">{safeFormat(event.timestamp, 'MMM d, h:mm a')}</p>
                            {event.actor && <p className="text-xs font-medium text-slate-600">{formatAuditActor(event.actor)}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          )}

          {/* Monthly grouped list */}
          <div className="bg-card rounded-lg shadow-sm border border-gray-200">
            {monthGroups.length === 0 ? (
              <p className="text-sm text-text-secondary p-4">No payments in this range.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {monthGroups.map((group) => {
                  const isExpanded = expandedMonths.has(group.month)
                  return (
                    <div key={group.month}>
                      <button
                        type="button"
                        onClick={() => toggleMonth(group.month)}
                        className="w-full grid grid-cols-[1fr_auto] items-center gap-x-4 px-3 py-2.5 text-sm text-left hover:bg-surface-subtle"
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                          )}
                          {group.label}
                        </span>
                        <span className="text-right tabular-nums font-semibold text-primary">{formatBDT(group.total)}</span>
                      </button>
                      {isExpanded && (
                        <div className="pl-9 pr-3 pb-2 divide-y divide-gray-50">
                          {group.rows.map((row) => (
                            <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{row.patientName}</p>
                                <p className="text-xs text-text-secondary">
                                  {safeFormat(row.payment_date, 'MMM d, yyyy')}
                                  {row.confirmedBy && ` • Confirmed by ${formatAuditActor(row.confirmedBy)}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {category === 'all' && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                    {PAYMENT_METHOD_CATEGORIES.find((c) => c.key === getPaymentMethodCategory(row))?.label}
                                  </span>
                                )}
                                {confirmationBadge(row)}
                                <span className="font-semibold tabular-nums">{formatBDT(row.amount)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {confirmingHold && (
        <BanglaQrPaymentModal
          invoiceId={confirmingHold.invoiceId}
          invoiceNumber={confirmingHold.invoiceNumber}
          invoiceTotal={confirmingHold.invoiceTotal}
          invoicePaid={confirmingHold.invoicePaid}
          initialAmount={confirmingHold.holdAmount}
          patientId={confirmingHold.patientId}
          patientName={confirmingHold.patientName}
          patientPhone={confirmingHold.patientPhone}
          onClose={() => setConfirmingHold(null)}
          onSaved={() => {
            setConfirmingHold(null)
            loadData()
          }}
        />
      )}
    </div>
  )
}
