import { supabase } from '@/lib/supabase'
import { isSchemaCompatibilityError, logBillingError } from '@/lib/billing'
import { enqueueMutation, newGroupId } from '@/lib/offlineSync'
import { isOfflineFailure } from '@/lib/supabaseErrors'
import { queryClient } from '@/lib/queryClient'
import { qk } from '@/repositories/keys'
import { formatBDT } from '@/lib/utils'

export interface RecordInvoicePaymentArgs {
  invoiceId: string
  amount: number
  invoiceTotal: number
  /** paid_amount BEFORE this payment */
  invoicePaid: number
  method?: string
  paymentDateIso?: string
  notes?: string | null
  /** Lets an offline-queued payment patch the right patient's cached bundle and label its outbox card. Omit only when the caller genuinely has no patient context (payment recording still works — just without that optimistic UI). */
  patientId?: string | null
  patientName?: string | null
}

export interface RecordInvoicePaymentResult {
  /** false = ledger row skipped on a legacy schema (invoice totals still updated) */
  paymentStored: boolean
  newPaidAmount: number
  newStatus: 'Paid' | 'Partial' | 'Pending'
}

async function enqueueOfflinePayment(args: {
  invoiceId: string
  amount: number
  method: string
  dateIso: string
  notes: string | null
  newPaidAmount: number
  newStatus: RecordInvoicePaymentResult['newStatus']
  patientId?: string | null
  patientName?: string | null
}) {
  const groupId = newGroupId()
  const label = 'Payment'
  const detail = `${formatBDT(args.amount)} via ${args.method}`
  await enqueueMutation({
    table: 'payments',
    action: 'insert',
    payload: {
      id: crypto.randomUUID(),
      invoice_id: args.invoiceId,
      amount: args.amount,
      payment_method: args.method,
      payment_date: args.dateIso,
      notes: args.notes,
    },
    meta: { patientId: args.patientId, patientName: args.patientName, label, detail },
    groupId,
    seq: 0,
  })
  await enqueueMutation({
    table: 'invoices',
    action: 'update',
    payload: { id: args.invoiceId, paid_amount: args.newPaidAmount, status: args.newStatus },
    meta: { patientId: args.patientId, patientName: args.patientName, label: 'Update invoice balance', detail },
    groupId,
    seq: 1,
  })
  queryClient.setQueriesData({ queryKey: qk.patients.all }, (old: any) => {
    if (!old || !old.invoices) return old
    return {
      ...old,
      invoices: (old.invoices || []).map((inv: any) =>
        inv.id === args.invoiceId ? { ...inv, paid_amount: args.newPaidAmount, status: args.newStatus } : inv
      ),
    }
  })
}

/**
 * Records a payment against an invoice: payments ledger row (3-tier payload
 * fallback for legacy schemas), invoice paid_amount/status update, and a
 * swallowed invoice_history event. No alerts and no activity log — callers
 * own their own messaging.
 *
 * Offline (or on a genuine connectivity failure), the payment insert and the
 * invoice balance update are queued as one group so they sync together —
 * see offlineSync.ts. A real server-side rejection still throws.
 */
export async function recordInvoicePayment({
  invoiceId,
  amount,
  invoiceTotal,
  invoicePaid,
  method = 'Cash',
  paymentDateIso,
  notes = null,
  patientId,
  patientName,
}: RecordInvoicePaymentArgs): Promise<RecordInvoicePaymentResult> {
  const dateIso = paymentDateIso || new Date().toISOString()
  const newPaidAmount = invoicePaid + amount
  const newStatus: RecordInvoicePaymentResult['newStatus'] =
    newPaidAmount >= invoiceTotal && invoiceTotal > 0 ? 'Paid' : newPaidAmount > 0 ? 'Partial' : 'Pending'

  if (!navigator.onLine) {
    await enqueueOfflinePayment({ invoiceId, amount, method, dateIso, notes, newPaidAmount, newStatus, patientId, patientName })
    return { paymentStored: true, newPaidAmount, newStatus }
  }

  let paymentStored = false
  let paymentSchemaError: unknown = null
  const paymentPayloads: Array<{
    invoice_id: string
    amount: number
    payment_method?: string
    payment_date?: string
    notes?: string | null
  }> = [
    { invoice_id: invoiceId, amount, payment_method: method, payment_date: dateIso, notes },
    { invoice_id: invoiceId, amount, payment_date: dateIso },
    { invoice_id: invoiceId, amount },
  ]

  try {
    for (const payload of paymentPayloads) {
      const { error: paymentError } = await supabase.from('payments').insert(payload)
      if (!paymentError) {
        paymentStored = true
        paymentSchemaError = null
        break
      }
      if (!isSchemaCompatibilityError(paymentError)) throw paymentError
      paymentSchemaError = paymentError
    }

    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({ paid_amount: newPaidAmount, status: newStatus })
      .eq('id', invoiceId)
    if (invoiceError) throw invoiceError
  } catch (err: any) {
    // postgrest-js RESOLVES (never rejects) on a dead network, so the
    // thrown value here is that resolved error object — its message is
    // prefixed ("TypeError: Failed to fetch") and status is unavailable at
    // this point, but isOfflineFailure's message-regex check still catches
    // it (see supabaseErrors.ts). Replaces a check that only ever fired via
    // !navigator.onLine. isSchemaCompatibilityError above doesn't match
    // network wording, so this ordering is unaffected.
    if (isOfflineFailure(err)) {
      await enqueueOfflinePayment({ invoiceId, amount, method, dateIso, notes, newPaidAmount, newStatus, patientId, patientName })
      return { paymentStored: true, newPaidAmount, newStatus }
    }
    throw err
  }

  // Auto-advance: an invoice reaching Paid completes every treatment still linked to
  // it (unless already Completed/Cancelled). Fire-and-forget, never reverted if a
  // later payment edit/delete drops the invoice back below fully paid — a human can
  // always correct status manually, same as any other status change today.
  if (newStatus === 'Paid') {
    supabase
      .from('treatments')
      .update({ status: 'Completed' })
      .eq('invoice_id', invoiceId)
      .not('status', 'in', '(Completed,Cancelled)')
      .then(() => {}, () => {})
  }

  await supabase.from('invoice_history').insert({
    invoice_id: invoiceId,
    event_type: 'payment_recorded',
    event_data: { amount, payment_method: method },
  }).then(() => {}, () => {})

  if (!paymentStored && paymentSchemaError) {
    logBillingError('Payment recorded without payment ledger row', paymentSchemaError, { invoiceId, amount })
  }

  return { paymentStored, newPaidAmount, newStatus }
}
