import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

interface PaymentEntryModalProps {
  invoiceId: string
  invoiceTotal: number
  invoicePaid: number
  onClose: () => void
  onSaved: () => void
}

interface PaymentMethod {
  id: string
  name: string
}

export function PaymentEntryModal({
  invoiceId,
  invoiceTotal,
  invoicePaid,
  onClose,
  onSaved,
}: PaymentEntryModalProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [amount, setAmount] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const remaining = useMemo(() => Math.max(invoiceTotal - invoicePaid, 0), [invoiceTotal, invoicePaid])

  useEffect(() => {
    loadMethods()
    setAmount(remaining > 0 ? String(remaining) : '')
  }, [remaining])

  async function loadMethods() {
    const { data } = await supabase
      .from('payment_methods')
      .select('id, name')
      .eq('is_active', true)
      .order('name')

    setMethods((data as PaymentMethod[]) || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedAmount = parseFloat(amount) || 0

    if (parsedAmount <= 0) {
      alert('Payment amount must be greater than 0')
      return
    }

    setSaving(true)

    try {
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          invoice_id: invoiceId,
          payment_method_id: paymentMethodId || null,
          amount: parsedAmount,
          reference: reference || null,
          notes: notes || null,
        })

      if (paymentError) throw paymentError

      const newPaidAmount = invoicePaid + parsedAmount
      const newStatus = newPaidAmount >= invoiceTotal ? 'Paid' : 'Pending'

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
          payment_method_id: paymentMethodId || null,
        },
      })

      onSaved()
    } catch (error) {
      console.error('Failed to record payment:', error)
      alert('Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Record Payment</h3>
          <p className="text-sm text-text-secondary">Remaining balance: {remaining.toFixed(2)}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Payment Method</label>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select method...</option>
              {methods.map((method) => (
                <option key={method.id} value={method.id}>{method.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
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

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Saving...' : 'Save Payment'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
