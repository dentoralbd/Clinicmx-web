import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { PaymentEntryModal } from '@/components/PaymentEntryModal'
import {
  buildMergedInvoicePayload,
  getFriendlySupabaseErrorMessage,
  logBillingError,
  type MergeableInvoice,
} from '@/lib/billing'
import { supabase } from '@/lib/supabase'
import { formatBDT } from '@/lib/utils'

interface PendingInvoiceLike extends MergeableInvoice {
  status: string
  created_at: string
}

interface PayInvoicePickerModalProps {
  patientId: string
  invoices: PendingInvoiceLike[]
  onClose: () => void
  onChanged: () => void
}

function invoiceDue(invoice: PendingInvoiceLike) {
  return Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)
}

function invoiceLabel(invoice: PendingInvoiceLike) {
  return invoice.invoice_number ? `#${invoice.invoice_number}` : invoice.id.slice(0, 8).toUpperCase()
}

export function PayInvoicePickerModal({ patientId, invoices, onClose, onChanged }: PayInvoicePickerModalProps) {
  const [payingInvoice, setPayingInvoice] = useState<PendingInvoiceLike | null>(null)
  const [merging, setMerging] = useState(false)
  const totalDue = invoices.reduce((sum, invoice) => sum + invoiceDue(invoice), 0)

  async function mergeAndPayAll() {
    setMerging(true)
    try {
      const payload = buildMergedInvoicePayload(patientId, invoices)
      const { data, error } = await supabase.from('invoices').insert([payload]).select('id').single()
      if (error) throw error

      const oldIds = invoices.map((invoice) => invoice.id)
      const newId = data.id as string

      const { error: treatmentsError } = await supabase
        .from('treatments')
        .update({ invoice_id: newId })
        .in('invoice_id', oldIds)
      if (treatmentsError) throw treatmentsError

      const { error: paymentsError } = await supabase
        .from('payments')
        .update({ invoice_id: newId })
        .in('invoice_id', oldIds)
      if (paymentsError) throw paymentsError

      const { error: mergeError } = await supabase
        .from('invoices')
        .update({ status: 'Merged', merged_into_invoice_id: newId })
        .in('id', oldIds)
      if (mergeError) throw mergeError

      await supabase.from('invoice_history').insert({
        invoice_id: newId,
        event_type: 'merged_from',
        event_data: { source_invoice_ids: oldIds },
      }).then(() => {}, () => {})

      await supabase.from('invoice_history').insert(
        oldIds.map((invoiceId) => ({
          invoice_id: invoiceId,
          event_type: 'merged_into',
          event_data: { merged_into_invoice_id: newId },
        }))
      ).then(() => {}, () => {})

      setPayingInvoice({
        id: newId,
        items: payload.items as unknown as MergeableInvoice['items'],
        total_amount: payload.total_amount,
        paid_amount: payload.paid_amount,
        discount_amount: payload.discount_amount,
        tax_amount: payload.tax_amount,
        due_date: payload.due_date,
        status: payload.status,
        created_at: new Date().toISOString(),
      })
      onChanged()
    } catch (error) {
      logBillingError('Failed to merge invoices', error, { invoiceIds: invoices.map((i) => i.id) })
      alert(`Failed to merge invoices: ${getFriendlySupabaseErrorMessage(error)}`)
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-full sm:max-w-lg w-full my-4 sm:my-8">
        <div className="p-3 sm:p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Record Payment</h3>
          <p className="text-sm text-text-secondary">{invoices.length} invoices due — total {formatBDT(totalDue)}</p>
        </div>

        <div className="p-3 sm:p-4 space-y-2 max-h-80 overflow-y-auto">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{invoiceLabel(invoice)}</div>
                <div className="text-xs text-text-secondary">Due {formatBDT(invoiceDue(invoice))}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPayingInvoice(invoice)}>
                Pay
              </Button>
            </div>
          ))}
        </div>

        <div className="p-3 sm:p-4 border-t border-gray-200 flex flex-col sm:flex-row gap-2">
          <Button onClick={mergeAndPayAll} disabled={merging} className="w-full sm:flex-1">
            {merging ? 'Merging...' : `Merge & pay all (${invoices.length})`}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-full sm:flex-1">
            Cancel
          </Button>
        </div>
      </div>

      {payingInvoice && (
        <PaymentEntryModal
          invoiceId={payingInvoice.id}
          invoiceTotal={payingInvoice.total_amount || 0}
          invoicePaid={payingInvoice.paid_amount || 0}
          onClose={() => setPayingInvoice(null)}
          onSaved={() => {
            setPayingInvoice(null)
            onChanged()
            onClose()
          }}
        />
      )}
    </div>
  )
}
