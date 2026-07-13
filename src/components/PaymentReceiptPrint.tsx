import { useEffect, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { loadDoctorProfile } from '@/lib/doctorProfile'
import { cleanLogoSource } from '@/lib/logoImage'
import { safeFormat, formatBDT } from '@/lib/utils'

interface PaymentReceiptPrintProps {
  payment: {
    id: string
    amount: number
    payment_date: string
    payment_method: string | null
    notes: string | null
  }
  invoice: {
    id: string
    invoice_number?: string | null
    total_amount: number
    paid_amount: number
    created_at: string
  }
  patient: {
    first_name: string
    last_name: string
    phone?: string | null
    patient_code?: string | null
  }
  remainingAfter: number
  onClose: () => void
}

function invoiceLabel(invoice: PaymentReceiptPrintProps['invoice']) {
  return invoice.invoice_number ? `#${invoice.invoice_number}` : invoice.id.slice(0, 8).toUpperCase()
}

export function PaymentReceiptPrint({ payment, invoice, patient, remainingAfter, onClose }: PaymentReceiptPrintProps) {
  const [doctor, setDoctor] = useState<DoctorProfileData | null>(null)
  const [logoSrc, setLogoSrc] = useState('/logo.png')

  useEffect(() => {
    let cancelled = false
    loadDoctorProfile().then((profile) => {
      if (!cancelled) setDoctor(profile)
    }, () => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (doctor?.logo_data) {
      setLogoSrc(doctor.logo_data)
      return
    }
    let cancelled = false
    cleanLogoSource('/logo.png').then((src) => {
      if (!cancelled) setLogoSrc(src)
    })
    return () => { cancelled = true }
  }, [doctor?.logo_data])

  const originalTitleRef = useRef('')
  useEffect(() => {
    originalTitleRef.current = document.title
    return () => { document.title = originalTitleRef.current }
  }, [])

  function handlePrint() {
    const namePart = `${patient.first_name} ${patient.last_name}`.trim()
    document.title = [namePart, 'Receipt', payment.id.slice(0, 8).toUpperCase()].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '-') || originalTitleRef.current
    window.print()
  }

  return (
    <div className="invoice-print-overlay fixed inset-0 bg-black/70 z-[100] flex items-start justify-center p-4 overflow-y-auto print:bg-white">
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

      <div
        className="invoice-print-container bg-white w-full max-w-md my-16 print:my-0 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 print:p-6 text-gray-900"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* ── Letterhead: doctor (left) · logo (center) · practice (right) ── */}
        <div className="border-b-2 border-gray-800 pb-4 mb-4">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
            <div>
              <div className="text-lg font-bold text-gray-900 leading-tight">
                {doctor?.full_name ? `Dr. ${doctor.full_name.replace(/^Dr\.?\s*/i, '')}` : 'Doctor Name'}
              </div>
              {doctor?.designation && (
                <div className="text-xs font-semibold text-gray-700 mt-0.5">{doctor.designation}</div>
              )}
            </div>
            <div className="self-center px-2">
              <img
                src={logoSrc}
                alt="Clinic logo"
                style={{ height: 72, width: 'auto', maxWidth: 140, objectFit: 'contain', mixBlendMode: 'multiply' }}
              />
            </div>
            <div className="text-right">
              {doctor?.workplace && (
                <div className="text-sm font-bold text-gray-800 leading-tight">{doctor.workplace}</div>
              )}
              {doctor?.phone && (
                <div className="text-xs font-semibold text-gray-700 mt-1">Ph: {doctor.phone}</div>
              )}
            </div>
          </div>
        </div>

        <div className="text-center mb-4">
          <div className="text-lg font-bold tracking-wide uppercase">Payment Receipt</div>
          <div className="text-sm text-gray-600">Receipt No: {payment.id.slice(0, 8).toUpperCase()}</div>
        </div>

        <div className="border border-gray-300 rounded-lg px-4 py-3 mb-4 bg-gray-50">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="font-semibold">Patient:</span> {patient.first_name} {patient.last_name}
            </div>
            {patient.patient_code && (
              <div><span className="font-semibold">ID:</span> {patient.patient_code}</div>
            )}
            <div>
              <span className="font-semibold">Invoice:</span> {invoiceLabel(invoice)}
            </div>
            <div className="ml-auto">
              <span className="font-semibold">Date:</span> {safeFormat(payment.payment_date, 'dd MMM yyyy')}
            </div>
          </div>
        </div>

        <div className="text-center py-4">
          <div className="text-sm text-gray-600">Amount Received</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{formatBDT(payment.amount)}</div>
        </div>

        <div className="border-t border-gray-300 pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Payment Method</span>
            <span className="font-medium">{payment.payment_method || 'Not specified'}</span>
          </div>
          {payment.notes && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Notes</span>
              <span className="font-medium text-right">{payment.notes}</span>
            </div>
          )}
          <div className="flex justify-between font-bold pt-1 border-t border-gray-200">
            <span>Due after this payment</span>
            <span>{formatBDT(remainingAfter)}</span>
          </div>
        </div>

        <div className="invoice-print-footer mt-10">
          <div className="flex justify-between items-end border-t border-gray-300 pt-4">
            <div className="text-xs text-gray-500">Thank you for your visit.</div>
            <div className="text-right">
              <div className="border-t border-gray-800 w-32 mb-1" />
              <div className="text-sm font-semibold">Authorized Signature</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
