import type { Json } from '@/lib/database.types'

export interface BillingLineItem {
  description: string
  amount?: string | number | null
  quantity?: string | number | null
  unit_price?: string | number | null
  line_total?: string | number | null
  source_treatment_id?: string | null
  source_treatment_ids?: string[] | null
}

export interface PendingTreatmentLike {
  id: string
  treatment_type: string
  description?: string | null
  tooth_number?: number | null
  cost?: number | null
}

export const QUICK_TREATMENT_OPTIONS = [
  'RCT',
  'Filling',
  'Crown',
  'Scaling',
  'Extraction',
  'Bridge',
] as const

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function parseCurrency(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0
}

export function createInvoiceItem(description = ''): BillingLineItem {
  return {
    description,
    quantity: '1',
    unit_price: '',
    amount: '',
  }
}

export function getInvoiceItemQuantity(item: Partial<BillingLineItem>) {
  const parsed = Number(item.quantity)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function getInvoiceItemLineTotal(item: Partial<BillingLineItem>) {
  const quantity = getInvoiceItemQuantity(item)
  const hasUnitPrice = item.unit_price !== undefined && item.unit_price !== null && `${item.unit_price}` !== ''

  if (hasUnitPrice) {
    return roundCurrency(quantity * parseCurrency(item.unit_price))
  }

  return parseCurrency(item.line_total ?? item.amount)
}

export function getInvoiceItemUnitPrice(item: Partial<BillingLineItem>) {
  const hasUnitPrice = item.unit_price !== undefined && item.unit_price !== null && `${item.unit_price}` !== ''

  if (hasUnitPrice) {
    return parseCurrency(item.unit_price)
  }

  const quantity = getInvoiceItemQuantity(item)
  const lineTotal = getInvoiceItemLineTotal(item)
  return quantity > 0 ? roundCurrency(lineTotal / quantity) : lineTotal
}

export function normalizeInvoiceItem(item: BillingLineItem) {
  const description = item.description.trim()
  const quantity = getInvoiceItemQuantity(item)
  const unitPrice = getInvoiceItemUnitPrice(item)
  const lineTotal = getInvoiceItemLineTotal(item)

  return {
    description,
    quantity,
    unit_price: unitPrice,
    line_total: lineTotal,
    amount: lineTotal,
    ...(item.source_treatment_id ? { source_treatment_id: item.source_treatment_id } : {}),
    ...(Array.isArray(item.source_treatment_ids) && item.source_treatment_ids.length > 0
      ? { source_treatment_ids: item.source_treatment_ids }
      : {}),
  }
}

export function normalizeInvoiceItems(items: BillingLineItem[]) {
  return items
    .map(normalizeInvoiceItem)
    .filter((item) => item.description && item.line_total > 0)
}

export function getInvoiceItemSubtotal(items: Array<Partial<BillingLineItem>>) {
  return roundCurrency(items.reduce((sum, item) => sum + getInvoiceItemLineTotal(item), 0))
}

export function formatInvoiceItemLabel(item: Partial<BillingLineItem>) {
  const description = item.description?.trim() || 'Untitled item'
  const quantity = getInvoiceItemQuantity(item)
  return quantity > 1 ? `${quantity}x ${description}` : description
}

export function buildInvoiceItemPreview(items: Array<Partial<BillingLineItem>>, maxItems = 2) {
  const labels = items
    .filter((item) => item.description?.trim())
    .map(formatInvoiceItemLabel)

  if (labels.length === 0) return ''

  const preview = labels.slice(0, maxItems).join(', ')
  return labels.length > maxItems ? `${preview} +${labels.length - maxItems} more` : preview
}

export function buildTreatmentLabel(treatment: PendingTreatmentLike) {
  const tooth = treatment.tooth_number ? ` (T${treatment.tooth_number})` : ''
  const detail = treatment.description?.trim()
  return detail ? `${treatment.treatment_type}${tooth} – ${detail}` : `${treatment.treatment_type}${tooth}`
}

const TOOTH_TOKEN_PATTERN = /^(.+?)\s*\(T(\d+)\)(?:\s*–\s*(.*))?$/

/**
 * Display-only grouping for the receipt layout: merges lines that are identical
 * apart from tooth number (same treatment name, same detail text, same unit price)
 * into one line like "Filling (T23, T45)" with summed quantity. Variants that
 * differ in name, detail, or price (e.g. GI vs Composite filling) stay separate.
 */
export function groupSimilarInvoiceItems(items: BillingLineItem[]): BillingLineItem[] {
  const grouped = new Map<string, { base: string; detail: string; teeth: string[]; item: BillingLineItem }>()

  for (const item of items) {
    const description = item.description?.trim() || ''
    const match = description.match(TOOTH_TOKEN_PATTERN)
    const base = match ? match[1].trim() : description
    const tooth = match ? match[2] : null
    const detail = match ? (match[3]?.trim() || '') : ''
    const unitPrice = getInvoiceItemUnitPrice(item)
    const key = `${base}::${detail}::${unitPrice}`
    const existing = grouped.get(key)

    if (existing) {
      if (tooth) existing.teeth.push(tooth)
      const prev = existing.item
      existing.item = {
        ...prev,
        quantity: String(getInvoiceItemQuantity(prev) + getInvoiceItemQuantity(item)),
        line_total: roundCurrency(getInvoiceItemLineTotal(prev) + getInvoiceItemLineTotal(item)),
        amount: roundCurrency(getInvoiceItemLineTotal(prev) + getInvoiceItemLineTotal(item)),
        source_treatment_ids: [
          ...(prev.source_treatment_ids || []),
          ...(item.source_treatment_ids || (item.source_treatment_id ? [item.source_treatment_id] : [])),
        ],
      }
      continue
    }

    grouped.set(key, { base, detail, teeth: tooth ? [tooth] : [], item: { ...item } })
  }

  if (grouped.size === items.length) return items

  return Array.from(grouped.values()).map(({ base, detail, teeth, item }) => {
    const sortedTeeth = [...teeth].sort((a, b) => Number(a) - Number(b))
    const toothPart = sortedTeeth.length > 0 ? ` (${sortedTeeth.map((t) => `T${t}`).join(', ')})` : ''
    const detailPart = detail ? ` – ${detail}` : ''
    return { ...item, description: `${base}${toothPart}${detailPart}` }
  })
}

export function buildTreatmentInvoiceItems(treatments: PendingTreatmentLike[]) {
  const groupedItems = new Map<string, BillingLineItem>()

  for (const treatment of treatments) {
    const description = buildTreatmentLabel(treatment)
    const unitPrice = parseCurrency(treatment.cost)
    const key = `${description}::${unitPrice}`
    const existing = groupedItems.get(key)

    if (existing) {
      const nextQuantity = getInvoiceItemQuantity(existing) + 1
      groupedItems.set(key, {
        ...existing,
        quantity: String(nextQuantity),
        source_treatment_ids: [...(existing.source_treatment_ids || []), treatment.id],
      })
      continue
    }

    groupedItems.set(key, {
      description,
      quantity: '1',
      unit_price: String(unitPrice),
      amount: String(unitPrice),
      source_treatment_id: treatment.id,
      source_treatment_ids: [treatment.id],
    })
  }

  return Array.from(groupedItems.values())
}

export function extractTreatmentIdsFromInvoiceItems(items: unknown[]) {
  const treatmentIds = new Set<string>()

  for (const item of items) {
    if (!item || typeof item !== 'object') continue

    const row = item as BillingLineItem
    if (row.source_treatment_id) {
      treatmentIds.add(row.source_treatment_id)
    }

    if (Array.isArray(row.source_treatment_ids)) {
      row.source_treatment_ids.forEach((id) => {
        if (typeof id === 'string' && id) {
          treatmentIds.add(id)
        }
      })
    }
  }

  return treatmentIds
}

export function buildLegacySafeInvoicePayload({
  patientId,
  appointmentId,
  items,
  totalAmount,
  paidAmount,
  status,
  dueDate,
}: {
  patientId: string
  appointmentId?: string | null
  items: BillingLineItem[]
  totalAmount: number
  paidAmount: number
  status: string
  dueDate?: string | null
}) {
  return {
    patient_id: patientId,
    items: items as unknown as Json,
    total_amount: roundCurrency(totalAmount),
    paid_amount: roundCurrency(paidAmount),
    status,
    due_date: dueDate || null,
    ...(appointmentId ? { appointment_id: appointmentId } : {}),
  }
}

export interface MergeableInvoice {
  id: string
  items: BillingLineItem[] | null
  total_amount: number
  paid_amount: number
  discount_amount?: number | null
  tax_amount?: number | null
  due_date?: string | null
  invoice_number?: string | null
}

function mergeInvoiceLabel(invoice: MergeableInvoice) {
  return invoice.invoice_number ? `#${invoice.invoice_number}` : invoice.id.slice(0, 8).toUpperCase()
}

export function buildMergedInvoicePayload(patientId: string, invoices: MergeableInvoice[]) {
  const items = invoices.flatMap((invoice) => (Array.isArray(invoice.items) ? invoice.items : []))
  const totalAmount = roundCurrency(invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0))
  const paidAmount = roundCurrency(invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0))
  const discountAmount = roundCurrency(invoices.reduce((sum, inv) => sum + (inv.discount_amount || 0), 0))
  const taxAmount = roundCurrency(invoices.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0))
  const dueDates = invoices.map((inv) => inv.due_date).filter((d): d is string => Boolean(d)).sort()
  const status = paidAmount >= totalAmount && totalAmount > 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending'

  return {
    patient_id: patientId,
    items: items as unknown as Json,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    due_date: dueDates[0] || null,
    status,
    notes: `Merged from invoices ${invoices.map(mergeInvoiceLabel).join(', ')}`,
  }
}

export interface RecalculableInvoice {
  id: string
  items: unknown
  paid_amount?: number | null
  discount_amount?: number | null
  discount_type?: string | null
  discount_value?: number | null
  tax_rate?: number | null
  tax_amount?: number | null
  credit_amount?: number | null
}

/**
 * Rebuilds an invoice after a linked treatment was edited or deleted.
 * Treatment-sourced items are regenerated from the current treatment rows;
 * manually-added items (no source_treatment_id/_ids) are preserved verbatim.
 * Totals reuse the invoice's stored discount/tax/credit settings; paid_amount
 * is a payment ledger and is never changed here.
 */
export function buildInvoiceRecalcPayload(
  invoice: RecalculableInvoice,
  currentTreatments: PendingTreatmentLike[]
) {
  const existingItems = Array.isArray(invoice.items) ? (invoice.items as BillingLineItem[]) : []
  const manualItems = existingItems.filter(
    (item) =>
      item &&
      typeof item === 'object' &&
      !item.source_treatment_id &&
      !(Array.isArray(item.source_treatment_ids) && item.source_treatment_ids.length > 0)
  )
  const treatmentItems = normalizeInvoiceItems(buildTreatmentInvoiceItems(currentTreatments))
  const items = [...treatmentItems, ...manualItems]

  const subtotal = getInvoiceItemSubtotal(items)
  const discountValue = parseCurrency(invoice.discount_value)
  // Fixed discount_amount is the fallback for pre-008 rows and merged invoices,
  // which store only the summed amount without a type/value.
  const discountAmount =
    invoice.discount_type === 'percentage' && discountValue > 0
      ? roundCurrency(subtotal * (discountValue / 100))
      : discountValue > 0
        ? discountValue
        : parseCurrency(invoice.discount_amount)
  const taxRate = parseCurrency(invoice.tax_rate)
  // Merged invoices carry a summed tax_amount with no tax_rate — keep it as a fixed value.
  const taxAmount =
    taxRate > 0
      ? roundCurrency(Math.max(subtotal - discountAmount, 0) * (taxRate / 100))
      : parseCurrency(invoice.tax_amount)
  const creditAmount = parseCurrency(invoice.credit_amount)
  const totalAmount = roundCurrency(Math.max(subtotal - discountAmount + taxAmount - creditAmount, 0))
  const paidAmount = parseCurrency(invoice.paid_amount)
  const status = paidAmount >= totalAmount && totalAmount > 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending'

  return {
    // Columns from the 001 base schema — safe to update everywhere
    basePayload: {
      items: items as unknown as Json,
      total_amount: totalAmount,
      status,
    },
    // Needs the 007/008 columns
    extendedPayload: {
      items: items as unknown as Json,
      total_amount: totalAmount,
      status,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
    },
  }
}

export function getFriendlySupabaseErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const maybeError = error as { message?: string; details?: string; hint?: string }
    const message = [maybeError.message, maybeError.details, maybeError.hint].filter(Boolean).join(' • ')
    if (message) return message
  }

  if (error instanceof Error) return error.message
  return 'Unknown error occurred'
}

export function isSchemaCompatibilityError(error: unknown) {
  const message = getFriendlySupabaseErrorMessage(error)
  return /does not exist|schema cache|Could not find the table|Could not find the '.*' column|relation .* does not exist/i.test(message)
}

export function logBillingError(context: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(`[Billing] ${context}`, {
    message: getFriendlySupabaseErrorMessage(error),
    error,
    ...extra,
  })
}
