import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeFormat, formatBDT } from '@/lib/utils'
import { logBillingError } from '@/lib/billing'
import { recordInvoicePayment } from '@/lib/payments'

interface InstallmentPlanPanelProps {
  invoiceId: string
  invoice: {
    id: string
    total_amount: number
    paid_amount: number
  }
  /** Called after an installment is marked paid so the parent can refresh invoice-level totals/status. */
  onChanged?: () => void
}

interface InstallmentRow {
  id: string
  installment_no: number
  due_date: string
  amount: number
  status: string
  paid_at: string | null
}

/** Renders nothing when the invoice has no installment schedule (the common case). */
export function InstallmentPlanPanel({ invoiceId, invoice, onChanged }: InstallmentPlanPanelProps) {
  const [installments, setInstallments] = useState<InstallmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState<string | null>(null)

  useEffect(() => {
    loadInstallments()
  }, [invoiceId])

  async function loadInstallments() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payment_plans')
        .select('id, installment_no, due_date, amount, status, paid_at')
        .eq('invoice_id', invoiceId)
        .order('installment_no', { ascending: true })

      if (error) throw error
      setInstallments((data as InstallmentRow[]) || [])
    } catch (error) {
      logBillingError('Failed to load installment plan', error, { invoiceId })
      setInstallments([])
    } finally {
      setLoading(false)
    }
  }

  async function handleMarkPaid(installment: InstallmentRow) {
    if (!confirm(`Mark installment #${installment.installment_no} (${formatBDT(installment.amount)}) as paid?`)) return

    setPayingId(installment.id)
    try {
      // Routes through the same payments ledger every other "mark paid" action uses, so
      // Payment History and the invoice's paid_amount/status stay consistent automatically.
      await recordInvoicePayment({
        invoiceId: invoice.id,
        amount: installment.amount,
        invoiceTotal: invoice.total_amount,
        invoicePaid: invoice.paid_amount,
        method: 'Cash',
        notes: `Installment #${installment.installment_no}`,
      })

      const paidAt = new Date().toISOString()
      const { error } = await supabase
        .from('payment_plans')
        .update({ status: 'Paid', paid_at: paidAt })
        .eq('id', installment.id)
      if (error) throw error

      setInstallments((prev) =>
        prev.map((row) => (row.id === installment.id ? { ...row, status: 'Paid', paid_at: paidAt } : row))
      )
      onChanged?.()
    } catch (error) {
      logBillingError('Failed to mark installment paid', error, { invoiceId, installmentId: installment.id })
      alert('Failed to mark installment as paid')
    } finally {
      setPayingId(null)
    }
  }

  if (loading || installments.length === 0) return null

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Installment Plan</p>
      <div className="space-y-2">
      {installments.map((installment) => {
        const isOverdue = installment.status === 'Pending' && installment.due_date < today
        const statusLabel = installment.status === 'Paid' ? 'Paid' : isOverdue ? 'Overdue' : 'Pending'
        const statusClass =
          statusLabel === 'Paid'
            ? 'text-green-700 bg-green-50'
            : statusLabel === 'Overdue'
              ? 'text-red-700 bg-red-50'
              : 'text-amber-700 bg-amber-50'

        return (
          <div key={installment.id} className="text-sm bg-white rounded border border-gray-200 p-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-primary">
                Installment #{installment.installment_no} — {formatBDT(installment.amount)}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>{statusLabel}</span>
            </div>
            <div className="text-xs text-text-secondary mt-1">
              Due {safeFormat(installment.due_date, 'MMM d, yyyy')}
              {installment.status === 'Paid' && installment.paid_at
                ? ` · Paid ${safeFormat(installment.paid_at, 'MMM d, yyyy')}`
                : ''}
            </div>
            {installment.status !== 'Paid' && (
              <button
                onClick={() => handleMarkPaid(installment)}
                disabled={payingId === installment.id}
                className="text-xs text-primary hover:underline mt-1.5 disabled:opacity-50"
              >
                {payingId === installment.id ? 'Marking paid...' : 'Mark Paid'}
              </button>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}
