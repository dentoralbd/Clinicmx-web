import { useEffect, useState } from 'react'
import { getFriendlySupabaseErrorMessage, isSchemaCompatibilityError, logBillingError } from '@/lib/billing'
import { supabase } from '@/lib/supabase'
import { safeFormat, formatBDT } from '@/lib/utils'
import { PaymentReceiptPrint } from '@/components/PaymentReceiptPrint'
import { canDeletePayment, getAuditActor } from '@/lib/appSession'
import { logActivity } from '@/lib/activityLog'

interface PaymentHistoryPanelProps {
  invoiceId: string
  /** Enables the per-payment "Print receipt" button — only rendered when both are provided */
  invoice?: {
    id: string
    invoice_number?: string | null
    total_amount: number
    paid_amount: number
    created_at: string
  }
  patient?: {
    first_name: string
    last_name: string
    phone?: string | null
    patient_code?: string | null
  }
  /** Enables patient-scoped audit logging (Pt. Log) on payment delete. */
  patientId?: string | null
  /** Called after a payment is deleted so the parent can refresh invoice-level totals/status. */
  onChanged?: () => void
}

interface PaymentRow {
  id: string
  amount: number
  payment_date: string
  payment_method: string | null
  notes: string | null
  /** True insertion order — payment_date is a date-only picker, so same-day
   *  payments tie on it; created_at is what actually orders the ledger. */
  created_at: string
  payment_methods: {
    name: string
  } | null
}

export function PaymentHistoryPanel({ invoiceId, invoice, patient, patientId, onChanged }: PaymentHistoryPanelProps) {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaUnavailable, setSchemaUnavailable] = useState(false)
  const [receiptPayment, setReceiptPayment] = useState<PaymentRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const canDeletePayments = canDeletePayment()

  useEffect(() => {
    loadPayments()
  }, [invoiceId])

  async function loadPayments() {
    setLoading(true)
    setSchemaUnavailable(false)

    try {
      const primaryQuery = await supabase
        .from('payments')
        .select('id, amount, payment_date, payment_method, notes, created_at, payment_methods(name)')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })

      if (primaryQuery.error && !isSchemaCompatibilityError(primaryQuery.error)) {
        throw primaryQuery.error
      }

      if (!primaryQuery.error) {
        setPayments((primaryQuery.data as PaymentRow[]) || [])
        return
      }

      const fallbackQuery = await supabase
        .from('payments')
        .select('id, amount, payment_date, payment_method, notes, created_at')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })

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

  async function handleDelete(payment: PaymentRow) {
    if (!confirm(`Delete this ${formatBDT(payment.amount)} payment? This cannot be undone.`)) return

    setDeletingId(payment.id)
    try {
      const { error: deleteError } = await supabase.from('payments').delete().eq('id', payment.id)
      if (deleteError) throw deleteError

      if (invoice) {
        const remaining = payments.filter((p) => p.id !== payment.id)
        const newPaid = Math.max(remaining.reduce((sum, p) => sum + p.amount, 0), 0)
        const newStatus =
          newPaid >= invoice.total_amount && invoice.total_amount > 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Pending'

        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({ paid_amount: newPaid, status: newStatus })
          .eq('id', invoice.id)
        if (invoiceError) throw invoiceError

        await supabase
          .from('invoice_history')
          .insert({
            invoice_id: invoice.id,
            event_type: 'payment_deleted',
            event_data: {
              amount: payment.amount,
              payment_method: payment.payment_method || payment.payment_methods?.name || null,
              deleted_by: getAuditActor(),
            },
          })
          .then(() => {}, () => {})
      }

      const methodLabel = payment.payment_method || payment.payment_methods?.name || 'Cash'
      logActivity({
        action: 'delete',
        entityType: 'payment',
        entityId: payment.id,
        entityLabel: invoice?.invoice_number ?? null,
        patientId: patientId ?? null,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        details: `${formatBDT(payment.amount)} (${methodLabel}) removed from invoice ${invoice?.invoice_number || ''}`.trim(),
      })

      setPayments((prev) => prev.filter((p) => p.id !== payment.id))
      onChanged?.()
    } catch (error) {
      logBillingError('Failed to delete payment', error, { invoiceId, paymentId: payment.id })
      alert('Failed to delete payment')
    } finally {
      setDeletingId(null)
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

  // Replay the ledger oldest-first (by true insertion order, not the date-only
  // payment_date picker which same-day payments tie on) to compute the running
  // balance after each payment. The most recent payment uses the invoice's live
  // due (exact even if older rows are missing on a legacy schema); earlier
  // receipts show the replayed (approximate) figure.
  const ascending = [...payments].sort((a, b) => {
    const byCreated = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id)
  })
  const remainingAfterById = new Map<string, number>()
  if (invoice) {
    let cumulative = 0
    ascending.forEach((payment, idx) => {
      cumulative += payment.amount
      const isLast = idx === ascending.length - 1
      const remaining = isLast
        ? Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)
        : Math.max((invoice.total_amount || 0) - cumulative, 0)
      remainingAfterById.set(payment.id, remaining)
    })
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
          <div className="flex items-center gap-3 mt-1.5">
            {invoice && patient && (
              <button
                onClick={() => setReceiptPayment(payment)}
                className="text-xs text-primary hover:underline"
              >
                Print receipt
              </button>
            )}
            {canDeletePayments && (
              <button
                onClick={() => handleDelete(payment)}
                disabled={deletingId === payment.id}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                {deletingId === payment.id ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      ))}

      {receiptPayment && invoice && patient && (
        <PaymentReceiptPrint
          payment={receiptPayment}
          invoice={invoice}
          patient={patient}
          remainingAfter={remainingAfterById.get(receiptPayment.id) ?? 0}
          onClose={() => setReceiptPayment(null)}
        />
      )}
    </div>
  )
}
