import { useEffect, useMemo, useRef, useState } from 'react'
import { QrCode, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { MEMORY_KEYS } from '@/lib/prescriptionMemory'
import { SuggestTextarea } from '@/components/SuggestField'
import { getFriendlySupabaseErrorMessage, logBillingError } from '@/lib/billing'
import { recordInvoicePayment } from '@/lib/payments'
import { logActivity } from '@/lib/activityLog'
import { supabase } from '@/lib/supabase'
import { formatBDT } from '@/lib/utils'
import { PaymentThanksPrompt } from '@/components/PaymentThanksPrompt'
import { BanglaQrPaymentModal, type BanglaQrPaymentSuccess } from '@/components/BanglaQrPaymentModal'
import { PaymentReceiptPrint } from '@/components/PaymentReceiptPrint'
import { parsePaymentSms } from '@/lib/smsParsers'

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
  const [patientContact, setPatientContact] = useState<{ firstName: string; lastName: string; phone: string | null; patientCode: string | null } | null>(null)
  const [invoiceMeta, setInvoiceMeta] = useState<{ patientId: string | null; patientName: string | null; invoiceNumber: string | null; createdAt: string | null } | null>(null)

  // ── Dynamic Bangla QR payment path ──
  const [showBanglaQr, setShowBanglaQr] = useState(false)
  const [smsPasteOpen, setSmsPasteOpen] = useState(false)
  const [smsRaw, setSmsRaw] = useState('')
  const [receipt, setReceipt] = useState<{
    payment: { id: string; amount: number; payment_date: string; payment_method: string | null; notes: string | null }
    invoice: { id: string; invoice_number: string | null; total_amount: number; paid_amount: number; created_at: string }
    patient: { first_name: string; last_name: string; phone: string | null; patient_code: string | null }
    remainingAfter: number
  } | null>(null)
  // Set (before onSaved fires) when the QR success screen's Print Receipt button was
  // clicked, so this modal defers closing until the receipt overlay is dismissed
  // instead of unmounting out from under it. A ref (not state) because
  // onPrintReceipt and onSaved fire synchronously back-to-back from the same click.
  const receiptRequestedRef = useRef(false)

  const remaining = useMemo(() => Math.max(invoiceTotal - invoicePaid, 0), [invoiceTotal, invoicePaid])
  const parsedAmount = parseFloat(amount) || 0
  const remainingAfterPayment = Math.max(remaining - parsedAmount, 0)
  const parsedSms = useMemo(() => parsePaymentSms(smsRaw), [smsRaw])

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
      .select('invoice_number, created_at, patient_id, patients (first_name, last_name, phone, patient_code)')
      .eq('id', invoiceId)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (cancelled || error) return
          const patients = (data as any)?.patients
          if (patients?.first_name) {
            setPatientContact({
              firstName: patients.first_name,
              lastName: patients.last_name || '',
              phone: patients.phone ?? null,
              patientCode: patients.patient_code ?? null,
            })
          }
          setInvoiceMeta({
            patientId: (data as any)?.patient_id ?? null,
            patientName: patients?.first_name ? `${patients.first_name} ${patients.last_name || ''}`.trim() : null,
            invoiceNumber: (data as any)?.invoice_number ?? null,
            createdAt: (data as any)?.created_at ?? null,
          })
        },
        () => {}
      )
    return () => { cancelled = true }
  }, [invoiceId])

  /** Fills the standard Amount/Method/Notes fields from a pasted SMS — a lighter-weight
   * shortcut than the dedicated Bangla QR flow's gateway-tracked recording. */
  function applyParsedSmsToForm() {
    if (!parsedSms) return
    setAmount(String(parsedSms.amount))
    if (parsedSms.provider === 'bkash_sms' || parsedSms.provider === 'nagad_sms') {
      setPaymentMethod('Transfer')
    }
    const trxNote = parsedSms.transactionId
      ? `${parsedSms.providerLabel} TrxID: ${parsedSms.transactionId}`
      : `${parsedSms.providerLabel} Payment`
    setNotes((prev) => (prev.trim() ? `${prev}\n${trxNote}` : trxNote))
    setSmsPasteOpen(false)
    setSmsRaw('')
  }

  function handlePrintReceiptFromQr(payment: BanglaQrPaymentSuccess) {
    receiptRequestedRef.current = true
    setReceipt({
      payment: {
        id: payment.paymentId || crypto.randomUUID(),
        amount: payment.amount,
        payment_date: payment.dateIso,
        payment_method: 'Transfer',
        notes: payment.notes,
      },
      invoice: {
        id: invoiceId,
        invoice_number: invoiceMeta?.invoiceNumber ?? null,
        total_amount: invoiceTotal,
        paid_amount: invoicePaid + payment.amount,
        created_at: invoiceMeta?.createdAt || new Date().toISOString(),
      },
      patient: {
        first_name: patientContact?.firstName || invoiceMeta?.patientName?.split(' ')[0] || 'Patient',
        last_name: patientContact?.lastName || '',
        phone: patientContact?.phone ?? null,
        patient_code: patientContact?.patientCode ?? null,
      },
      remainingAfter: Math.max(invoiceTotal - (invoicePaid + payment.amount), 0),
    })
  }

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
      // A date-only picker can't capture time of day — stamping it at midnight lost the
      // actual moment for same-day payments (the overwhelmingly common case). Keep the
      // chosen date but carry over the current time of day instead.
      const paymentDateTime = new Date(`${paymentDate}T00:00:00`)
      const now = new Date()
      paymentDateTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
      const paymentDateIso = paymentDateTime.toISOString()
      const result = await recordInvoicePayment({
        invoiceId,
        amount: parsedAmount,
        invoiceTotal,
        invoicePaid,
        method: paymentMethod,
        paymentDateIso,
        notes: notes || null,
        patientId: invoiceMeta?.patientId,
        patientName: invoiceMeta?.patientName,
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
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-800 min-w-0">
              <QrCode className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium truncate">Dynamic Bangla QR</span>
            </div>
            <button
              type="button"
              disabled={remaining <= 0}
              onClick={() => setShowBanglaQr(true)}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition-colors"
            >
              Pay via Bangla QR
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setSmsPasteOpen(!smsPasteOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Paste Merchant Payment SMS to Auto-Fill
              </span>
              <span className="text-gray-400">{smsPasteOpen ? '−' : '+'}</span>
            </button>
            {smsPasteOpen && (
              <div className="p-3 space-y-2">
                <textarea
                  rows={2}
                  placeholder="Paste SMS here (e.g. 'You have received Tk 500.00... TrxID 9K382J9X')"
                  value={smsRaw}
                  onChange={(e) => setSmsRaw(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {parsedSms && (
                  <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center justify-between gap-2">
                    <span className="text-emerald-800">
                      {parsedSms.providerLabel} detected: <strong>{formatBDT(parsedSms.amount)}</strong>
                      {parsedSms.transactionId ? ` • ${parsedSms.transactionId}` : ''}
                    </span>
                    <button type="button" onClick={applyParsedSmsToForm} className="text-emerald-700 font-semibold underline shrink-0">
                      Use this
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

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
            <SuggestTextarea
              memoryKey={MEMORY_KEYS.PAYMENT_NOTES}
              sectionLabel="Payment Notes"
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

      {showBanglaQr && (
        <BanglaQrPaymentModal
          invoiceId={invoiceId}
          invoiceNumber={invoiceMeta?.invoiceNumber}
          invoiceTotal={invoiceTotal}
          invoicePaid={invoicePaid}
          initialAmount={parsedAmount > 0 ? parsedAmount : undefined}
          patientId={invoiceMeta?.patientId}
          patientName={invoiceMeta?.patientName}
          patientPhone={patientContact?.phone}
          onClose={() => setShowBanglaQr(false)}
          onPrintReceipt={handlePrintReceiptFromQr}
          onSaved={() => {
            setShowBanglaQr(false)
            // If Print Receipt was just requested, keep this modal mounted until
            // the receipt overlay below is closed — otherwise close normally now.
            if (!receiptRequestedRef.current) onSaved()
            receiptRequestedRef.current = false
          }}
        />
      )}

      {receipt && (
        <PaymentReceiptPrint
          payment={receipt.payment}
          invoice={receipt.invoice}
          patient={receipt.patient}
          remainingAfter={receipt.remainingAfter}
          onClose={() => { setReceipt(null); onSaved() }}
        />
      )}
    </div>
  )
}
