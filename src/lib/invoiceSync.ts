import { supabase } from '@/lib/supabase'
import {
  buildInvoiceRecalcPayload,
  extractTreatmentIdsFromInvoiceItems,
  isSchemaCompatibilityError,
  type RecalculableInvoice,
} from '@/lib/billing'

export interface SyncableTreatment {
  id: string
  patient_id: string
  invoice_id?: string | null
  is_invoiced?: boolean | null
}

export interface LinkedInvoiceLike extends RecalculableInvoice {
  status: string
  invoice_number?: string | null
}

export interface InvoiceSyncResult {
  invoiceId: string
  invoiceNumber: string | null
  /** The recalculated fields written to the invoice (extended shape) */
  appliedPayload: Record<string, unknown>
}

async function findLinkedInvoice(
  treatment: SyncableTreatment,
  knownInvoices?: LinkedInvoiceLike[]
): Promise<LinkedInvoiceLike | null> {
  if (knownInvoices) {
    return (
      knownInvoices.find((inv) => inv.id === treatment.invoice_id && inv.status !== 'Merged') ||
      knownInvoices.find(
        (inv) =>
          inv.status !== 'Merged' &&
          Array.isArray(inv.items) &&
          extractTreatmentIdsFromInvoiceItems(inv.items).has(treatment.id)
      ) ||
      null
    )
  }

  try {
    if (treatment.invoice_id) {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', treatment.invoice_id)
        .maybeSingle()
      if (error) throw error
      if (data && (data as LinkedInvoiceLike).status !== 'Merged') return data as LinkedInvoiceLike
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('patient_id', treatment.patient_id)
      .neq('status', 'Merged')
    if (error) throw error
    return (
      ((data as LinkedInvoiceLike[]) || []).find(
        (inv) => Array.isArray(inv.items) && extractTreatmentIdsFromInvoiceItems(inv.items).has(treatment.id)
      ) || null
    )
  } catch (error) {
    // A schema that cannot express the link has nothing to sync
    if (isSchemaCompatibilityError(error)) return null
    throw error
  }
}

/**
 * Rebuilds the linked live invoice after a treatment was edited or deleted:
 * regenerates its treatment-sourced items (manual items preserved), recomputes
 * totals/status, and records an invoice_history event. The treatment change is
 * already committed — this throws on failure so the CALLER can alert; it never
 * rolls the treatment change back. No alerts, activity log, or state updates
 * inside. Returns null when no live linked invoice exists.
 */
export async function syncInvoiceForTreatmentChange(
  treatment: SyncableTreatment,
  change: 'edited' | 'deleted',
  options?: { knownInvoices?: LinkedInvoiceLike[] }
): Promise<InvoiceSyncResult | null> {
  const invoice = await findLinkedInvoice(treatment, options?.knownInvoices)
  if (!invoice) return null

  const linkedIds = extractTreatmentIdsFromInvoiceItems(Array.isArray(invoice.items) ? invoice.items : [])
  if (change === 'deleted') {
    linkedIds.delete(treatment.id)
  } else {
    linkedIds.add(treatment.id)
  }

  // Fetch fresh rows — the treatment change is already committed, so this reflects it
  let remaining: Array<{
    id: string
    treatment_type: string
    description: string | null
    tooth_number: number | null
    cost: number | null
  }> = []
  if (linkedIds.size > 0) {
    const { data, error } = await supabase
      .from('treatments')
      .select('id, treatment_type, description, tooth_number, cost')
      .in('id', Array.from(linkedIds))
    if (error) throw error
    remaining = data || []
  }

  const { basePayload, extendedPayload } = buildInvoiceRecalcPayload(invoice, remaining)

  let updateResult = await supabase.from('invoices').update(extendedPayload).eq('id', invoice.id)
  if (updateResult.error && isSchemaCompatibilityError(updateResult.error)) {
    updateResult = await supabase.from('invoices').update(basePayload).eq('id', invoice.id)
  }
  if (updateResult.error) throw updateResult.error

  await supabase.from('invoice_history').insert({
    invoice_id: invoice.id,
    event_type: 'items_recalculated',
    event_data: { reason: `treatment_${change}`, treatment_id: treatment.id },
  }).then(() => {}, () => {})

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number || null,
    appliedPayload: extendedPayload,
  }
}
