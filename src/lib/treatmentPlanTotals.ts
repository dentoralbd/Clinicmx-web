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
