import { extractTreatmentIdsFromInvoiceItems, getTreatmentOriginalCost } from '@/lib/billing'

export interface TreatmentPlanTreatment {
  id: string
  treatment_type: string
  description?: string | null
  tooth_number?: number | null
  cost?: number | null
  original_cost?: number | null
  status: string
  notes?: string | null
  invoice_id?: string | null
  created_at?: string | null
}

export interface TreatmentPlanInvoiceLike {
  id: string
  status?: string | null
  total_amount?: number | null
  discount_amount?: number | null
  items?: unknown[] | null
}

/**
 * A treatment's own `invoice_id` can point at a stale, already-Merged invoice —
 * invoice merges don't rewrite treatments.invoice_id, only the invoice rows
 * themselves (`merged_into_invoice_id`). Resolve to the live invoice the same
 * way `invoiceSync.ts`'s `findLinkedInvoice` does: prefer a direct non-Merged
 * match, otherwise fall back to scanning for a live invoice whose items still
 * reference this treatment.
 */
function resolveLiveInvoiceForTreatment(
  treatment: TreatmentPlanTreatment,
  invoices: TreatmentPlanInvoiceLike[]
): TreatmentPlanInvoiceLike | null {
  if (treatment.invoice_id) {
    const direct = invoices.find((inv) => inv.id === treatment.invoice_id && inv.status !== 'Merged')
    if (direct) return direct
  }
  return (
    invoices.find(
      (inv) =>
        inv.status !== 'Merged' &&
        Array.isArray(inv.items) &&
        extractTreatmentIdsFromInvoiceItems(inv.items).has(treatment.id)
    ) || null
  )
}

/**
 * Plan-level totals, anchored to real invoice figures wherever a treatment is
 * billed — a treatment's own cost/original_cost only reflects the discount
 * applied when the plan/price was set, which can drift from what a patient
 * was actually billed (ad-hoc discounts added when the invoice was created or
 * edited, invoice merges, manually-added invoice line items). For each
 * distinct invoice a displayed treatment resolves to, its own total_amount/
 * discount_amount is used once (never per-treatment-prorated); treatments not
 * yet billed fall back to their own original_cost/cost as the best estimate.
 */
export function computeTreatmentPlanTotals(
  treatments: TreatmentPlanTreatment[],
  invoices: TreatmentPlanInvoiceLike[] = []
): { subtotal: number; discount: number; total: number } {
  const seenInvoiceIds = new Set<string>()
  let subtotal = 0
  let discount = 0
  let total = 0

  for (const treatment of treatments) {
    const invoice = resolveLiveInvoiceForTreatment(treatment, invoices)
    if (invoice) {
      if (seenInvoiceIds.has(invoice.id)) continue
      seenInvoiceIds.add(invoice.id)
      const invoiceTotal = Number(invoice.total_amount) || 0
      const invoiceDiscount = Number(invoice.discount_amount) || 0
      subtotal += invoiceTotal + invoiceDiscount
      discount += invoiceDiscount
      total += invoiceTotal
      continue
    }
    const original = getTreatmentOriginalCost(treatment)
    const cost = treatment.cost ?? 0
    subtotal += original
    discount += Math.max(original - cost, 0)
    total += cost
  }

  const round = (value: number) => Math.round(value * 100) / 100
  return { subtotal: round(subtotal), discount: round(discount), total: round(total) }
}

export interface TreatmentPlanDisplayRow {
  id: string
  treatment_type: string
  description?: string | null
  toothLabel: string
  status: string
  notes?: string | null
  cost: number
  count: number
  created_at?: string | null
}

/**
 * Row-level display grouping — same idea as `billing.ts`'s `groupSimilarInvoiceItems`
 * (invoice/estimate "Group similar"): merges treatments identical apart from tooth
 * number into one row like "T23, T45" with summed cost. Only rows matching on type,
 * description, cost, AND status merge — differing status/price/description means a
 * clinically different item, so they stay separate. Purely a display transform; plan
 * totals (`computeTreatmentPlanTotals`) always use the raw, ungrouped treatment list.
 */
export function buildTreatmentPlanRows(
  treatments: TreatmentPlanTreatment[],
  groupSimilar: boolean
): TreatmentPlanDisplayRow[] {
  if (!groupSimilar) {
    return treatments.map((t) => ({
      id: t.id,
      treatment_type: t.treatment_type,
      description: t.description,
      toothLabel: t.tooth_number ? `T${t.tooth_number}` : '—',
      status: t.status,
      notes: t.notes,
      cost: t.cost ?? 0,
      count: 1,
      created_at: t.created_at,
    }))
  }

  const groups = new Map<string, TreatmentPlanTreatment[]>()
  for (const t of treatments) {
    const key = `${t.treatment_type}::${(t.description || '').trim()}::${t.cost ?? 0}::${t.status}`
    const existing = groups.get(key)
    if (existing) existing.push(t)
    else groups.set(key, [t])
  }

  return Array.from(groups.values()).map((members) => {
    const first = members[0]
    const teeth = members
      .map((m) => m.tooth_number)
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b)
    const toothLabel = teeth.length > 0 ? teeth.map((n) => `T${n}`).join(', ') : '—'
    const sameNotes = members.every((m) => (m.notes || '').trim() === (first.notes || '').trim())
    return {
      id: first.id,
      treatment_type: first.treatment_type,
      description: first.description,
      toothLabel,
      status: first.status,
      notes: sameNotes ? first.notes : null,
      cost: members.reduce((sum, m) => sum + (m.cost ?? 0), 0),
      count: members.length,
      created_at: members.reduce<string | null>((latest, m) => {
        if (!m.created_at) return latest
        if (!latest || m.created_at > latest) return m.created_at
        return latest
      }, null),
    }
  })
}
