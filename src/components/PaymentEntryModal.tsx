import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { getFriendlySupabaseErrorMessage, isSchemaCompatibilityError, logBillingError } from '@/lib/billing'
import { supabase } from '@/lib/supabase'

interface PaymentEntryModalProps {
  invoiceId: string
  invoiceTotal: number
  invoicePaid: number
  onClose: () => void
  onSaved: () => void
}

const PAYMENT_METHODS = ['Cash', 'Card', 'Cheque', 'Transfer'] as const

export function PaymentEntryModal({
  invoiceId,
  invoiceTotal,
  invoicePaid,
  onClose,
  onSaved,
}: PaymentEntryModalProps) {
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('Cash')
  const [paymentDate, setPaymentDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const remaining = useMemo(() => Math.max(invoiceTotal - invoicePaid, 0), [invoiceTotal, invoicePaid])
  const parsedAmount = parseFloat(amount) || 0
  const remainingAfterPayment = Math.max(remaining - parsedAmount, 0)

  useEffect(() => {
    setAmount(remaining > 0 ? String(remaining) : '')
    setPaymentDate(new Date().toISOString().slice(0, 10))
  }, [remaining])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (parsedAmount <= 0) {
      alert('Payment amount must be greater than 0')
      return
    }
    if (parsedAmount > remaining) {
      alert('Payment amount cannot be greater than remaining balance')
      return
    }
    if (!paymentDate) {
      alert('Please select a payment date')
      return
    }

    setSaving(true)

    try {
      const paymentDateIso = new Date(`${paymentDate}T00:00:00`).toISOString()
      let paymentStored = false
      let paymentSchemaError: unknown = null
      const paymentPayloads: Array<{
        invoice_id: string
        amount: number
        payment_method?: string
        payment_date?: string
        notes?: string | null
      }> = [
        {
          invoice_id: invoiceId,
          amount: parsedAmount,
          payment_method: paymentMethod,
          payment_date: paymentDateIso,
          notes: notes || null,
        },
        {
          invoice_id: invoiceId,
          amount: parsedAmount,
          payment_date: paymentDateIso,
        },
        {
          invoice_id: invoiceId,
          amount: parsedAmount,
        },
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

      const newPaidAmount = invoicePaid + parsedAmount
      const newStatus = newPaidAmount >= invoiceTotal ? 'Paid' : newPaidAmount > 0 ? 'Partial' : 'Pending'

      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus,
        })
        .eq('id', invoiceId)

      if (invoiceError) throw invoiceError

      await supabase.from('invoice_history').insert({
        invoice_id: invoiceId,
        event_type: 'payment_recorded',
        event_data: {
          amount: parsedAmount,
          payment_method: paymentMethod,
        },
      }).then(() => {}, () => {})

      if (!paymentStored && paymentSchemaError) {
        logBillingError('Payment recorded without payment ledger row', paymentSchemaError, { invoiceId, amount: parsedAmount })
      }

      const warning = !paymentStored
        ? ' Payment total was updated, but detailed payment history could not be stored on this database schema yet.'
        : ''
      alert(`Payment recorded. Remaining balance: ${remainingAfterPayment.toFixed(2)}.${warning}`)
      onSaved()
    } catch (error) {
      logBillingError('Failed to record payment', error, { invoiceId, amount: parsedAmount })
      alert(`Failed to record payment: ${getFriendlySupabaseErrorMessage(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-full sm:max-w-lg w-full my-4 sm:my-8">
        <div className="p-3 sm:p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Record Payment</h3>
          <p className="text-sm text-text-secondary">Remaining balance: {remaining.toFixed(2)}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-text-secondary mt-1">Balance after payment: {remainingAfterPayment.toFixed(2)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Payment Date</label>
            <input
              required
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button type="submit" disabled={saving || remaining <= 0} className="w-full sm:flex-1">
              {saving ? 'Saving...' : 'Save Payment'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
