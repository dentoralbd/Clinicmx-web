import { supabase } from '@/lib/supabase'
import { isSchemaCompatibilityError, logBillingError } from '@/lib/billing'

export interface RecordInvoicePaymentArgs {
  invoiceId: string
  amount: number
  invoiceTotal: number
  /** paid_amount BEFORE this payment */
  invoicePaid: number
  method?: string
  paymentDateIso?: string
  notes?: string | null
}

export interface RecordInvoicePaymentResult {
  /** false = ledger row skipped on a legacy schema (invoice totals still updated) */
  paymentStored: boolean
  newPaidAmount: number
  newStatus: 'Paid' | 'Partial' | 'Pending'
}

/**
 * Records a payment against an invoice: payments ledger row (3-tier payload
 * fallback for legacy schemas), invoice paid_amount/status update, and a
 * swallowed invoice_history event. No alerts and no activity log — callers
 * own their own messaging.
 */
export async function recordInvoicePayment({
  invoiceId,
  amount,
  invoiceTotal,
  invoicePaid,
  method = 'Cash',
  paymentDateIso,
  notes = null,
}: RecordInvoicePaymentArgs): Promise<RecordInvoicePaymentResult> {
  const dateIso = paymentDateIso || new Date().toISOString()
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

  for (const payload of paymentPayloads) {
    const { error: paymentError } = await supabase.from('payments').insert(payload)
    if (!paymentError) {
      paymentStored = true
      paymentSchemaError = null
      break
    }

    if (!isSchemaCompatibilityError(paymentError)) {
      throw paymentError
    }

    paymentSchemaError = paymentError
  }

  const newPaidAmount = invoicePaid + amount
  const newStatus: RecordInvoicePaymentResult['newStatus'] =
    newPaidAmount >= invoiceTotal && invoiceTotal > 0 ? 'Paid' : newPaidAmount > 0 ? 'Partial' : 'Pending'

  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({ paid_amount: newPaidAmount, status: newStatus })
    .eq('id', invoiceId)

  if (invoiceError) throw invoiceError

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
