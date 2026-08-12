import { format, subMonths } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatBDT, csvCell } from '@/lib/utils'
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
  patient_type?: string | null
}

export interface AnalyticsAppointment {
  patient_id: string | null
  date_time: string | null
  status: string | null
}

export interface AnalyticsPayment {
  id: string
  invoice_id: string
  amount: number | null
  payment_date: string
}

export type AnalyticsRange = '1m' | '3m' | '6m' | '12m' | 'all' | 'custom'

// ---------- month axis helpers ----------

export function monthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM')
}

export function dayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd')
}

export function yearKey(dateStr: string): string {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? '' : format(d, 'yyyy')
}

export function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00`)
  return isNaN(d.getTime()) ? key : format(d, 'MMM yy')
}

/** Start date for a range, or null for 'all'. */
export function rangeStart(range: AnalyticsRange, customStart?: string, now = new Date()): Date | null {
  if (range === 'all') return null
  if (range === 'custom' && customStart) {
    const d = new Date(`${customStart}T00:00:00`)
    return isNaN(d.getTime()) ? null : d
  }
  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12
  const start = subMonths(new Date(now.getFullYear(), now.getMonth(), 1), months - 1)
  return start
}

/** Contiguous list of 'yyyy-MM' keys from the range start (or earliest data) through the current month. */
export function buildMonthAxis(
  range: AnalyticsRange,
  dataDates: string[],
  customStart?: string,
  now = new Date()
): string[] {
  let start = rangeStart(range, customStart, now)
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
export function filterByRange<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  range: AnalyticsRange,
  customStart?: string,
  customEnd?: string,
  now = new Date()
): T[] {
  if (range === 'all') return rows
  const start = rangeStart(range, customStart, now)
  const endDate = range === 'custom' && customEnd ? new Date(`${customEnd}T23:59:59`) : null

  return rows.filter((row) => {
    const raw = getDate(row)
    if (!raw) return false
    const d = new Date(raw)
    if (isNaN(d.getTime())) return false
    if (start && d < start) return false
    if (endDate && d > endDate) return false
    return true
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

// ---------- year-over-year comparison ----------

const MONTH_OF_YEAR_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** One row per calendar month (Jan..Dec); one numeric field per calendar year shown. */
export interface YoYPoint {
  month: string
  label: string
  [year: string]: number | string
}

/** [previous year, current year] — the two years a Yearly-mode chart compares. Picked via the page's year picker. */
export type YoYYears = [string, string]

/** All distinct calendar years present across the given date lists, descending (newest first) — populates the year picker. */
export function distinctYears(...dateLists: Array<Array<string | null | undefined>>): string[] {
  const years = new Set<string>()
  for (const list of dateLists) {
    for (const raw of list) {
      if (!raw) continue
      const d = new Date(raw)
      if (!isNaN(d.getTime())) years.add(String(d.getFullYear()))
    }
  }
  return Array.from(years).sort().reverse()
}

/** De-duplicated (a chart still reads sensibly if the same year is picked twice). */
function dedupeYears(years: YoYYears): string[] {
  return years[0] === years[1] ? [years[1]] : years
}

function emptyYoYAxis(years: string[]): YoYPoint[] {
  return MONTH_OF_YEAR_LABELS.map((label, idx) => {
    const point: YoYPoint = { month: String(idx + 1).padStart(2, '0'), label }
    for (const year of years) point[year] = 0
    return point
  })
}

// ---------- revenue ----------

const isActiveInvoice = (inv: AnalyticsInvoice) => inv.status !== 'Merged'

/** Ids of non-Merged invoices, from the FULL invoice set (not date-range-filtered) — a
 *  payment can land inside a selected range even when the invoice it pays down was
 *  created outside it, so "is this invoice active" must never be range-limited. */
function activeInvoiceIdSet(allInvoices: AnalyticsInvoice[]): Set<string> {
  const ids = new Set<string>()
  for (const inv of allInvoices) if (isActiveInvoice(inv)) ids.add(inv.id)
  return ids
}

/** Σ payment amounts against active invoices, grouped by payment_date's month. */
function collectedByMonth(payments: AnalyticsPayment[], activeIds: Set<string>): Map<string, number> {
  const byMonth = new Map<string, number>()
  for (const p of payments) {
    if (!activeIds.has(p.invoice_id)) continue
    const amount = p.amount || 0
    if (amount <= 0) continue
    const key = monthKey(p.payment_date)
    if (!key) continue
    byMonth.set(key, (byMonth.get(key) || 0) + amount)
  }
  return byMonth
}

export interface MonthlyRevenuePoint {
  month: string
  label: string
  collected: number
  billed: number
  outstanding: number
}

/**
 * Per-month collected (Σ payments.amount, grouped by payment_date — cash actually
 * received that month, regardless of when the invoice was raised) and billed/outstanding
 * (Σ total_amount / Σ max(total-paid, 0), grouped by invoice created_at).
 * `allInvoices` (unfiltered by date range) resolves which invoices are active for payments.
 */
export function monthlyRevenue(
  invoices: AnalyticsInvoice[],
  payments: AnalyticsPayment[],
  allInvoices: AnalyticsInvoice[],
  monthAxis: string[]
): MonthlyRevenuePoint[] {
  const collectedMonths = collectedByMonth(payments, activeInvoiceIdSet(allInvoices))
  const byMonth = new Map<string, { billed: number; outstanding: number }>()
  for (const inv of invoices) {
    if (!isActiveInvoice(inv)) continue
    const key = monthKey(inv.created_at)
    if (!key) continue
    const bucket = byMonth.get(key) || { billed: 0, outstanding: 0 }
    const total = inv.total_amount || 0
    const paid = inv.paid_amount || 0
    bucket.billed += total
    bucket.outstanding += Math.max(total - paid, 0)
    byMonth.set(key, bucket)
  }
  return monthAxis.map((month) => ({
    month,
    label: monthLabel(month),
    collected: collectedMonths.get(month) || 0,
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

/**
 * `invoices` should already be date-range-filtered (drives billed/outstanding);
 * `payments` should already be date-range-filtered by payment_date (drives collected);
 * `allInvoices` is the unfiltered set, used only to resolve which invoices are active.
 */
export function revenueSummary(
  invoices: AnalyticsInvoice[],
  payments: AnalyticsPayment[],
  allInvoices: AnalyticsInvoice[]
): RevenueSummary {
  const activeIds = activeInvoiceIdSet(allInvoices)
  let totalCollected = 0
  let totalBilled = 0
  let totalOutstanding = 0
  for (const p of payments) {
    if (!activeIds.has(p.invoice_id)) continue
    totalCollected += p.amount || 0
  }
  for (const inv of invoices) {
    if (!isActiveInvoice(inv)) continue
    const total = inv.total_amount || 0
    const paid = inv.paid_amount || 0
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

export interface PaymentRow {
  id: string
  date: string
  patientId: string | null
  patientName: string
  invoiceId: string
  amount: number
  invoiceTotal: number
  invoiceStatus: string
}

export interface PaymentMonthGroup {
  month: string
  label: string
  rows: PaymentRow[]
  monthTotal: number
}

/**
 * `payments` should already be date-range-filtered by payment_date; `allInvoices`/
 * `patients` are the full unfiltered sets, used to resolve each payment's invoice and
 * patient. Merged invoices excluded. Groups by payment month (newest first); rows
 * within a group are newest first.
 */
export function paymentsByMonth(
  payments: AnalyticsPayment[],
  allInvoices: AnalyticsInvoice[],
  patients: AnalyticsPatient[]
): PaymentMonthGroup[] {
  const invoiceById = new Map<string, AnalyticsInvoice>()
  for (const inv of allInvoices) invoiceById.set(inv.id, inv)
  const nameById = new Map<string, string>()
  for (const p of patients) nameById.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient')

  const byMonth = new Map<string, PaymentRow[]>()
  for (const p of payments) {
    const amount = p.amount || 0
    if (amount <= 0) continue
    const inv = invoiceById.get(p.invoice_id)
    if (!inv || inv.status === 'Merged') continue
    const key = monthKey(p.payment_date)
    if (!key) continue
    const rows = byMonth.get(key) || []
    rows.push({
      id: p.id,
      date: p.payment_date,
      patientId: inv.patient_id,
      patientName: inv.patient_id ? nameById.get(inv.patient_id) || 'Patient' : 'Unknown Patient',
      invoiceId: inv.id,
      amount,
      invoiceTotal: inv.total_amount || 0,
      invoiceStatus: inv.status || 'Pending',
    })
    byMonth.set(key, rows)
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, rows]) => ({
      month,
      label: format(new Date(`${month}-01T00:00:00`), 'MMMM yyyy'),
      rows: rows.sort((a, b) => (a.date < b.date ? 1 : -1)),
      monthTotal: rows.reduce((sum, r) => sum + r.amount, 0),
    }))
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

// ---------- daily revenue (calendar) ----------

/**
 * Σ payment amounts per calendar day ('yyyy-MM-dd'), from the payments ledger —
 * i.e. cash actually received that day, regardless of when the invoice was
 * raised. Payments belonging to Merged invoices are skipped, matching the rest
 * of this module.
 */
export function dailyCollected(
  payments: AnalyticsPayment[],
  activeInvoiceIds: Set<string>
): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const p of payments) {
    if (!activeInvoiceIds.has(p.invoice_id)) continue
    const amount = p.amount || 0
    if (amount <= 0) continue
    const key = dayKey(p.payment_date)
    if (!key) continue
    byDay.set(key, (byDay.get(key) || 0) + amount)
  }
  return byDay
}

export interface PaymentsByPatientRow {
  /** null when the payment's invoice has no patient_id — rendered non-clickable. */
  patientId: string | null
  name: string
  collected: number
  paymentCount: number
}

/**
 * Groups a set of payments by the patient of the invoice each was made against.
 * Used for the day-detail breakdown: a treatment-plan invoice mixes several
 * procedure types, so who paid is more meaningful there than what was paid for.
 * Rows sum to exactly what those payments collected. Sorted desc by amount.
 */
export function paymentsByPatient(
  payments: AnalyticsPayment[],
  invoices: AnalyticsInvoice[],
  patients: AnalyticsPatient[]
): PaymentsByPatientRow[] {
  const nameById = new Map<string, string>()
  for (const p of patients) {
    nameById.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown Patient')
  }
  const invoiceById = new Map<string, AnalyticsInvoice>()
  for (const inv of invoices) invoiceById.set(inv.id, inv)

  const byPatient = new Map<string, { patientId: string | null; collected: number; paymentCount: number }>()
  for (const p of payments) {
    const amount = p.amount || 0
    if (amount <= 0) continue
    const inv = invoiceById.get(p.invoice_id)
    if (!inv || !isActiveInvoice(inv)) continue

    // Payments on patient-less invoices all fold into one "Unknown Patient" row.
    const key = inv.patient_id || ''
    const bucket = byPatient.get(key) || { patientId: inv.patient_id, collected: 0, paymentCount: 0 }
    bucket.collected += amount
    bucket.paymentCount += 1
    byPatient.set(key, bucket)
  }

  return Array.from(byPatient.values())
    .map(({ patientId, collected, paymentCount }) => ({
      patientId,
      name: (patientId && nameById.get(patientId)) || 'Unknown Patient',
      collected,
      paymentCount,
    }))
    .sort((a, b) => b.collected - a.collected)
}

export interface TopRevenueSource {
  patientId: string
  name: string
  collected: number
  totalBilled: number
  totalPaid: number
  invoiceCount: number
}

/**
 * `invoices` should already be date-range-filtered (drives totalBilled/invoiceCount);
 * `payments` should already be date-range-filtered by payment_date (drives collected);
 * `allInvoices` is the unfiltered set, used to resolve each payment's patient/active status.
 */
export function topRevenueSources(
  invoices: AnalyticsInvoice[],
  payments: AnalyticsPayment[],
  allInvoices: AnalyticsInvoice[],
  patients: AnalyticsPatient[],
  limit = 10
): TopRevenueSource[] {
  const nameById = new Map<string, string>()
  for (const p of patients) {
    nameById.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient')
  }
  const invoiceById = new Map<string, AnalyticsInvoice>()
  for (const inv of allInvoices) invoiceById.set(inv.id, inv)

  const byPatient = new Map<string, { totalBilled: number; totalPaid: number; invoiceCount: number }>()
  for (const inv of invoices) {
    if (!isActiveInvoice(inv) || !inv.patient_id) continue
    const bucket = byPatient.get(inv.patient_id) || { totalBilled: 0, totalPaid: 0, invoiceCount: 0 }
    bucket.totalBilled += inv.total_amount || 0
    bucket.invoiceCount += 1
    byPatient.set(inv.patient_id, bucket)
  }
  for (const p of payments) {
    const amount = p.amount || 0
    if (amount <= 0) continue
    const inv = invoiceById.get(p.invoice_id)
    if (!inv || !isActiveInvoice(inv) || !inv.patient_id) continue
    const bucket = byPatient.get(inv.patient_id) || { totalBilled: 0, totalPaid: 0, invoiceCount: 0 }
    bucket.totalPaid += amount
    byPatient.set(inv.patient_id, bucket)
  }
  return Array.from(byPatient.entries())
    .map(([patientId, { totalBilled, totalPaid, invoiceCount }]) => ({
      patientId,
      name: nameById.get(patientId) || 'Patient',
      collected: totalPaid,
      totalBilled,
      totalPaid,
      invoiceCount,
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid)
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

/** YoY: new-patient count per calendar month, for the two picked years. Always full history. */
export function newPatientsYoY(patients: AnalyticsPatient[], pickedYears: YoYYears): { data: YoYPoint[]; years: string[] } {
  const years = dedupeYears(pickedYears)
  const byYearMonth = new Map<string, number>()
  for (const p of patients) {
    const d = new Date(p.created_at)
    if (isNaN(d.getTime())) continue
    const year = String(d.getFullYear())
    if (!years.includes(year)) continue
    const key = `${year}-${d.getMonth()}`
    byYearMonth.set(key, (byYearMonth.get(key) || 0) + 1)
  }
  const data = emptyYoYAxis(years)
  for (const point of data) {
    const monthIdx = Number(point.month) - 1
    for (const year of years) point[year] = byYearMonth.get(`${year}-${monthIdx}`) || 0
  }
  return { data, years }
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

/**
 * YoY: total distinct active (non-Cancelled) patients seen per calendar month, for
 * the two picked years. Collapses the new/returning split shown in Monthly mode —
 * a 2-series-by-year grouped chart isn't readable.
 */
export function totalPatientsSeenYoY(appointments: AnalyticsAppointment[], pickedYears: YoYYears): { data: YoYPoint[]; years: string[] } {
  const years = dedupeYears(pickedYears)
  const byYearMonth = new Map<string, Set<string>>()
  for (const a of appointments) {
    if (!a.patient_id || !a.date_time || a.status === 'Cancelled') continue
    const d = new Date(a.date_time)
    if (isNaN(d.getTime())) continue
    const year = String(d.getFullYear())
    if (!years.includes(year)) continue
    const key = `${year}-${d.getMonth()}`
    const set = byYearMonth.get(key) || new Set<string>()
    set.add(a.patient_id)
    byYearMonth.set(key, set)
  }
  const data = emptyYoYAxis(years)
  for (const point of data) {
    const monthIdx = Number(point.month) - 1
    for (const year of years) point[year] = byYearMonth.get(`${year}-${monthIdx}`)?.size || 0
  }
  return { data, years }
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

export interface TypeYoYRow {
  type: string
  [year: string]: number | string
}

/** Top-5 types (by all-time non-cancelled count) as per-calendar-year counts, for the two picked years. Always full history. */
export function procedureCountsYoY(treatments: AnalyticsTreatment[], pickedYears: YoYYears): { data: TypeYoYRow[]; years: string[] } {
  const years = dedupeYears(pickedYears)
  const normalize = buildTypeNormalizer(treatments.map((t) => t.treatment_type))
  const totalByType = new Map<string, number>()
  const byTypeYear = new Map<string, Map<string, number>>()
  for (const t of treatments) {
    if (t.status === 'Cancelled') continue
    const type = normalize(t.treatment_type)
    totalByType.set(type, (totalByType.get(type) || 0) + 1)
    const year = yearKey(t.created_at)
    if (!year || !years.includes(year)) continue
    const byYear = byTypeYear.get(type) || new Map<string, number>()
    byYear.set(year, (byYear.get(year) || 0) + 1)
    byTypeYear.set(type, byYear)
  }
  const topTypes = Array.from(totalByType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type)
  const data = topTypes.map((type) => {
    const row: TypeYoYRow = { type }
    const byYear = byTypeYear.get(type)
    for (const year of years) row[year] = byYear?.get(year) || 0
    return row
  })
  return { data, years }
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

/** Same top-5 type selection as procedureCountsYoY (by all-time frequency, matching avgCostByType's sort); per-year mean cost. Always full history. */
export function avgCostYoY(treatments: AnalyticsTreatment[], pickedYears: YoYYears): { data: TypeYoYRow[]; years: string[] } {
  const years = dedupeYears(pickedYears)
  const normalize = buildTypeNormalizer(treatments.map((t) => t.treatment_type))
  const freqByType = new Map<string, number>()
  const sumByTypeYear = new Map<string, Map<string, { total: number; n: number }>>()
  for (const t of treatments) {
    if (t.status === 'Cancelled') continue
    const type = normalize(t.treatment_type)
    freqByType.set(type, (freqByType.get(type) || 0) + 1)
    const cost = t.cost || 0
    if (cost <= 0) continue
    const year = yearKey(t.created_at)
    if (!year || !years.includes(year)) continue
    const byYear = sumByTypeYear.get(type) || new Map<string, { total: number; n: number }>()
    const bucket = byYear.get(year) || { total: 0, n: 0 }
    bucket.total += cost
    bucket.n += 1
    byYear.set(year, bucket)
    sumByTypeYear.set(type, byYear)
  }
  const topTypes = Array.from(freqByType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type)
  const data = topTypes.map((type) => {
    const row: TypeYoYRow = { type }
    const byYear = sumByTypeYear.get(type)
    for (const year of years) {
      const bucket = byYear?.get(year)
      row[year] = bucket && bucket.n > 0 ? Math.round(bucket.total / bucket.n) : 0
    }
    return row
  })
  return { data, years }
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

export interface ConversionTrendPoint {
  month: string
  label: string
  completionRatePct: number
  completed: number
  pipeline: number
}

/** Per-month completion rate (%), bucketed by treatment created_at; pipeline = planned+inProgress+completed (Cancelled excluded). */
export function treatmentConversionByMonth(treatments: AnalyticsTreatment[], monthAxis: string[]): ConversionTrendPoint[] {
  const byMonth = new Map<string, { completed: number; pipeline: number }>()
  for (const t of treatments) {
    if (t.status === 'Cancelled') continue
    const key = monthKey(t.created_at)
    if (!key) continue
    const bucket = byMonth.get(key) || { completed: 0, pipeline: 0 }
    bucket.pipeline += 1
    if (t.status === 'Completed') bucket.completed += 1
    byMonth.set(key, bucket)
  }
  return monthAxis.map((month) => {
    const bucket = byMonth.get(month) || { completed: 0, pipeline: 0 }
    return {
      month,
      label: monthLabel(month),
      completionRatePct: bucket.pipeline > 0 ? Math.round((bucket.completed / bucket.pipeline) * 100) : 0,
      completed: bucket.completed,
      pipeline: bucket.pipeline,
    }
  })
}

/** YoY completion rate (%) per calendar month, for the two picked years. Always full history. */
export function treatmentConversionYoY(treatments: AnalyticsTreatment[], pickedYears: YoYYears): { data: YoYPoint[]; years: string[] } {
  const years = dedupeYears(pickedYears)
  const completedByYM = new Map<string, number>()
  const pipelineByYM = new Map<string, number>()
  for (const t of treatments) {
    if (t.status === 'Cancelled') continue
    const d = new Date(t.created_at)
    if (isNaN(d.getTime())) continue
    const year = String(d.getFullYear())
    if (!years.includes(year)) continue
    const key = `${year}-${d.getMonth()}`
    pipelineByYM.set(key, (pipelineByYM.get(key) || 0) + 1)
    if (t.status === 'Completed') completedByYM.set(key, (completedByYM.get(key) || 0) + 1)
  }
  const data = emptyYoYAxis(years)
  for (const point of data) {
    const monthIdx = Number(point.month) - 1
    for (const year of years) {
      const key = `${year}-${monthIdx}`
      const pipeline = pipelineByYM.get(key) || 0
      const completed = completedByYM.get(key) || 0
      point[year] = pipeline > 0 ? Math.round((completed / pipeline) * 100) : 0
    }
  }
  return { data, years }
}

/**
 * Downloads a CSV export of clinic invoices and revenue ledger for Analytics.
 */
export function exportClinicAnalyticsCSV(
  invoices: AnalyticsInvoice[],
  patients: AnalyticsPatient[],
  rangeLabel: string
) {
  const patientMap = new Map<string, string>()
  patients.forEach((p) => {
    patientMap.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient')
  })

  const headers = ['Invoice Date', 'Patient Name', 'Total Billed (BDT)', 'Paid Amount (BDT)', 'Outstanding Due (BDT)', 'Status']
  const rows = invoices.map((inv) => {
    const dateStr = inv.created_at ? inv.created_at.substring(0, 10) : ''
    const ptName = inv.patient_id ? patientMap.get(inv.patient_id) || 'Patient' : 'Patient'
    const total = inv.total_amount || 0
    const paid = inv.paid_amount || 0
    const due = Math.max(0, total - paid)
    return [
      csvCell(dateStr),
      csvCell(ptName),
      total.toFixed(2),
      paid.toFixed(2),
      due.toFixed(2),
      csvCell(inv.status || 'Active'),
    ].join(',')
  })

  const csvContent = [headers.join(','), ...rows].join('\n')
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Clinic_Analytics_Revenue_${rangeLabel}.csv`
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Generates an A4 PDF Summary Report for Clinic Analytics. Returns the
 * document rather than saving it — callers share it via sharePdf() (a
 * plain jsPDF .save() silently does nothing in the Capacitor Android
 * app's WebView, which has no download handler wired up).
 */
export function generateClinicAnalyticsPDF(
  invoices: AnalyticsInvoice[],
  monthly: MonthlyRevenuePoint[],
  topSources: TopRevenueSource[],
  counts: ProcedureCountRow[],
  rangeLabel: string
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = 40

  // Title Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(15, 118, 110)
  doc.text('CLINIC FINANCIAL & REVENUE ANALYTICS REPORT', marginX, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(`Time Range Filter: ${rangeLabel.toUpperCase()}`, marginX, y)
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, pageWidth - marginX, y, { align: 'right' })
  y += 20

  // Summary Metrics Calculation
  let totalBilled = 0
  let totalPaid = 0
  invoices.forEach((inv) => {
    totalBilled += inv.total_amount || 0
    totalPaid += inv.paid_amount || 0
  })
  const totalDue = Math.max(0, totalBilled - totalPaid)

  // Summary Box Table
  autoTable(doc, {
    startY: y,
    head: [['Total Invoices', 'Total Billed', 'Total Collected', 'Outstanding Due']],
    body: [[
      invoices.length.toString(),
      formatBDT(totalBilled),
      formatBDT(totalPaid),
      formatBDT(totalDue),
    ]],
    styles: { fontSize: 9, cellPadding: 6, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255] },
    theme: 'grid',
    margin: { left: marginX, right: marginX },
  })

  y = (doc as any).lastAutoTable.finalY + 20

  // Monthly Revenue Table
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('Monthly Revenue Breakdown', marginX, y)
  y += 10

  const monthlyRows = monthly.map((m) => [m.label, formatBDT(m.billed), formatBDT(m.collected)])
  autoTable(doc, {
    startY: y,
    head: [['Month', 'Billed Amount', 'Collected Amount']],
    body: monthlyRows,
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
    theme: 'striped',
    margin: { left: marginX, right: marginX },
  })

  y = (doc as any).lastAutoTable.finalY + 20

  // Top Revenue Patients
  if (topSources && topSources.length > 0) {
    if (y > 700) {
      doc.addPage()
      y = 40
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text('Top Revenue Sources (Patients)', marginX, y)
    y += 10

    const ptRows = topSources.slice(0, 10).map((pt) => [pt.name, formatBDT(pt.totalBilled), formatBDT(pt.totalPaid)])
    autoTable(doc, {
      startY: y,
      head: [['Patient Name', 'Total Billed', 'Total Paid']],
      body: ptRows,
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      theme: 'striped',
      margin: { left: marginX, right: marginX },
    })

    y = (doc as any).lastAutoTable.finalY + 20
  }

  // Treatment Mix Breakdown
  if (counts && counts.length > 0) {
    if (y > 700) {
      doc.addPage()
      y = 40
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text('Procedure Breakdown', marginX, y)
    y += 10

    const procRows = counts.map((c) => [c.type, c.count.toString()])
    autoTable(doc, {
      startY: y,
      head: [['Procedure / Treatment Type', 'Completed Count']],
      body: procRows,
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      theme: 'striped',
      margin: { left: marginX, right: marginX },
    })
  }

  return doc
}


