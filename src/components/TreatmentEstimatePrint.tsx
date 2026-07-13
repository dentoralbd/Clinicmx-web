import { useEffect, useRef, useState } from 'react'
import { Mail, MessageCircle, Printer, X } from 'lucide-react'
import {
  buildTreatmentInvoiceItems,
  formatInvoiceItemLabel,
  getInvoiceItemLineTotal,
  getInvoiceItemQuantity,
  getInvoiceItemUnitPrice,
  getInvoiceItemSubtotal,
  groupSimilarInvoiceItems,
  type PendingTreatmentLike,
} from '@/lib/billing'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource } from '@/lib/logoImage'
import { sharePdf, toWhatsAppNumber } from '@/lib/sharePdf'
import { safeFormat, formatBDT } from '@/lib/utils'

interface TreatmentEstimatePrintProps {
  treatments: PendingTreatmentLike[]
  patient: {
    first_name: string
    last_name: string
    phone?: string | null
    email?: string | null
    patient_code?: string | null
  }
  doctor: DoctorProfileData | null
  onClose: () => void
}

export function TreatmentEstimatePrint({ treatments, patient, doctor, onClose }: TreatmentEstimatePrintProps) {
  const [groupSimilar, setGroupSimilar] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)

  const rawItems = buildTreatmentInvoiceItems(treatments)
  const items = groupSimilar ? groupSimilarInvoiceItems(rawItems) : rawItems
  const total = getInvoiceItemSubtotal(items)

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
    return () => { cancelled = true }
  }, [doctor?.logo_data])

  const originalTitleRef = useRef('')
  useEffect(() => {
    originalTitleRef.current = document.title
    return () => { document.title = originalTitleRef.current }
  }, [])

  useEffect(() => {
    if (!showShareMenu) return
    const handler = () => setShowShareMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showShareMenu])

  function handlePrint() {
    const namePart = `${patient.first_name} ${patient.last_name}`.trim()
    document.title = [namePart, 'Estimate'].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '-') || originalTitleRef.current
    window.print()
  }

  async function shareEstimate(channel: 'email' | 'whatsapp') {
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

    const { buildEstimatePdf, estimatePdfFileName } = await import('@/lib/estimatePdf')
    const pdf = buildEstimatePdf(treatments, patient, doctor, { groupSimilar, logoSrc })
    const fileName = estimatePdfFileName(patient)
    const subject = `Treatment Estimate - ${patient.first_name} ${patient.last_name}`
    const text = `Dear ${patient.first_name || 'Patient'},\n\nPlease find attached your treatment estimate. Estimated Total: ${formatBDT(total)}.`

    await sharePdf(pdf, fileName, {
      channel,
      email,
      waNumber,
      subject,
      text,
    })
  }

  return (
    <div className="invoice-print-overlay fixed inset-0 bg-black/70 z-[100] flex flex-col print:block print:bg-white">
      {/* Toolbar – sticky, hidden on print */}
      <div className="print:hidden sticky top-0 z-[101] bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2 sm:px-4 sm:py-3">
          <button
            onClick={handlePrint}
            aria-label="Print / Save as PDF"
            className="flex items-center gap-2 bg-primary text-white px-2.5 py-2 sm:px-4 sm:py-2 rounded-xl shadow-sm hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Print / Save as PDF</span>
          </button>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowShareMenu((v) => !v)
              }}
              aria-label="Email or WhatsApp estimate"
              className="flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-2.5 py-2 sm:px-4 sm:py-2 rounded-xl shadow-sm hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <Mail className="w-4 h-4 shrink-0" /><MessageCircle className="w-4 h-4 -ml-1 text-green-600 shrink-0" />
              <span className="hidden sm:inline">Share</span>
            </button>
            {showShareMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-44 max-w-[calc(100vw-1.5rem)]">
                <button
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    shareEstimate('email')
                    setShowShareMenu(false)
                  }}
                >
                  <Mail className="w-4 h-4" /> Email
                </button>
                <button
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    shareEstimate('whatsapp')
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
            aria-label="Close"
            className="flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-2.5 py-2 sm:px-4 sm:py-2 rounded-xl shadow-sm hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <X className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5 px-3 pb-2 sm:px-4 sm:pb-3 text-sm text-gray-700">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={groupSimilar} onChange={(e) => setGroupSimilar(e.target.checked)} />
            Group similar
          </label>
        </div>
      </div>

      {/* Scrollable body containing the estimate document */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center p-4 print:p-0 print:block print:overflow-visible">
      <div
        className="invoice-print-container bg-white w-full max-w-3xl my-4 print:my-0 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 print:p-6 text-gray-900"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* ── Letterhead: doctor (left) · logo (center) · practice (right) ── */}
        <div className="border-b-2 border-gray-800 pb-4 mb-4">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
            <div>
              <div className="text-xl font-bold text-gray-900 leading-tight">
                {doctor?.full_name ? `Dr. ${doctor.full_name.replace(/^Dr\.?\s*/i, '')}` : 'Doctor Name'}
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
        <div className="text-center mb-4">
          <div className="text-lg font-bold tracking-wide uppercase">Treatment Estimate</div>
          <div className="text-sm text-gray-600">Quotation</div>
        </div>

        {/* ── Patient Info ── */}
        <div className="border border-gray-300 rounded-lg px-4 py-3 mb-4 bg-gray-50">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="font-semibold">Patient:</span> {patient.first_name} {patient.last_name}
            </div>
            {patient.patient_code && (
              <div><span className="font-semibold">ID:</span> {patient.patient_code}</div>
            )}
            {patient.phone && (
              <div><span className="font-semibold">Phone:</span> {patient.phone}</div>
            )}
            <div className="ml-auto">
              <span className="font-semibold">Date:</span> {safeFormat(new Date().toISOString(), 'dd MMM yyyy')}
            </div>
          </div>
        </div>

        {/* ── Items ── */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="py-2 pr-2 font-semibold">Treatment</th>
              <th className="py-2 px-2 font-semibold w-16 text-center">Qty</th>
              <th className="py-2 px-2 font-semibold w-28 text-right">Unit Price</th>
              <th className="py-2 pl-2 font-semibold w-28 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-2 pr-2">{formatInvoiceItemLabel({ ...item, quantity: 1 })}</td>
                <td className="py-2 px-2 text-center">{getInvoiceItemQuantity(item)}</td>
                <td className="py-2 px-2 text-right">{formatBDT(getInvoiceItemUnitPrice(item))}</td>
                <td className="py-2 pl-2 text-right">{formatBDT(getInvoiceItemLineTotal(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 text-sm">
            <div className="flex justify-between font-bold text-base border-t-2 border-gray-800 pt-2">
              <span>Estimated Total</span>
              <span>{formatBDT(total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-600 space-y-1">
          <p className="italic">This is an estimate, not an invoice. Final charges may vary based on clinical findings.</p>
          <p>Valid for 30 days from {safeFormat(new Date().toISOString(), 'dd MMM yyyy')}.</p>
        </div>

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
    </div>
  )
}
