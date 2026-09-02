import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Receipt, ChevronDown, ChevronRight, Zap, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatBDT, safeFormat } from '@/lib/utils'
import { getAppRole, formatAuditActor } from '@/lib/appSession'
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

export function PaymentsLog() {
  const isAdmin = getAppRole() === 'admin'
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <PaymentsLogContent />
}

function PaymentsLogContent() {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [holds, setHolds] = useState<HoldRow[]>([])
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
      const [{ data: paymentsData }, { data: invoicesData }, { data: patientsData }, { data: activityData }] = await Promise.all([
        supabase.from('payments').select('id, invoice_id, amount, payment_date, payment_method, gateway_provider, gateway_status'),
        supabase.from('invoices').select('id, patient_id, invoice_number, status, total_amount, paid_amount, bangla_qr_hold_amount'),
        supabase.from('patients').select('id, first_name, last_name, phone'),
        supabase.from('activity_log').select('entity_id, actor').eq('entity_type', 'payment').eq('action', 'create'),
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

  function toggleMonth(month: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
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
