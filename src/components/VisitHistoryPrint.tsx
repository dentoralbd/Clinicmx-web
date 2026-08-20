import { useEffect, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource } from '@/lib/logoImage'
import { safeFormat, formatBDT } from '@/lib/utils'

interface VisitHistoryPrintProps {
  visits: any[]
  invoices: any[]
  payments: any[]
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

// Reuses the exact notes-parsing/chip conventions the Visit History tab renders with, so
// the printed document matches what's on screen. See PatientProfile.tsx's TREATMENT_LINE_PREFIX
// / PAYMENT_LINE_PREFIX comment for why this text-parsing approach exists (visits have no DB
// link to treatments/invoices).
const TREATMENT_LINE_PREFIX = 'Treatment done:'
const PAYMENT_LINE_PREFIX = 'Payment:'

function splitVisitNotes(notes: string | null | undefined): {
  treatmentDone: string | null
  payment: string | null
  rest: string
} {
  let treatmentDone: string | null = null
  let payment: string | null = null
  const rest: string[] = []
  for (const line of (notes || '').split('\n')) {
    if (treatmentDone === null && line.startsWith(TREATMENT_LINE_PREFIX)) {
      treatmentDone = line.slice(TREATMENT_LINE_PREFIX.length).trim()
    } else if (payment === null && line.startsWith(PAYMENT_LINE_PREFIX)) {
      payment = line.slice(PAYMENT_LINE_PREFIX.length).trim()
    } else {
      rest.push(line)
    }
  }
  return { treatmentDone, payment, rest: rest.join('\n').trim() }
}

function parsePaymentChips(text: string): string[] {
  return text.split('·').map((part) => part.trim()).filter(Boolean)
}

// Mirrors PatientProfile.tsx's buildVisitPaymentChips: for invoice-linked visits, "Billed" is
// recomputed live from the invoice and "Due" is the running balance right after this visit's
// payment (bounded by the next sibling visit sharing the same invoice), not the invoice's
// current final due.
function buildVisitPaymentChips(
  visit: any,
  paymentText: string | null,
  invoices: any[],
  payments: any[],
  visits: any[]
): string[] {
  const chips = (paymentText ? parsePaymentChips(paymentText) : []).filter(
    (chip) => !chip.endsWith('toward previous due')
  )
  if (!visit.invoice_id) return chips
  const invoice = invoices.find((inv) => inv.id === visit.invoice_id)
  if (!invoice) return chips
  const billed = invoice.total_amount || 0
  const siblingVisits = visits
    .filter((v) => v.invoice_id === visit.invoice_id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const visitIndex = siblingVisits.findIndex((v) => v.id === visit.id)
  const nextVisit = visitIndex >= 0 ? siblingVisits[visitIndex + 1] : undefined
  const cutoff = nextVisit ? new Date(nextVisit.created_at).getTime() : Infinity
  const paidThroughVisit = payments
    .filter((p) => p.invoice_id === visit.invoice_id && new Date(p.payment_date).getTime() < cutoff)
    .reduce((sum, p) => sum + (p.amount || 0), 0)
  const due = Math.max(billed - paidThroughVisit, 0)
  const hadBilledChip = chips.some((chip) => chip.startsWith('Billed'))
  const result = hadBilledChip
    ? chips.map((chip) => (chip.startsWith('Billed') ? `Billed ${formatBDT(billed)}` : chip))
    : [`Billed ${formatBDT(billed)}`, ...chips]
  if (due > 0) result.push(`Due ${formatBDT(due)}`)
  return result
}

export function VisitHistoryPrint({ visits, invoices, payments, patient, doctor, onClose }: VisitHistoryPrintProps) {
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

  function handlePrint() {
    const namePart = [patient.first_name, patient.last_name].filter(Boolean).join(' ').trim().replace(/\s+/g, '_') || 'Patient'
    document.title = `Visit_History_${namePart}`.replace(/[\\/:*?"<>|]/g, '-')
    window.print()
  }

  // Oldest first reads naturally as a clinical history document.
  const orderedVisits = [...visits].sort(
    (a, b) => new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime()
  )

  return (
    <div className="invoice-print-overlay fixed inset-0 bg-black/70 z-[100] flex flex-col print:block print:bg-white">
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
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-2.5 py-2 sm:px-4 sm:py-2 rounded-xl shadow-sm hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <X className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex items-start justify-center p-4 print:p-0 print:block print:overflow-visible">
      <div
        className="invoice-print-container bg-white w-full max-w-3xl my-4 print:my-0 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 print:p-6 text-gray-900"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
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

        <div className="text-center mb-4">
          <div className="text-lg font-bold tracking-wide uppercase">Visit History</div>
        </div>

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
              <span className="font-semibold">Printed:</span> {safeFormat(new Date().toISOString(), 'dd MMM yyyy')}
            </div>
          </div>
        </div>

        {orderedVisits.length === 0 ? (
          <div className="text-sm text-gray-500 italic py-8 text-center">No visits recorded.</div>
        ) : (
          <div className="space-y-4">
            {orderedVisits.map((visit) => {
              const parsedNotes = splitVisitNotes(visit.notes)
              const paymentChips = buildVisitPaymentChips(visit, parsedNotes.payment, invoices, payments, visits)
              return (
                <div key={visit.id} className="border border-gray-300 rounded-lg p-4 break-inside-avoid">
                  <div className="font-bold text-sm border-b border-gray-200 pb-1.5 mb-2">
                    {safeFormat(visit.visit_date, 'dd MMM yyyy, h:mm a')}
                  </div>
                  <div className="text-sm space-y-1">
                    {visit.chief_complaint && (
                      <div><span className="font-semibold">CC:</span> {visit.chief_complaint}</div>
                    )}
                    {visit.examination_findings && (
                      <div><span className="font-semibold">O/E:</span> {visit.examination_findings}</div>
                    )}
                    {visit.diagnosis && (
                      <div><span className="font-semibold">Diagnosis:</span> {visit.diagnosis}</div>
                    )}
                    {visit.treatment_plan && (
                      <div><span className="font-semibold">Plan:</span> {visit.treatment_plan}</div>
                    )}
                    {parsedNotes.treatmentDone && (
                      <div><span className="font-semibold">Treatment Done:</span> {parsedNotes.treatmentDone}</div>
                    )}
                    {paymentChips.length > 0 && (
                      <div><span className="font-semibold">Payment:</span> {paymentChips.join(' · ')}</div>
                    )}
                    {parsedNotes.rest && (
                      <div className="italic text-gray-700 whitespace-pre-line pt-1">{parsedNotes.rest}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="invoice-print-footer mt-10">
          <div className="flex justify-between items-end border-t border-gray-300 pt-4">
            <div className="text-xs text-gray-500">Thank you for your visit.</div>
            <div className="text-right">
              <div className="border-t border-gray-800 w-40 mb-1" />
              <div className="text-sm font-semibold">Authorized Signature</div>
            </div>
          </div>
          <div className="text-center text-[10px] text-gray-400 mt-3">Crafted with ❤️ by ClinicMx</div>
        </div>
      </div>
      </div>
    </div>
  )
}
