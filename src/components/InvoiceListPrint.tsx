import { useEffect, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { getInvoiceItemSubtotal, type BillingLineItem } from '@/lib/billing'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource } from '@/lib/logoImage'
import { safeFormat, formatBDT } from '@/lib/utils'

interface ListInvoice {
  id: string
  items: BillingLineItem[] | null
  total_amount: number
  paid_amount: number
  discount_amount?: number | null
  invoice_number?: string | null
  invoice_type?: string | null
  status: string
  due_date: string | null
  created_at: string
  patients: {
    first_name: string
    last_name: string
    patient_code: string | null
  } | null
}

interface InvoiceListPrintProps {
  invoices: ListInvoice[]
  doctor: DoctorProfileData | null
  /** Label describing what's being printed, e.g. "All invoices" or "Pending invoices for Mithila" */
  label: string
  onClose: () => void
}

export function InvoiceListPrint({ invoices, doctor, label, onClose }: InvoiceListPrintProps) {
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
    document.title = `Invoice List - ${safeFormat(new Date().toISOString(), 'dd MMM yyyy')}`
    window.print()
  }

  const grandTotal = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
  const grandPaid = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0)
  const grandDue = Math.max(grandTotal - grandPaid, 0)

  return (
    <div className="invoice-list-print-overlay fixed inset-0 bg-black/70 z-[100] flex items-start justify-center p-4 overflow-y-auto print:bg-white">
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

      {/* Document */}
      <div
        id="invoice-list-print-root"
        className="invoice-list-print-container bg-white w-full max-w-4xl my-16 print:my-0 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 print:p-6 text-gray-900"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* ── Letterhead ── */}
        <div className="border-b-2 border-gray-800 pb-4 mb-4">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
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
            <div className="self-center px-2">
              <img
                src={logoSrc}
                alt="Clinic logo"
                style={{ height: 96, width: 'auto', maxWidth: 180, objectFit: 'contain', mixBlendMode: 'multiply' }}
              />
            </div>
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
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-lg font-bold uppercase tracking-wide">Invoice List</div>
            <div className="text-sm text-gray-600">{label}</div>
          </div>
          <div className="text-sm text-gray-600">
            Printed: {safeFormat(new Date().toISOString(), 'dd MMM yyyy')}
          </div>
        </div>

        {/* ── Invoice table ── */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="py-1.5 pr-2 font-semibold">#</th>
              <th className="py-1.5 pr-2 font-semibold">Patient</th>
              <th className="py-1.5 pr-2 font-semibold">Date</th>
              <th className="py-1.5 pr-2 font-semibold">Type</th>
              <th className="py-1.5 pr-2 font-semibold">Status</th>
              <th className="py-1.5 pr-2 font-semibold">Items</th>
              <th className="py-1.5 pr-2 font-semibold text-right">Total</th>
              <th className="py-1.5 pr-2 font-semibold text-right">Paid</th>
              <th className="py-1.5 font-semibold text-right">Due</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, idx) => {
              const items = Array.isArray(inv.items) ? inv.items : []
              const due = Math.max((inv.total_amount || 0) - (inv.paid_amount || 0), 0)
              const subtotal = items.length > 0 ? getInvoiceItemSubtotal(items) : inv.total_amount || 0
              return (
                <tr key={inv.id} className={`border-b border-gray-200 ${idx % 2 === 1 ? 'bg-gray-50' : ''}`}>
                  <td className="py-1.5 pr-2 text-xs text-gray-500">
                    {inv.invoice_number || inv.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="py-1.5 pr-2">
                    <div>{inv.patients ? `${inv.patients.first_name} ${inv.patients.last_name}` : '—'}</div>
                    {inv.patients?.patient_code && (
                      <div className="text-xs text-gray-500">{inv.patients.patient_code}</div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-xs">
                    {safeFormat(inv.created_at, 'dd MMM yyyy')}
                    {inv.due_date && (
                      <div className="text-gray-500">Due: {safeFormat(inv.due_date, 'dd MMM yyyy')}</div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-xs uppercase text-gray-600">{inv.invoice_type || 'basic'}</td>
                  <td className="py-1.5 pr-2 text-xs">{inv.status}</td>
                  <td className="py-1.5 pr-2 text-xs text-gray-600">
                    {items.length > 0 ? `${items.length} item${items.length !== 1 ? 's' : ''}` : '—'}
                    {subtotal !== (inv.total_amount || 0) && (
                      <div className="text-gray-400">{formatBDT(subtotal)}</div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-medium">{formatBDT(inv.total_amount || 0)}</td>
                  <td className="py-1.5 pr-2 text-right">{formatBDT(inv.paid_amount || 0)}</td>
                  <td className="py-1.5 text-right font-semibold">{formatBDT(due)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-800 font-bold">
              <td colSpan={6} className="py-2 pr-2">Total ({invoices.length} invoice{invoices.length !== 1 ? 's' : ''})</td>
              <td className="py-2 pr-2 text-right">{formatBDT(grandTotal)}</td>
              <td className="py-2 pr-2 text-right">{formatBDT(grandPaid)}</td>
              <td className="py-2 text-right">{formatBDT(grandDue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
