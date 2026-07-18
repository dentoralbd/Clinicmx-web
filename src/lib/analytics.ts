import { format, subMonths } from 'date-fns'
import { getInvoiceItemLineTotal, getInvoiceItemSubtotal, type BillingLineItem } from '@/lib/billing'

// Row subsets fetched by the Analytics page (read-only selects).
export interface AnalyticsInvoice {
  id: string
  patient_id: string | null
  items: unknown
  total_amount: number | null
  paid_amount: number | null
  status: string | null
  created_at: string
}

export interface AnalyticsTreatment {
  id: string
  treatment_type: string | null
  status: string | null
  cost: number | null
  created_at: string
}

export interface AnalyticsPatient {
  id: string
  first_name: string | null
  last_name: string | null
  created_at: string
}

export interface AnalyticsAppointment {
  patient_id: string | null
  date_time: string | null
  status: string | null
}

export type AnalyticsRange = '6m' | '12m' | 'all'

// ---------- month axis helpers ----------

export function monthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM')
}

export function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00`)
  return isNaN(d.getTime()) ? key : format(d, 'MMM yy')
}

/** Start date for a range, or null for 'all'. */
export function rangeStart(range: AnalyticsRange, now = new Date()): Date | null {
  if (range === 'all') return null
  const months = range === '6m' ? 6 : 12
  const start = subMonths(new Date(now.getFullYear(), now.getMonth(), 1), months - 1)
  return start
}

/** Contiguous list of 'yyyy-MM' keys from the range start (or earliest data) through the current month. */
export function buildMonthAxis(range: AnalyticsRange, dataDates: string[], now = new Date()): string[] {
  let start = rangeStart(range, now)
  if (!start) {
    const keys = dataDates.map(monthKey).filter(Boolean).sort()
    start = keys.length > 0 ? new Date(`${keys[0]}-01T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1)
  }
  const axis: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  while (cursor <= end && axis.length < 240) {
    axis.push(format(cursor, 'yyyy-MM'))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return axis
}

/** Filter rows to those whose date falls inside the range (inclusive of the range's first month). */
export function filterByRange<T>(rows: T[], getDate: (row: T) => string | null | undefined, range: AnalyticsRange, now = new Date()): T[] {
  const start = rangeStart(range, now)
  if (!start) return rows
  return rows.filter((row) => {
    const raw = getDate(row)
    if (!raw) return false
    const d = new Date(raw)
    return !isNaN(d.getTime()) && d >= start
  })
}

// ---------- treatment type normalization ----------

const UNSPECIFIED_TYPE = 'Unspecified'

/**
 * Groups freeform treatment_type values case-insensitively, displaying the most
 * common casing. Returns a lookup from raw value to display name.
 */
function buildTypeNormalizer(rawTypes: Array<string | null | undefined>) {
  // lowercased key -> casing counts
  const casings = new Map<string, Map<string, number>>()
  for (const raw of rawTypes) {
    const trimmed = (raw || '').trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    const counts = casings.get(key) || new Map<string, number>()
    counts.set(trimmed, (counts.get(trimmed) || 0) + 1)
    casings.set(key, counts)
  }
  const display = new Map<string, string>()
  for (const [key, counts] of casings) {
    let best = ''
    let bestCount = -1
    for (const [casing, count] of counts) {
      if (count > bestCount) {
        best = casing
        bestCount = count
      }
    }
    display.set(key, best)
  }
  return (raw: string | null | undefined): string => {
    const trimmed = (raw || '').trim()
    if (!trimmed) return UNSPECIFIED_TYPE
    return display.get(trimmed.toLowerCase()) || trimmed
  }
}

/** Sorts entries desc by value and folds everything past `limit` into an "Others" row. */
function topNWithOthers<T extends { value: number }>(
  entries: Array<T & { label: string }>,
  limit: number,
  merge: (others: Array<T & { label: string }>) => T & { label: string }
) {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  if (sorted.length <= limit) return sorted
  const top = sorted.slice(0, limit)
  const rest = sorted.slice(limit)
  return [...top, merge(rest)]
}

// ---------- revenue ----------

const isActiveInvoice = (inv: AnalyticsInvoice) => inv.status !== 'Merged'

export interface MonthlyRevenuePoint {
  month: string
  label: string
  collected: number
  billed: number
  outstanding: number
}

/** Per-month collected (Σ paid_amount) and outstanding (Σ max(total-paid, 0)), grouped by invoice created_at. */
export function monthlyRevenue(invoices: AnalyticsInvoice[], monthAxis: string[]): MonthlyRevenuePoint[] {
  const byMonth = new Map<string, { collected: number; billed: number; outstanding: number }>()
  for (const inv of invoices) {
    if (!isActiveInvoice(inv)) continue
    const key = monthKey(inv.created_at)
    if (!key) continue
    const bucket = byMonth.get(key) || { collected: 0, billed: 0, outstanding: 0 }
    const total = inv.total_amount || 0
    const paid = inv.paid_amount || 0
    bucket.collected += paid
    bucket.billed += total
    bucket.outstanding += Math.max(total - paid, 0)
    byMonth.set(key, bucket)
  }
  return monthAxis.map((month) => ({
    month,
    label: monthLabel(month),
    collected: byMonth.get(month)?.collected || 0,
    billed: byMonth.get(month)?.billed || 0,
    outstanding: byMonth.get(month)?.outstanding || 0,
  }))
}

export interface RevenueSummary {
  totalCollected: number
  totalBilled: number
  totalOutstanding: number
  /** collected / billed, 0..1; 0 when nothing billed */
  collectionRate: number
}

export function revenueSummary(invoices: AnalyticsInvoice[]): RevenueSummary {
  let totalCollected = 0
  let totalBilled = 0
  let totalOutstanding = 0
  for (const inv of invoices) {
    if (!isActiveInvoice(inv)) continue
    const total = inv.total_amount || 0
    const paid = inv.paid_amount || 0
    totalCollected += paid
    totalBilled += total
    totalOutstanding += Math.max(total - paid, 0)
  }
  return {
    totalCollected,
    totalBilled,
    totalOutstanding,
    collectionRate: totalBilled > 0 ? totalCollected / totalBilled : 0,
  }
}

export const UNLINKED_REVENUE_LABEL = 'Other / Unlinked'

export interface RevenueByTypeRow {
  type: string
  collected: number
}

/**
 * Attributes collected revenue (paid_amount) to treatment types via the
 * source_treatment_id(s) recorded on invoice line items. Each invoice's paid
 * amount is distributed across its items proportionally to line totals, so the
 * rows always sum to total collected. Items without a treatment link — and
 * invoices with no parseable items — fall into the "Other / Unlinked" bucket.
 */
export function revenueByTreatmentType(
  invoices: AnalyticsInvoice[],
  treatments: AnalyticsTreatment[]
): RevenueByTypeRow[] {
  const normalize = buildTypeNormalizer(treatments.map((t) => t.treatment_type))
  const typeById = new Map<string, string>()
  for (const t of treatments) typeById.set(t.id, normalize(t.treatment_type))

  const collectedByType = new Map<string, number>()
  const add = (type: string, amount: number) => {
    if (amount <= 0) return
    collectedByType.set(type, (collectedByType.get(type) || 0) + amount)
  }

  for (const inv of invoices) {
    if (!isActiveInvoice(inv)) continue
    const paid = inv.paid_amount || 0
    if (paid <= 0) continue

    const items = Array.isArray(inv.items) ? (inv.items as Array<Partial<BillingLineItem>>) : []
    const subtotal = items.length > 0 ? getInvoiceItemSubtotal(items) : 0
    if (subtotal <= 0) {
      add(UNLINKED_REVENUE_LABEL, paid)
      continue
    }
    // Scale by paid/subtotal so partial payments and invoice-level discounts
    // shrink every item's share proportionally and the buckets sum to `paid`.
    const scale = paid / subtotal
    for (const item of items) {
      const share = getInvoiceItemLineTotal(item) * scale
      if (share <= 0) continue
      const ids: string[] = Array.isArray(item?.source_treatment_ids)
        ? item.source_treatment_ids.filter((id): id is string => typeof id === 'string' && !!id)
        : item?.source_treatment_id
          ? [item.source_treatment_id]
          : []
      const types = ids.map((id) => typeById.get(id)).filter((t): t is string => !!t)
      if (types.length === 0) {
        add(UNLINKED_REVENUE_LABEL, share)
      } else {
        for (const type of types) add(type, share / types.length)
      }
    }
  }

  const linked = Array.from(collectedByType.entries())
    .filter(([type]) => type !== UNLINKED_REVENUE_LABEL)
    .map(([type, collected]) => ({ label: type, value: collected }))
  const rows = topNWithOthers(linked, 10, (others) => ({
    label: 'Others',
    value: others.reduce((sum, o) => sum + o.value, 0),
  })).map(({ label, value }) => ({ type: label, collected: value }))

  const unlinked = collectedByType.get(UNLINKED_REVENUE_LABEL) || 0
  if (unlinked > 0) rows.push({ type: UNLINKED_REVENUE_LABEL, collected: unlinked })
  return rows
}

export interface TopRevenueSource {
  patientId: string
  name: string
  collected: number
  invoiceCount: number
}

export function topRevenueSources(
  invoices: AnalyticsInvoice[],
  patients: AnalyticsPatient[],
  limit = 10
): TopRevenueSource[] {
  const nameById = new Map<string, string>()
  for (const p of patients) {
    nameById.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown Patient')
  }
  const byPatient = new Map<string, { collected: number; invoiceCount: number }>()
  for (const inv of invoices) {
    if (!isActiveInvoice(inv) || !inv.patient_id) continue
    const paid = inv.paid_amount || 0
    if (paid <= 0) continue
    const bucket = byPatient.get(inv.patient_id) || { collected: 0, invoiceCount: 0 }
    bucket.collected += paid
    bucket.invoiceCount += 1
    byPatient.set(inv.patient_id, bucket)
  }
  return Array.from(byPatient.entries())
    .map(([patientId, { collected, invoiceCount }]) => ({
      patientId,
      name: nameById.get(patientId) || 'Unknown Patient',
      collected,
      invoiceCount,
    }))
    .sort((a, b) => b.collected - a.collected)
    .slice(0, limit)
}

// ---------- patients ----------

export interface NewPatientsPoint {
  month: string
  label: string
  count: number
  cumulative: number
}

/** New patients per month by patients.created_at; cumulative counts ALL patients registered up to that month. */
export function newPatientsPerMonth(patients: AnalyticsPatient[], monthAxis: string[]): NewPatientsPoint[] {
  const byMonth = new Map<string, number>()
  for (const p of patients) {
    const key = monthKey(p.created_at)
    if (key) byMonth.set(key, (byMonth.get(key) || 0) + 1)
  }
  const firstAxisMonth = monthAxis[0] || ''
  let cumulative = patients.filter((p) => {
    const key = monthKey(p.created_at)
    return key !== '' && key < firstAxisMonth
  }).length
  return monthAxis.map((month) => {
    cumulative += byMonth.get(month) || 0
    return { month, label: monthLabel(month), count: byMonth.get(month) || 0, cumulative }
  })
}

export interface ReturningVsNewPoint {
  month: string
  label: string
  newPatients: number
  returning: number
}

/**
 * Per month: "new" = distinct patients whose first-ever appointment falls in that
 * month; "returning" = distinct patients seen that month whose first appointment
 * was earlier. Cancelled appointments are ignored. Pass the FULL appointment
 * history (not range-filtered) so first visits are computed correctly.
 */
export function returningVsNewByMonth(
  appointments: AnalyticsAppointment[],
  monthAxis: string[]
): ReturningVsNewPoint[] {
  const active = appointments.filter(
    (a) => a.patient_id && a.date_time && a.status !== 'Cancelled' && monthKey(a.date_time) !== ''
  )
  const firstVisitMonth = new Map<string, string>()
  for (const a of active) {
    const key = monthKey(a.date_time as string)
    const prev = firstVisitMonth.get(a.patient_id as string)
    if (!prev || key < prev) firstVisitMonth.set(a.patient_id as string, key)
  }
  const seenByMonth = new Map<string, Set<string>>()
  for (const a of active) {
    const key = monthKey(a.date_time as string)
    const set = seenByMonth.get(key) || new Set<string>()
    set.add(a.patient_id as string)
    seenByMonth.set(key, set)
  }
  return monthAxis.map((month) => {
    let newPatients = 0
    let returning = 0
    for (const patientId of seenByMonth.get(month) || []) {
      if (firstVisitMonth.get(patientId) === month) newPatients += 1
      else returning += 1
    }
    return { month, label: monthLabel(month), newPatients, returning }
  })
}

// ---------- treatments ----------

export interface ProcedureCountRow {
  type: string
  count: number
}

/** Procedure counts by normalized treatment_type, excluding Cancelled. Top 10 + "Others". */
export function procedureCountsByType(treatments: AnalyticsTreatment[]): ProcedureCountRow[] {
  const normalize = buildTypeNormalizer(treatments.map((t) => t.treatment_type))
  const counts = new Map<string, number>()
  for (const t of treatments) {
    if (t.status === 'Cancelled') continue
    const type = normalize(t.treatment_type)
    counts.set(type, (counts.get(type) || 0) + 1)
  }
  const entries = Array.from(counts.entries()).map(([type, count]) => ({ label: type, value: count }))
  return topNWithOthers(entries, 10, (others) => ({
    label: 'Others',
    value: others.reduce((sum, o) => sum + o.value, 0),
  })).map(({ label, value }) => ({ type: label, count: value }))
}

export interface AvgCostRow {
  type: string
  avgCost: number
  n: number
}

/** Mean recorded cost per normalized type (rows with cost > 0 only, excluding Cancelled). Sorted by frequency. */
export function avgCostByType(treatments: AnalyticsTreatment[], limit = 10): AvgCostRow[] {
  const normalize = buildTypeNormalizer(treatments.map((t) => t.treatment_type))
  const sums = new Map<string, { total: number; n: number }>()
  for (const t of treatments) {
    if (t.status === 'Cancelled') continue
    const cost = t.cost || 0
    if (cost <= 0) continue
    const type = normalize(t.treatment_type)
    const bucket = sums.get(type) || { total: 0, n: 0 }
    bucket.total += cost
    bucket.n += 1
    sums.set(type, bucket)
  }
  return Array.from(sums.entries())
    .map(([type, { total, n }]) => ({ type, avgCost: total / n, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
}

export interface TreatmentConversion {
  planned: number
  inProgress: number
  completed: number
  cancelled: number
  /** completed / (planned + inProgress + completed), 0..1 */
  completionRate: number
}

export function treatmentConversion(treatments: AnalyticsTreatment[]): TreatmentConversion {
  let planned = 0
  let inProgress = 0
  let completed = 0
  let cancelled = 0
  for (const t of treatments) {
    if (t.status === 'Planned') planned += 1
    else if (t.status === 'In Progress') inProgress += 1
    else if (t.status === 'Completed') completed += 1
    else if (t.status === 'Cancelled') cancelled += 1
  }
  const pipeline = planned + inProgress + completed
  return {
    planned,
    inProgress,
    completed,
    cancelled,
    completionRate: pipeline > 0 ? completed / pipeline : 0,
  }
}
