import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getFriendlySupabaseErrorMessage, logBillingError } from '@/lib/billing'
import { recordInvoicePayment } from '@/lib/payments'
import { logActivity } from '@/lib/activityLog'
import { supabase } from '@/lib/supabase'
import { formatBDT } from '@/lib/utils'
import { PaymentThanksPrompt } from '@/components/PaymentThanksPrompt'

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
  const [thanksPrompt, setThanksPrompt] = useState<{ firstName: string; phone: string | null; amount: number; totalPaid: number } | null>(null)
  const [patientContact, setPatientContact] = useState<{ firstName: string; phone: string | null } | null>(null)
  const [invoiceMeta, setInvoiceMeta] = useState<{ patientId: string | null; patientName: string | null; invoiceNumber: string | null } | null>(null)

  const remaining = useMemo(() => Math.max(invoiceTotal - invoicePaid, 0), [invoiceTotal, invoicePaid])
  const parsedAmount = parseFloat(amount) || 0
  const remainingAfterPayment = Math.max(remaining - parsedAmount, 0)

  useEffect(() => {
    setAmount(remaining > 0 ? String(remaining) : '')
    setPaymentDate(new Date().toISOString().slice(0, 10))
  }, [remaining])

  // Fetched purely to offer the post-payment WhatsApp thank-you prompt, and
  // (patient/invoice identity) to attach useful details to the audit log —
  // failure here must never block recording the payment.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('invoices')
      .select('invoice_number, patient_id, patients (first_name, last_name, phone)')
      .eq('id', invoiceId)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (cancelled || error) return
          const patients = (data as any)?.patients
          if (patients?.first_name) {
            setPatientContact({ firstName: patients.first_name, phone: patients.phone ?? null })
          }
          setInvoiceMeta({
            patientId: (data as any)?.patient_id ?? null,
            patientName: patients?.first_name ? `${patients.first_name} ${patients.last_name || ''}`.trim() : null,
            invoiceNumber: (data as any)?.invoice_number ?? null,
          })
        },
        () => {}
      )
    return () => { cancelled = true }
  }, [invoiceId])

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
      const result = await recordInvoicePayment({
        invoiceId,
        amount: parsedAmount,
        invoiceTotal,
        invoicePaid,
        method: paymentMethod,
        paymentDateIso,
        notes: notes || null,
      })

      if (result.paymentStored) {
        const invoiceLabel = invoiceMeta?.invoiceNumber || invoiceId.slice(0, 8).toUpperCase()
        logActivity({
          action: 'create',
          entityType: 'payment',
          entityLabel: invoiceMeta?.invoiceNumber ?? null,
          patientId: invoiceMeta?.patientId ?? null,
          patientName: invoiceMeta?.patientName ?? null,
          details: `${formatBDT(parsedAmount)} (${paymentMethod}) against invoice ${invoiceLabel}`,
        })
      }

      const warning = !result.paymentStored
        ? ' Payment total was updated, but detailed payment history could not be stored on this database schema yet.'
        : ''
      alert(`Payment recorded. Remaining balance: ${remainingAfterPayment.toFixed(2)}.${warning}`)

      if (patientContact?.phone) {
        setThanksPrompt({ firstName: patientContact.firstName, phone: patientContact.phone, amount: parsedAmount, totalPaid: result.newPaidAmount })
      } else {
        onSaved()
      }
    } catch (error) {
      logBillingError('Failed to record payment', error, { invoiceId, amount: parsedAmount })
      alert(`Failed to record payment: ${getFriendlySupabaseErrorMessage(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-full sm:max-w-lg w-full my-4 sm:my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-3 sm:p-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Record Payment</h3>
            <p className="text-sm text-text-secondary">Remaining balance: {remaining.toFixed(2)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg shrink-0">
            <X className="w-5 h-5" />
          </button>
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

      {thanksPrompt && (
        <PaymentThanksPrompt
          firstName={thanksPrompt.firstName}
          phone={thanksPrompt.phone}
          amount={thanksPrompt.amount}
          totalPaid={thanksPrompt.totalPaid}
          onClose={() => { setThanksPrompt(null); onSaved() }}
        />
      )}
    </div>
  )
}
