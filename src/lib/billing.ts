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
