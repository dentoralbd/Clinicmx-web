import { useEffect, useRef, useState } from 'react'
import { Mail, MessageCircle, Printer, X } from 'lucide-react'
import {
  formatInvoiceItemLabel,
  getInvoiceItemLineTotal,
  getInvoiceItemQuantity,
  getInvoiceItemUnitPrice,
  getInvoiceItemSubtotal,
  isSchemaCompatibilityError,
  logBillingError,
  type BillingLineItem,
} from '@/lib/billing'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource } from '@/lib/logoImage'
import { sharePdf, toWhatsAppNumber } from '@/lib/sharePdf'
import { supabase } from '@/lib/supabase'
import { safeFormat, formatBDT } from '@/lib/utils'

export interface PrintableInvoice {
  id: string
  items: BillingLineItem[] | null
  total_amount: number
  paid_amount: number
  discount_amount?: number | null
  tax_amount?: number | null
  tax_rate?: number | null
  notes?: string | null
  payment_terms?: string | null
  invoice_number?: string | null
  status: string
  due_date: string | null
  created_at: string
}

interface InvoicePrintProps {
  /** One invoice = single invoice print; several = combined statement for the patient */
  invoices: PrintableInvoice[]
  patient: {
    first_name: string
    last_name: string
    phone?: string | null
    email?: string | null
    patient_code?: string | null
  }
  doctor: DoctorProfileData | null
  /** Combined mode only: open the preview with the "Due only" filter already on */
  initialDueOnly?: boolean
  onClose: () => void
}

interface StatementPaymentRow {
  id: string
  amount: number
  payment_date: string
  payment_method: string | null
  invoice_id: string
  payment_methods: {
    name: string
  } | null
}

function invoiceLabel(invoice: PrintableInvoice) {
  return invoice.invoice_number ? `#${invoice.invoice_number}` : invoice.id.slice(0, 8).toUpperCase()
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function getInvoiceDue(invoice: PrintableInvoice) {
  return Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)
}

function InvoiceItemsTable({ invoice }: { invoice: PrintableInvoice }) {
  const items = Array.isArray(invoice.items) ? invoice.items : []

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b-2 border-gray-800 text-left">
          <th className="py-1.5 pr-2 font-semibold">Description</th>
          <th className="py-1.5 px-2 font-semibold text-center w-16">Qty</th>
          <th className="py-1.5 px-2 font-semibold text-right w-28">Unit Price</th>
          <th className="py-1.5 pl-2 font-semibold text-right w-28">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr className="border-b border-gray-200">
            <td className="py-1.5 pr-2 text-gray-500" colSpan={3}>Invoice total</td>
            <td className="py-1.5 pl-2 text-right">{formatBDT(invoice.total_amount)}</td>
          </tr>
        ) : (
          items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-200">
              <td className="py-1.5 pr-2">{formatInvoiceItemLabel({ ...item, quantity: 1 })}</td>
              <td className="py-1.5 px-2 text-center">{getInvoiceItemQuantity(item)}</td>
              <td className="py-1.5 px-2 text-right">{formatBDT(getInvoiceItemUnitPrice(item))}</td>
              <td className="py-1.5 pl-2 text-right">{formatBDT(getInvoiceItemLineTotal(item))}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function InvoiceTotals({ invoice }: { invoice: PrintableInvoice }) {
  const items = Array.isArray(invoice.items) ? invoice.items : []
  const subtotal = items.length > 0 ? getInvoiceItemSubtotal(items) : invoice.total_amount || 0
  const due = Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)

  return (
    <div className="flex justify-end mt-2">
      <div className="w-64 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">Subtotal</span>
          <span>{formatBDT(subtotal)}</span>
        </div>
        {(invoice.discount_amount || 0) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Discount</span>
            <span>-{formatBDT(invoice.discount_amount || 0)}</span>
          </div>
        )}
        {(invoice.tax_amount || 0) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Tax{invoice.tax_rate ? ` (${invoice.tax_rate}%)` : ''}</span>
            <span>{formatBDT(invoice.tax_amount || 0)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-gray-800 pt-1">
          <span>Total</span>
          <span>{formatBDT(invoice.total_amount || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Paid</span>
          <span>{formatBDT(invoice.paid_amount || 0)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Due</span>
          <span>{formatBDT(due)}</span>
        </div>
      </div>
    </div>
  )
}

/** Alternate single-invoice layout: pharmacy-receipt style (Sl No / item / qty / price / discount / amount). */
function ReceiptStyleInvoice({
  invoice,
  patient,
  doctor,
}: {
  invoice: PrintableInvoice
  patient: InvoicePrintProps['patient']
  doctor: DoctorProfileData | null
}) {
  const items = Array.isArray(invoice.items) ? invoice.items : []
  const subtotal = items.length > 0 ? getInvoiceItemSubtotal(items) : invoice.total_amount || 0
  const discountAmount = invoice.discount_amount || 0
  const roundingOff = roundCurrency((invoice.total_amount || 0) - (subtotal - discountAmount))
  const due = getInvoiceDue(invoice)

  return (
    <div>
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm mb-3">
        <span><span className="font-semibold">Invoice No:</span> {invoiceLabel(invoice)}</span>
        <span><span className="font-semibold">Invoice Date:</span> {safeFormat(invoice.created_at, 'dd/MM/yyyy')}</span>
        {invoice.due_date && (
          <span><span className="font-semibold">Due Date:</span> {safeFormat(invoice.due_date, 'dd/MM/yyyy')}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <div className="font-semibold mb-1">Bill From</div>
          {doctor?.workplace && <div>{doctor.workplace}</div>}
          {doctor?.clinic_address && <div className="text-gray-600 whitespace-pre-line">{doctor.clinic_address}</div>}
          {doctor?.phone && <div className="text-gray-600">{doctor.phone}</div>}
        </div>
        <div>
          <div className="font-semibold mb-1">Billed To</div>
          <div>{patient.first_name} {patient.last_name}</div>
          {patient.phone && <div className="text-gray-600">{patient.phone}</div>}
        </div>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-800 text-left">
            <th className="py-1.5 pr-2 font-semibold w-10">Sl.</th>
            <th className="py-1.5 px-2 font-semibold">Product/Treatment</th>
            <th className="py-1.5 px-2 font-semibold text-center w-16">Qty</th>
            <th className="py-1.5 px-2 font-semibold text-right w-24">Price</th>
            <th className="py-1.5 px-2 font-semibold text-right w-24">Discount</th>
            <th className="py-1.5 pl-2 font-semibold text-right w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr className="border-b border-gray-200">
              <td className="py-1.5 pr-2 text-gray-500">1</td>
              <td className="py-1.5 px-2 text-gray-500" colSpan={3}>Invoice total</td>
              <td className="py-1.5 px-2 text-right">{formatBDT(0)}</td>
              <td className="py-1.5 pl-2 text-right">{formatBDT(invoice.total_amount)}</td>
            </tr>
          ) : (
            items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-1.5 pr-2">{idx + 1}</td>
                <td className="py-1.5 px-2">{formatInvoiceItemLabel({ ...item, quantity: 1 })}</td>
                <td className="py-1.5 px-2 text-center">{getInvoiceItemQuantity(item)}</td>
                <td className="py-1.5 px-2 text-right">{formatBDT(getInvoiceItemUnitPrice(item))}</td>
                <td className="py-1.5 px-2 text-right">{formatBDT(0)}</td>
                <td className="py-1.5 pl-2 text-right">{formatBDT(getInvoiceItemLineTotal(item))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="flex justify-end mt-2">
        <div className="w-64 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>{formatBDT(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Discount applied</span>
              <span>-{formatBDT(discountAmount)}</span>
            </div>
          )}
          {roundingOff !== 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Rounding Off</span>
              <span>{roundingOff > 0 ? '+' : ''}{formatBDT(roundingOff)}</span>
            </div>
          )}
          {(invoice.paid_amount || 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Paid</span>
              <span>{formatBDT(invoice.paid_amount || 0)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t border-gray-800 pt-1">
            <span>Amount Payable</span>
            <span>{formatBDT(due)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Combined mode: one compact table, one tbody per invoice (the page-break unit). */
function StatementTable({ invoices, showItems }: { invoices: PrintableInvoice[]; showItems: boolean }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b-2 border-gray-800 text-left">
          <th className="py-1.5 pr-2 font-semibold">Description</th>
          <th className="py-1.5 px-2 font-semibold text-center w-16">Qty</th>
          <th className="py-1.5 px-2 font-semibold text-right w-28">Unit Price</th>
          <th className="py-1.5 pl-2 font-semibold text-right w-28">Amount</th>
        </tr>
      </thead>
      {invoices.length === 0 ? (
        <tbody>
          <tr>
            <td colSpan={4} className="py-3 text-center text-gray-500">No outstanding invoices.</td>
          </tr>
        </tbody>
      ) : (
        invoices.map((invoice) => {
          const items = Array.isArray(invoice.items) ? invoice.items : []
          const due = getInvoiceDue(invoice)
          const adjustments: string[] = []
          if ((invoice.discount_amount || 0) > 0) adjustments.push(`Discount −${formatBDT(invoice.discount_amount || 0)}`)
          if ((invoice.tax_amount || 0) > 0) {
            adjustments.push(`Tax${invoice.tax_rate ? ` (${invoice.tax_rate}%)` : ''} +${formatBDT(invoice.tax_amount || 0)}`)
          }

          return (
            <tbody key={invoice.id} className="statement-invoice-block">
              <tr className="bg-gray-100">
                <td colSpan={4} className="py-1.5 px-2">
                  <span className="font-bold">Invoice {invoiceLabel(invoice)}</span>
                  <span className="text-xs text-gray-600">
                    {' '}• {safeFormat(invoice.created_at, 'dd MMM yyyy')}
                    {invoice.due_date && ` • Due: ${safeFormat(invoice.due_date, 'dd MMM yyyy')}`}
                    {` • ${invoice.status}`}
                    {adjustments.length > 0 && ` • ${adjustments.join(' • ')}`}
                  </span>
                </td>
              </tr>
              {showItems &&
                (items.length === 0 ? (
                  <tr className="border-b border-gray-200">
                    <td className="py-1.5 pr-2 text-gray-500" colSpan={3}>Invoice total</td>
                    <td className="py-1.5 pl-2 text-right">{formatBDT(invoice.total_amount)}</td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="py-1.5 pr-2">{formatInvoiceItemLabel({ ...item, quantity: 1 })}</td>
                      <td className="py-1.5 px-2 text-center">{getInvoiceItemQuantity(item)}</td>
                      <td className="py-1.5 px-2 text-right">{formatBDT(getInvoiceItemUnitPrice(item))}</td>
                      <td className="py-1.5 pl-2 text-right">{formatBDT(getInvoiceItemLineTotal(item))}</td>
                    </tr>
                  ))
                ))}
              <tr>
                <td colSpan={4} className="py-1.5 px-2 text-right border-b border-gray-800">
                  <span className="text-gray-600">Total</span>{' '}
                  <span className="font-semibold">{formatBDT(invoice.total_amount || 0)}</span>
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-600">Paid</span>{' '}
                  <span className="font-semibold">{formatBDT(invoice.paid_amount || 0)}</span>
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-600">Due</span>{' '}
                  <span className={due > 0 ? 'font-bold' : 'font-semibold'}>{formatBDT(due)}</span>
                </td>
              </tr>
            </tbody>
          )
        })
      )}
    </table>
  )
}

export function InvoicePrint({ invoices, patient, doctor, initialDueOnly, onClose }: InvoicePrintProps) {
  const combined = invoices.length > 1
  const [dueOnly, setDueOnly] = useState(Boolean(initialDueOnly))
  const [showItems, setShowItems] = useState(true)
  const [showPayments, setShowPayments] = useState(true)
  const [format, setFormat] = useState<'detailed' | 'receipt'>('detailed')
  const [payments, setPayments] = useState<StatementPaymentRow[]>([])

  const visibleInvoices = combined && dueOnly ? invoices.filter((invoice) => getInvoiceDue(invoice) > 0) : invoices
  const grandTotal = visibleInvoices.reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0)
  const grandPaid = visibleInvoices.reduce((sum, invoice) => sum + (invoice.paid_amount || 0), 0)
  const grandDue = Math.max(grandTotal - grandPaid, 0)

  const invoiceIdsKey = combined ? invoices.map((invoice) => invoice.id).join(',') : ''

  useEffect(() => {
    if (!invoiceIdsKey) return
    let cancelled = false
    async function loadPayments() {
      const ids = invoiceIdsKey.split(',')
      try {
        const primaryQuery = await supabase
          .from('payments')
          .select('id, amount, payment_date, payment_method, invoice_id, payment_methods(name)')
          .in('invoice_id', ids)
          .order('payment_date', { ascending: true })

        if (primaryQuery.error && !isSchemaCompatibilityError(primaryQuery.error)) {
          throw primaryQuery.error
        }

        if (!primaryQuery.error) {
          if (!cancelled) setPayments((primaryQuery.data as unknown as StatementPaymentRow[]) || [])
          return
        }

        const fallbackQuery = await supabase
          .from('payments')
          .select('id, amount, payment_date, payment_method, invoice_id')
          .in('invoice_id', ids)
          .order('payment_date', { ascending: true })

        if (fallbackQuery.error) throw fallbackQuery.error

        if (!cancelled) setPayments((fallbackQuery.data as unknown as StatementPaymentRow[]) || [])
      } catch (error) {
        // Printing must never be blocked by a payments failure — omit the section.
        logBillingError('Failed to load payments for combined statement', error, { invoiceIds: invoiceIdsKey })
        if (!cancelled) setPayments([])
      }
    }
    loadPayments()
    return () => {
      cancelled = true
    }
  }, [invoiceIdsKey])

  const visibleInvoiceIds = new Set(visibleInvoices.map((invoice) => invoice.id))
  const visiblePayments = payments.filter((payment) => visibleInvoiceIds.has(payment.invoice_id))
  const invoiceLabelById = new Map(invoices.map((invoice) => [invoice.id, invoiceLabel(invoice)]))

  // Uploaded logos are cleaned at upload time; the bundled default needs its
  // light background stripped here so it blends into the printed page.
  const [logoSrc, setLogoSrc] = useState(doctor?.logo_data || '/logo.png')

  useEffect(() => {
    if (doctor?.logo_data) {
      setLogoSrc(doctor.logo_data)
      return
    }
    let cancelled = false
    cleanLogoSource('/logo.png').then((src) => {
      if (!cancelled) setLogoSrc(src)
    })
    return () => {
      cancelled = true
    }
  }, [doctor?.logo_data])

  const originalTitleRef = useRef('')

  useEffect(() => {
    originalTitleRef.current = document.title
    const restoreTitle = () => {
      document.title = originalTitleRef.current
    }
    window.addEventListener('afterprint', restoreTitle)
    return () => {
      window.removeEventListener('afterprint', restoreTitle)
      document.title = originalTitleRef.current
    }
  }, [])

  const handlePrint = () => {
    const namePart = `${patient.first_name} ${patient.last_name}`.trim()
    const idPart = combined
      ? dueOnly
        ? 'Statement (Due)'
        : 'Combined Invoice'
      : invoices[0]?.invoice_number || (invoices[0]?.id ? invoices[0].id.slice(0, 8).toUpperCase() : '')
    document.title =
      [namePart, idPart].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '-') ||
      originalTitleRef.current
    window.print()
  }

  const [showShareMenu, setShowShareMenu] = useState(false)

  useEffect(() => {
    if (!showShareMenu) return
    const handler = () => setShowShareMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showShareMenu])

  async function shareStatement(channel: 'email' | 'whatsapp') {
    const email = patient.email
    const waNumber = patient.phone ? toWhatsAppNumber(patient.phone) : null

    if (channel === 'email' && !email) {
      alert('Patient email is not available')
      return
    }
    if (channel === 'whatsapp' && !waNumber) {
      alert('Patient phone number is not available')
      return
    }

    const { buildInvoicePdf, invoicePdfFileName } = await import('@/lib/invoicePdf')
    const pdf = buildInvoicePdf(visibleInvoices, patient, doctor, {
      dueOnly,
      showItems,
      payments: showPayments ? visiblePayments : [],
      logoSrc,
    })
    const fileName = invoicePdfFileName(visibleInvoices, patient)
    const subject = combined
      ? `${dueOnly ? 'Statement (Due)' : 'Combined Invoice'} - ${patient.first_name} ${patient.last_name}`
      : `Invoice ${invoices[0]?.invoice_number || invoices[0]?.id}`
    const text = combined
      ? `Dear ${patient.first_name || 'Patient'},\n\nPlease find attached your invoice statement. Total Due: ${formatBDT(grandDue)}.`
      : `Dear ${patient.first_name || 'Patient'},\n\nPlease find attached your invoice. Total: ${formatBDT(invoices[0]?.total_amount || 0)}.`

    await sharePdf(pdf, fileName, { channel, email, waNumber, subject, text })
  }

  return (
    <div className="invoice-print-overlay fixed inset-0 bg-black/70 z-[100] flex items-start justify-center p-4 overflow-y-auto print:bg-white">
      {/* Action bar – hidden on print */}
      <div className="print:hidden fixed top-4 right-4 flex gap-2 z-[101]">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
          Print / Save as PDF
        </button>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowShareMenu((v) => !v)
            }}
            aria-label="Email or WhatsApp invoice"
            className="flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-xl shadow-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <Mail className="w-4 h-4" /><MessageCircle className="w-4 h-4 -ml-1 text-green-600" />
            <span>Share</span>
          </button>
          {showShareMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-44 max-w-[calc(100vw-2rem)]">
              <button
                className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  shareStatement('email')
                  setShowShareMenu(false)
                }}
              >
                <Mail className="w-4 h-4" /> Email
              </button>
              <button
                className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  shareStatement('whatsapp')
                  setShowShareMenu(false)
                }}
              >
                <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-xl shadow-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          <X className="w-4 h-4" />
          Close
        </button>
      </div>

      {/* Statement options – combined mode only, hidden on print */}
      {combined && (
        <div className="print:hidden fixed top-16 right-4 z-[101] bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
            Due only
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={showItems} onChange={(e) => setShowItems(e.target.checked)} />
            Line items
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={showPayments} onChange={(e) => setShowPayments(e.target.checked)} />
            Payment history
          </label>
        </div>
      )}

      {/* Format options – single-invoice mode only, hidden on print */}
      {!combined && (
        <div className="print:hidden fixed top-16 right-4 z-[101] bg-white rounded-xl shadow-lg border border-gray-200 px-3 py-2 flex items-center gap-1">
          <button
            onClick={() => setFormat('detailed')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${format === 'detailed' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Detailed
          </button>
          <button
            onClick={() => setFormat('receipt')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${format === 'receipt' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Receipt
          </button>
        </div>
      )}

      {/* Invoice document */}
      <div
        id="invoice-print-root"
        className="invoice-print-container bg-white w-full max-w-3xl my-16 print:my-0 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 print:p-6 text-gray-900"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* ── Letterhead: doctor (left) · logo (center) · practice (right) ── */}
        <div className="border-b-2 border-gray-800 pb-4 mb-4">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
            {/* Left — doctor information */}
            <div>
              <div className="text-xl font-bold text-gray-900 leading-tight">
                {doctor?.full_name
                  ? `Dr. ${doctor.full_name.replace(/^Dr\.?\s*/i, '')}`
                  : 'Doctor Name'}
              </div>
              {doctor?.degrees &&
                doctor.degrees
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, idx) => (
                    <div key={idx} className="text-sm text-gray-600 mt-0.5">{line}</div>
                  ))}
              {doctor?.designation && (
                <div className="text-sm font-semibold text-gray-700 mt-0.5">{doctor.designation}</div>
              )}
              {doctor?.bmdc_reg && (
                <div className="text-xs text-gray-500 mt-1">BMDC Reg: {doctor.bmdc_reg}</div>
              )}
            </div>
            {/* Center — clinic logo */}
            <div className="self-center px-2">
              <img
                src={logoSrc}
                alt="Clinic logo"
                style={{ height: 96, width: 'auto', maxWidth: 180, objectFit: 'contain', mixBlendMode: 'multiply' }}
              />
            </div>
            {/* Right — practice information */}
            <div className="text-right">
              {doctor?.workplace && (
                <div className="text-base font-bold text-gray-800 leading-tight">{doctor.workplace}</div>
              )}
              {doctor?.clinic_address && (
                <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{doctor.clinic_address}</div>
              )}
              {doctor?.phone && (
                <div className="text-xs font-semibold text-gray-700 mt-1">Ph: {doctor.phone}</div>
              )}
              {doctor?.email && (
                <div className="text-xs text-gray-500 mt-0.5">Email: {doctor.email}</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Title ── */}
        <div className="text-center mb-4">
          <div className="text-lg font-bold tracking-wide uppercase">
            {combined ? 'Combined Invoice / Statement' : 'Invoice'}
          </div>
          {!combined && invoices[0]?.invoice_number && (
            <div className="text-sm text-gray-600">#{invoices[0].invoice_number}</div>
          )}
          {combined && dueOnly && (
            <div className="text-sm text-gray-600">Outstanding invoices only</div>
          )}
        </div>

        {/* ── Patient Info ── */}
        <div className="border border-gray-300 rounded-lg px-4 py-3 mb-4 bg-gray-50">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="font-semibold">Patient:</span>{' '}
              {patient.first_name} {patient.last_name}
            </div>
            {patient.patient_code && (
              <div>
                <span className="font-semibold">ID:</span> {patient.patient_code}
              </div>
            )}
            {patient.phone && (
              <div>
                <span className="font-semibold">Phone:</span> {patient.phone}
              </div>
            )}
            <div className="ml-auto">
              <span className="font-semibold">Date:</span> {safeFormat(new Date().toISOString(), 'dd MMM yyyy')}
            </div>
          </div>
        </div>

        {/* ── Invoice content: compact statement (combined) or full invoice (single) ── */}
        {combined ? (
          <StatementTable invoices={visibleInvoices} showItems={showItems} />
        ) : format === 'receipt' ? (
          <div className="space-y-6">
            {invoices.map((invoice) => (
              <ReceiptStyleInvoice key={invoice.id} invoice={invoice} patient={patient} doctor={doctor} />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {invoices.map((invoice) => (
              <div key={invoice.id}>
                <div className="text-xs text-gray-600 mb-1">
                  Issued: {safeFormat(invoice.created_at, 'dd MMM yyyy')}
                  {invoice.due_date && ` • Due: ${safeFormat(invoice.due_date, 'dd MMM yyyy')}`}
                  {` • Status: ${invoice.status}`}
                </div>
                <InvoiceItemsTable invoice={invoice} />
                <InvoiceTotals invoice={invoice} />
                {!!invoice.notes && (
                  <p className="text-xs text-gray-600 mt-2">Notes: {invoice.notes}</p>
                )}
                {!!invoice.payment_terms && (
                  <p className="text-xs text-gray-600 mt-1">Payment Terms: {invoice.payment_terms}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Payment history (combined mode) ── */}
        {combined && showPayments && visiblePayments.length > 0 && (
          <div className="statement-payments mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-800 text-left">
                  <th className="py-1.5 pr-2 font-semibold" colSpan={2}>Payment History</th>
                  <th className="py-1.5 px-2 font-semibold w-40">Method</th>
                  <th className="py-1.5 pl-2 font-semibold text-right w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visiblePayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-200">
                    <td className="py-1.5 pr-2 w-32">{safeFormat(payment.payment_date, 'dd MMM yyyy')}</td>
                    <td className="py-1.5 px-2 text-gray-600">
                      Invoice {invoiceLabelById.get(payment.invoice_id) || '—'}
                    </td>
                    <td className="py-1.5 px-2">
                      {payment.payment_method || payment.payment_methods?.name || '—'}
                    </td>
                    <td className="py-1.5 pl-2 text-right">{formatBDT(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Grand totals + footer kept together on print ── */}
        <div className={combined ? 'statement-summary' : undefined}>
          {combined && (
            <div className="mt-6 border-t-2 border-gray-800 pt-3 flex justify-end">
              <div className="w-64 text-sm space-y-1">
                <div className="flex justify-between font-bold text-base">
                  <span>Grand Total</span>
                  <span>{formatBDT(grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Paid</span>
                  <span>{formatBDT(grandPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-base">
                  <span>Total Due</span>
                  <span>{formatBDT(grandDue)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div className={`invoice-print-footer ${combined ? 'mt-6' : 'mt-10'}`}>
            <div className="flex justify-between items-end border-t border-gray-300 pt-4">
              <div className="text-xs text-gray-500">Thank you for your visit.</div>
              <div className="text-right">
                <div className="border-t border-gray-800 w-40 mb-1" />
                <div className="text-sm font-semibold">Authorized Signature</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
