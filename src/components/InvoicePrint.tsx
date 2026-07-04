import { useEffect, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import {
  formatInvoiceItemLabel,
  getInvoiceItemLineTotal,
  getInvoiceItemQuantity,
  getInvoiceItemUnitPrice,
  getInvoiceItemSubtotal,
  type BillingLineItem,
} from '@/lib/billing'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource } from '@/lib/logoImage'
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
    patient_code?: string | null
  }
  doctor: DoctorProfileData | null
  onClose: () => void
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

export function InvoicePrint({ invoices, patient, doctor, onClose }: InvoicePrintProps) {
  const combined = invoices.length > 1
  const grandTotal = invoices.reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0)
  const grandPaid = invoices.reduce((sum, invoice) => sum + (invoice.paid_amount || 0), 0)
  const grandDue = Math.max(grandTotal - grandPaid, 0)

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
      ? 'Combined Invoice'
      : invoices[0]?.invoice_number || (invoices[0]?.id ? invoices[0].id.slice(0, 8).toUpperCase() : '')
    document.title =
      [namePart, idPart].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '-') ||
      originalTitleRef.current
    window.print()
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
        <button
          onClick={onClose}
          className="flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-xl shadow-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          <X className="w-4 h-4" />
          Close
        </button>
      </div>

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

        {/* ── Invoice sections ── */}
        <div className="space-y-6">
          {invoices.map((invoice) => (
            <div key={invoice.id}>
              {combined && (
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                  <div className="text-sm font-bold">
                    Invoice {invoice.invoice_number ? `#${invoice.invoice_number}` : invoice.id.slice(0, 8).toUpperCase()}
                  </div>
                  <div className="text-xs text-gray-600">
                    {safeFormat(invoice.created_at, 'dd MMM yyyy')}
                    {invoice.due_date && ` • Due: ${safeFormat(invoice.due_date, 'dd MMM yyyy')}`}
                    {` • ${invoice.status}`}
                  </div>
                </div>
              )}
              {!combined && (
                <div className="text-xs text-gray-600 mb-1">
                  Issued: {safeFormat(invoice.created_at, 'dd MMM yyyy')}
                  {invoice.due_date && ` • Due: ${safeFormat(invoice.due_date, 'dd MMM yyyy')}`}
                  {` • Status: ${invoice.status}`}
                </div>
              )}
              <InvoiceItemsTable invoice={invoice} />
              <InvoiceTotals invoice={invoice} />
              {!combined && !!invoice.notes && (
                <p className="text-xs text-gray-600 mt-2">Notes: {invoice.notes}</p>
              )}
              {!combined && !!invoice.payment_terms && (
                <p className="text-xs text-gray-600 mt-1">Payment Terms: {invoice.payment_terms}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Grand totals (combined mode) ── */}
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
              <div className="flex justify-between font-semibold">
                <span>Total Due</span>
                <span>{formatBDT(grandDue)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="invoice-print-footer mt-10">
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
  )
}
