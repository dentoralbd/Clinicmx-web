import { useEffect, useState } from 'react'
import { getFriendlySupabaseErrorMessage, isSchemaCompatibilityError, logBillingError } from '@/lib/billing'
import { supabase } from '@/lib/supabase'
import { safeFormat, formatBDT } from '@/lib/utils'

interface PaymentHistoryPanelProps {
  invoiceId: string
}

interface PaymentRow {
  id: string
  amount: number
  payment_date: string
  payment_method: string | null
  notes: string | null
  payment_methods: {
    name: string
  } | null
}

export function PaymentHistoryPanel({ invoiceId }: PaymentHistoryPanelProps) {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaUnavailable, setSchemaUnavailable] = useState(false)

  useEffect(() => {
    loadPayments()
  }, [invoiceId])

  async function loadPayments() {
    setLoading(true)
    setSchemaUnavailable(false)

    try {
      const primaryQuery = await supabase
        .from('payments')
        .select('id, amount, payment_date, payment_method, notes, payment_methods(name)')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: false })

      if (primaryQuery.error && !isSchemaCompatibilityError(primaryQuery.error)) {
        throw primaryQuery.error
      }

      if (!primaryQuery.error) {
        setPayments((primaryQuery.data as PaymentRow[]) || [])
        return
      }

      const fallbackQuery = await supabase
        .from('payments')
        .select('id, amount, payment_date, payment_method, notes')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: false })

      if (fallbackQuery.error) throw fallbackQuery.error

      setPayments((fallbackQuery.data as PaymentRow[]) || [])
    } catch (error) {
      logBillingError('Failed to load payment history', error, { invoiceId })
      setPayments([])
      setSchemaUnavailable(isSchemaCompatibilityError(error) || /payments/i.test(getFriendlySupabaseErrorMessage(error)))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-text-secondary">Loading payment history...</div>
  }

  if (payments.length === 0) {
    return (
      <div className="text-sm text-text-secondary">
        {schemaUnavailable ? 'Detailed payment history is unavailable on this database schema yet.' : 'No payments recorded yet.'}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {payments.map((payment) => (
        <div key={payment.id} className="text-sm bg-white rounded border border-gray-200 p-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-primary">{formatBDT(payment.amount)}</span>
            <span className="text-xs text-text-secondary">{safeFormat(payment.payment_date, 'MMM d, yyyy h:mm a')}</span>
          </div>
          <div className="text-xs text-text-secondary mt-1">
            Method: {payment.payment_method || payment.payment_methods?.name || 'Not specified'}
          </div>
          {payment.notes && <p className="text-xs mt-1">{payment.notes}</p>}
        </div>
      ))}
    </div>
  )
}
