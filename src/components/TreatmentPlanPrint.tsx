import { useEffect, useRef, useState } from 'react'
import { Mail, MessageCircle, Printer, X } from 'lucide-react'
import {
  buildTreatmentPlanRows,
  computeTreatmentPlanTotals,
  type TreatmentPlanInvoiceLike,
  type TreatmentPlanTreatment,
} from '@/lib/treatmentPlanTotals'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource } from '@/lib/logoImage'
import { sharePdf, toWhatsAppNumber } from '@/lib/sharePdf'
import { safeFormat, formatBDT } from '@/lib/utils'

interface TreatmentPlanPrintProps {
  treatments: TreatmentPlanTreatment[]
  invoices?: TreatmentPlanInvoiceLike[]
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

function treatmentStatusBadgeClass(status: string) {
  return status === 'Completed' ? 'pill-success' :
    status === 'In Progress' ? 'pill-warning' :
    status === 'Cancelled' ? 'pill-error' :
    'bg-gray-100 text-gray-800'
}

export function TreatmentPlanPrint({ treatments, invoices = [], patient, doctor, onClose }: TreatmentPlanPrintProps) {
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [showDiscount, setShowDiscount] = useState(true)
  const [groupSimilar, setGroupSimilar] = useState(false)

  const { subtotal, discount: discountTotal, total } = computeTreatmentPlanTotals(treatments, invoices)
  const displayRows = buildTreatmentPlanRows(treatments, groupSimilar)

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
    document.title = [namePart, 'Treatment Plan'].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '-') || originalTitleRef.current
    window.print()
  }

  async function shareTreatmentPlan(channel: 'email' | 'whatsapp') {
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

    const { buildTreatmentPlanPdf, treatmentPlanPdfFileName } = await import('@/lib/treatmentPlanPdf')
    const pdf = buildTreatmentPlanPdf(treatments, patient, doctor, { logoSrc, invoices, showDiscount, groupSimilar })
    const fileName = treatmentPlanPdfFileName(patient)
    const subject = `Treatment Plan - ${patient.first_name} ${patient.last_name}`
    const text = `Dear ${patient.first_name || 'Patient'},\n\nPlease find attached your treatment plan. Total: ${formatBDT(total)}.`

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
              aria-label="Email or WhatsApp treatment plan"
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
                    shareTreatmentPlan('email')
                    setShowShareMenu(false)
                  }}
                >
                  <Mail className="w-4 h-4" /> Email
                </button>
                <button
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    shareTreatmentPlan('whatsapp')
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
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showDiscount} onChange={(e) => setShowDiscount(e.target.checked)} />
            Show discount breakdown
          </label>
        </div>
      </div>

      {/* Scrollable body containing the treatment plan document */}
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
          <div className="text-lg font-bold tracking-wide uppercase">Treatment Plan</div>
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
              <th className="py-2 pr-2 font-semibold w-14 text-center">Tooth</th>
              <th className="py-2 px-2 font-semibold w-28">Type</th>
              <th className="py-2 px-2 font-semibold">Description</th>
              <th className="py-2 px-2 font-semibold w-24 text-center">Status</th>
              <th className="py-2 pl-2 font-semibold w-28 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-200 align-top">
                <td className="py-2 pr-2 text-center">{row.toothLabel}</td>
                <td className="py-2 px-2">{row.treatment_type}{row.count > 1 ? ` x${row.count}` : ''}</td>
                <td className="py-2 px-2">
                  {row.description?.trim() || row.treatment_type}
                  {row.notes?.trim() && (
                    <div className="text-xs text-gray-500 mt-0.5">Note: {row.notes.trim()}</div>
                  )}
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${treatmentStatusBadgeClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-2 pl-2 text-right">{formatBDT(row.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 text-sm space-y-1">
            {showDiscount && (
              <>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatBDT(subtotal)}</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Discount</span>
                    <span>-{formatBDT(discountTotal)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between font-bold text-base border-t-2 border-gray-800 pt-2">
              <span>Total</span>
              <span>{formatBDT(total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-600 space-y-1">
          <p className="italic">
            This document lists the treatments recorded in the patient's chart as of {safeFormat(new Date().toISOString(), 'dd MMM yyyy')}.
            Costs reflect the plan at time of printing and may be revised as treatment progresses.
          </p>
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
