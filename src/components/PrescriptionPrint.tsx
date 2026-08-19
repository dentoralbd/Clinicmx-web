import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail, MessageCircle, Printer, X } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { QRCodeSVG } from 'qrcode.react'
import { buildPrescriptionQrPayload } from '@/lib/prescriptionQr'
import { getMedicalHistoryChecks } from '@/lib/medicalHistory'
import { cleanLogoSource } from '@/lib/logoImage'
import { sharePdf, toWhatsAppNumber } from '@/lib/sharePdf'
import { type ClinicalEntry, quadrantAbbr } from '@/lib/clinicalEntries'
import { listActiveLetterheadDoctors, type LetterheadDoctor } from '@/lib/prescriptionLetterheadDoctors'
import {
  dosageToBengali,
  routeToBengali,
  frequencyToBengali,
  durationToBengali,
  instructionsToBengali,
} from '@/lib/medicationBengali'

type LetterheadMode = 'header' | 'blank'
const LETTERHEAD_MODE_STORAGE_KEY = 'clinicmx_prescription_letterhead_mode'

// Flagged in the implementation plan as needing a real calibration pass
// against the physical pre-printed pad — cannot be derived from a screenshot.
const BLANK_MODE_TOP_MARGIN_MM = 55

function DoctorBlock({ doctor, align }: { doctor: LetterheadDoctor; align: 'left' | 'right' | 'center' }) {
  return (
    <div className={align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}>
      <div className="text-lg font-bold leading-tight" style={{ color: '#B0157A' }}>
        {doctor.full_name.startsWith('Dr.') || doctor.full_name.startsWith('Dr ') ? doctor.full_name : `Dr. ${doctor.full_name}`}
      </div>
      {doctor.degrees &&
        doctor.degrees
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, idx) => (
            <div key={idx} className="text-xs mt-0.5" style={{ color: '#1A7FB0' }}>{line}</div>
          ))}
      {doctor.designation && (
        <div className="text-sm font-semibold mt-0.5" style={{ color: '#1A7FB0' }}>{doctor.designation}</div>
      )}
      {doctor.bmdc_reg && (
        <div className="text-xs text-gray-500 mt-1">BMDC No. {doctor.bmdc_reg}</div>
      )}
    </div>
  )
}

function ClinicalEntryList({ entries, text }: { entries?: ClinicalEntry[]; text?: string }) {
  const filled = (entries || []).filter((entry) => entry.text.trim())
  if (filled.length > 0) {
    return (
      <ul className="space-y-0.5">
        {filled.map((entry) => (
          <li key={entry.id} className="text-gray-700">
            {entry.text}
            {entry.teeth.length > 0 && <span className="text-gray-500"> — Teeth: {entry.teeth.join(', ')}</span>}
            {entry.quadrants && entry.quadrants.length > 0 && (
              <span className="text-gray-500"> — Quadrant: {entry.quadrants.map(quadrantAbbr).join(', ')}</span>
            )}
          </li>
        ))}
      </ul>
    )
  }
  if (text) return <div className="text-gray-700 whitespace-pre-line">{text}</div>
  return null
}

interface PrescriptionPrintProps {
  prescription: {
    id?: string
    patient_id?: string
    prescribed_date: string
    chief_complaint?: string
    chief_complaint_entries?: ClinicalEntry[]
    on_examination?: string
    on_examination_entries?: ClinicalEntry[]
    diagnosis?: string
    diagnosis_entries?: ClinicalEntry[]
    treatment_plan?: string
    treatment_plan_entries?: ClinicalEntry[]
    language?: string
    medications: Array<{
      name: string
      dosage: string
      frequency: string
      duration: string
      instructions: string
      route?: string
      generic?: string
    }>
    investigations: Array<{ name: string; description: string; urgency?: string }>
    notes?: string
    discount_percent?: number | null
  }
  patient: {
    first_name: string
    last_name: string
    date_of_birth?: string
    gender?: string
    phone?: string
    email?: string | null
    patient_code?: string
    medical_history?: string | null
  }
  doctor: {
    full_name: string
    degrees: string
    designation: string
    workplace: string
    clinic_address?: string
    phone?: string
    email?: string
    bmdc_reg?: string
    logo_data?: string
  }
  onClose: () => void
}

function calcAge(dob?: string): string {
  if (!dob) return 'N/A'
  try {
    return `${differenceInYears(new Date(), new Date(dob))} yrs`
  } catch {
    return 'N/A'
  }
}

export function PrescriptionPrint({ prescription, patient, doctor, onClose }: PrescriptionPrintProps) {
  // Legacy rows have no `language` value — keep translating those (matches the
  // behavior this render-time fix originally shipped with). Only an explicit 'en'
  // (from the language toggle) skips translation, honoring an intentionally-English prescription.
  const shouldTranslate = prescription.language !== 'en'
  const filteredMeds = prescription.medications.filter((m) => m.name?.trim())
  const filteredInvs = prescription.investigations.filter((i) => i.name?.trim())
  const { items: historyChecks, other: historyOther } = getMedicalHistoryChecks(patient.medical_history)
  const checkedHistoryLabels = historyChecks.filter((item) => item.checked).map((item) => item.label)

  const qrPayload =
    prescription.id && prescription.patient_id
      ? buildPrescriptionQrPayload({
          patientId: prescription.patient_id,
          patientCode: patient.patient_code,
          patientName: `${patient.first_name} ${patient.last_name}`.trim(),
          prescriptionId: prescription.id,
          prescribedDate: prescription.prescribed_date,
        })
      : null

  const [letterheadMode, setLetterheadMode] = useState<LetterheadMode>(() => {
    if (typeof window === 'undefined') return 'header'
    return localStorage.getItem(LETTERHEAD_MODE_STORAGE_KEY) === 'blank' ? 'blank' : 'header'
  })

  function changeLetterheadMode(mode: LetterheadMode) {
    setLetterheadMode(mode)
    localStorage.setItem(LETTERHEAD_MODE_STORAGE_KEY, mode)
  }

  const { data: letterheadDoctors = [] } = useQuery({
    queryKey: ['letterheadDoctors', 'active'],
    queryFn: listActiveLetterheadDoctors,
  })

  // Uploaded logos are cleaned at upload time; the bundled default needs its
  // light background stripped here so it blends into the printed page.
  const [logoSrc, setLogoSrc] = useState(doctor.logo_data || '/logo.png')

  useEffect(() => {
    if (doctor.logo_data) {
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
  }, [doctor.logo_data])

  const originalTitleRef = useRef('')

  // Keep the prescription-named title until the modal closes: Android fires
  // 'afterprint' as soon as the print dialog opens, so restoring the title
  // there makes the saved PDF pick up the app title instead of the patient name.
  useEffect(() => {
    originalTitleRef.current = document.title
    return () => {
      document.title = originalTitleRef.current
    }
  }, [])

  const handlePrint = () => {
    const idPart = prescription.id ? prescription.id.slice(0, 8).toUpperCase() : ''
    const namePart = `${patient.first_name} ${patient.last_name}`.trim()
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

  async function sharePrescription(channel: 'email' | 'whatsapp') {
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

    const { buildPdfFromElement } = await import('@/lib/domToPdf')
    const pdf = await buildPdfFromElement('prescription-print-root')
    const namePart = [patient.first_name, patient.last_name].filter(Boolean).join(' ').trim().replace(/\s+/g, '_') || 'Patient'
    const idPart = prescription.id ? prescription.id.slice(0, 8).toUpperCase() : 'Prescription'
    const fileName = `Prescription_${namePart}_${idPart}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
    const subject = `Prescription - ${patient.first_name} ${patient.last_name}`
    const text = `Dear ${patient.first_name || 'Patient'},\n\nPlease find attached your prescription dated ${format(new Date(prescription.prescribed_date), 'dd MMM yyyy')}.`

    await sharePdf(pdf, fileName, { channel, email, waNumber, subject, text, docLabel: 'Prescription' })
  }

  return (
    <div className="prescription-print-overlay fixed inset-0 bg-black/70 z-[100] flex flex-col print:block print:bg-white">
      {/* Toolbar – sticky, hidden on print */}
      <div className="print:hidden sticky top-0 z-[101] bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center bg-gray-100 rounded-xl p-1 mr-auto text-sm font-medium">
            <button
              type="button"
              onClick={() => changeLetterheadMode('header')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${letterheadMode === 'header' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
            >
              With Header
            </button>
            <button
              type="button"
              onClick={() => changeLetterheadMode('blank')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${letterheadMode === 'blank' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
            >
              Blank (Pre-printed Pad)
            </button>
          </div>
          <button
            onClick={handlePrint}
            aria-label="Print / Save as PDF"
            className="flex items-center gap-2 bg-primary text-white px-2.5 py-2 sm:px-4 sm:py-2 rounded-xl shadow-sm hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Print / Save as PDF</span>
          </button>
          {letterheadMode !== 'blank' && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowShareMenu((v) => !v)
                }}
                aria-label="Email or WhatsApp prescription"
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
                      sharePrescription('email')
                      setShowShareMenu(false)
                    }}
                  >
                    <Mail className="w-4 h-4" /> Email
                  </button>
                  <button
                    className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      sharePrescription('whatsapp')
                      setShowShareMenu(false)
                    }}
                  >
                    <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
                  </button>
                </div>
              )}
            </div>
          )}
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

      {/* Scrollable body containing the prescription document */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center p-4 print:p-0 print:block print:overflow-visible">
      <div
        id="prescription-print-root"
        className="prescription-print-container bg-white w-full max-w-3xl min-h-[1085px] print:min-h-0 my-4 print:my-0 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 print:p-6 text-gray-900 flex flex-col print:block"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* ── Letterhead: doctors (left/right, from Admin > Prescription Doctors) · logo + clinic (center) ── */}
        {letterheadMode === 'header' && (
          <div
            className="border-b-2 pb-4 mb-4 -mx-8 print:-mx-6 px-8 print:px-6 pt-2"
            style={{ borderColor: '#B0157A', background: 'linear-gradient(to bottom, #FCE4EC, #ffffff)' }}
          >
            {letterheadDoctors.length > 0 ? (
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
                <div className="space-y-3">
                  {letterheadDoctors.filter((_, i) => i % 2 === 0).map((d) => (
                    <DoctorBlock key={d.id} doctor={d} align="left" />
                  ))}
                </div>
                <div className="self-center px-2 text-center">
                  <img
                    src={logoSrc}
                    alt="Clinic logo"
                    style={{ height: 80, width: 'auto', maxWidth: 150, objectFit: 'contain', mixBlendMode: 'multiply', margin: '0 auto' }}
                  />
                  {doctor.workplace && (
                    <div className="text-base font-bold mt-1" style={{ color: '#1A7FB0' }}>{doctor.workplace}</div>
                  )}
                  {(doctor.clinic_address || doctor.phone) && (
                    <div className="text-[11px] text-gray-600 mt-0.5 whitespace-pre-line">
                      {doctor.clinic_address}
                      {doctor.clinic_address && doctor.phone && ' · '}
                      {doctor.phone && `Ph: ${doctor.phone}`}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {letterheadDoctors.filter((_, i) => i % 2 === 1).map((d) => (
                    <DoctorBlock key={d.id} doctor={d} align="right" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
                {/* Fallback to the clinic's own doctor profile if no Prescription Doctors are configured yet */}
                <div>
                  <div className="text-xl font-bold text-gray-900 leading-tight">
                    {doctor.full_name
                      ? `Dr. ${doctor.full_name.replace(/^Dr\.?\s*/i, '')}`
                      : 'Doctor Name'}
                  </div>
                  {doctor.degrees &&
                    doctor.degrees
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line, idx) => (
                        <div key={idx} className="text-sm text-gray-600 mt-0.5">{line}</div>
                      ))}
                  {doctor.designation && (
                    <div className="text-sm font-semibold text-gray-700 mt-0.5">{doctor.designation}</div>
                  )}
                  {doctor.bmdc_reg && (
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
                  {doctor.workplace && (
                    <div className="text-base font-bold text-gray-800 leading-tight">{doctor.workplace}</div>
                  )}
                  {doctor.clinic_address && (
                    <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{doctor.clinic_address}</div>
                  )}
                  {doctor.phone && (
                    <div className="text-xs font-semibold text-gray-700 mt-1">Ph: {doctor.phone}</div>
                  )}
                  {doctor.email && (
                    <div className="text-xs text-gray-500 mt-0.5">Email: {doctor.email}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Patient Info ── */}
        <div
          className={
            letterheadMode === 'blank'
              ? 'px-1 py-2 mb-4'
              : 'border rounded-lg px-4 py-3 mb-4'
          }
          style={
            letterheadMode === 'blank'
              ? { marginTop: `${BLANK_MODE_TOP_MARGIN_MM}mm` }
              : { borderColor: '#F3C6DD', backgroundColor: '#FDF2F7' }
          }
        >
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="font-semibold">Patient:</span>{' '}
              {patient.first_name} {patient.last_name}
            </div>
            <div>
              <span className="font-semibold">Age:</span> {calcAge(patient.date_of_birth)}
            </div>
            {patient.gender && (
              <div>
                <span className="font-semibold">Gender:</span> {patient.gender}
              </div>
            )}
            {patient.phone && (
              <div>
                <span className="font-semibold">Phone:</span> {patient.phone}
              </div>
            )}
            {patient.patient_code && (
              <div>
                <span className="font-semibold">ID:</span> {patient.patient_code}
              </div>
            )}
            <div className="ml-auto">
              <span className="font-semibold">Date:</span>{' '}
              {format(new Date(prescription.prescribed_date), 'dd MMM yyyy')}
            </div>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
          {/* Left column — clinical sections */}
          <div className="space-y-4 text-sm">
            {(prescription.chief_complaint_entries?.some((e) => e.text.trim()) || prescription.chief_complaint) && (
              <div>
                <div className="font-semibold text-gray-800">Chief Complaint</div>
                <ClinicalEntryList entries={prescription.chief_complaint_entries} text={prescription.chief_complaint} />
              </div>
            )}

            {(prescription.on_examination_entries?.some((e) => e.text.trim()) || prescription.on_examination) && (
              <div>
                <div className="font-semibold text-gray-800">Clinical Findings</div>
                <ClinicalEntryList entries={prescription.on_examination_entries} text={prescription.on_examination} />
              </div>
            )}

            {(prescription.diagnosis_entries?.some((e) => e.text.trim()) || prescription.diagnosis) && (
              <div>
                <div className="font-semibold text-gray-800">Diagnosis</div>
                <ClinicalEntryList entries={prescription.diagnosis_entries} text={prescription.diagnosis} />
              </div>
            )}

            {filteredInvs.length > 0 && (
              <div>
                <div className="font-semibold text-gray-800 mb-1">Investigations</div>
                <ul className="space-y-1">
                  {filteredInvs.map((inv, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-0.5">☐</span>
                      <span>
                        <span className="font-medium">{inv.name}</span>
                        {inv.urgency && inv.urgency !== 'Routine' && (
                          <span className="ml-2 text-xs text-orange-700 font-medium">({inv.urgency})</span>
                        )}
                        {inv.description && (
                          <span className="text-gray-500"> — {inv.description}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {prescription.discount_percent != null && (
              <div className="font-semibold text-rose-700">
                Please discount {prescription.discount_percent}%
              </div>
            )}

            {(prescription.treatment_plan_entries?.some((e) => e.text.trim()) || prescription.treatment_plan) && (
              <div>
                <div className="font-semibold text-gray-800">Treatment Plan</div>
                <ClinicalEntryList entries={prescription.treatment_plan_entries} text={prescription.treatment_plan} />
              </div>
            )}

            {(checkedHistoryLabels.length > 0 || historyOther) && (
              <div>
                <div className="font-semibold text-gray-800 mb-1">Medical History</div>
                <ul className="space-y-0.5">
                  {checkedHistoryLabels.map((label) => (
                    <li key={label} className="flex items-center gap-2">
                      <span>☑</span>
                      <span>{label}</span>
                    </li>
                  ))}
                  {historyOther && (
                    <li className="flex items-center gap-2">
                      <span>☑</span>
                      <span>Other: {historyOther}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Vertical divider */}
          <div className="border-l border-dashed border-gray-400" />

          {/* Right column — Rx */}
          <div className="text-sm">
            <div className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: 'serif' }}>
              ℞
            </div>
            {filteredMeds.length > 0 && (
              <ol className="space-y-3">
                {filteredMeds.map((med, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-bold min-w-[1.2rem]">{idx + 1}.</span>
                    <div>
                      <span className="font-bold">{med.name}</span>
                      {med.generic && <span className="italic text-gray-600"> ({med.generic})</span>}
                      {med.dosage && (
                        <span className="text-gray-700"> — {shouldTranslate ? dosageToBengali(med.dosage) : med.dosage}</span>
                      )}
                      {med.route && (
                        <span className="text-gray-600"> ({shouldTranslate ? routeToBengali(med.route) : med.route})</span>
                      )}
                      {med.frequency && (
                        <span className="text-gray-600"> · {shouldTranslate ? frequencyToBengali(med.frequency) : med.frequency}</span>
                      )}
                      {med.duration && (
                        <span className="text-gray-600"> · {shouldTranslate ? durationToBengali(med.duration) : med.duration}</span>
                      )}
                      {med.instructions && (
                        <div className="text-xs text-gray-500 mt-0.5 ml-2">
                          Instructions: {shouldTranslate ? instructionsToBengali(med.instructions) : med.instructions}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {prescription.notes && (
              <div className="mt-4 border-t border-dashed border-gray-300 pt-3">
                <span className="font-semibold">Notes:</span> {prescription.notes}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer (pinned to bottom of printed page) ── */}
        <div className="prescription-print-footer mt-auto pt-8 print:mt-0 print:pt-0">
          <div className="flex justify-between items-end border-t border-gray-300 pt-4">
            <div className="text-sm text-gray-500">
              <div>Follow-up: ___________________</div>
              {qrPayload && (
                <div className="mt-3">
                  <QRCodeSVG value={qrPayload} size={72} />
                  {prescription.id && (
                    <div className="text-[9px] text-gray-400 mt-1">
                      Prescription ID: {prescription.id.slice(0, 8).toUpperCase()}
                    </div>
                  )}
                </div>
              )}
            </div>
            {letterheadMode === 'header' && (
              <div className="text-right">
                <div className="border-t border-gray-800 w-40 mb-1" />
                <div className="text-sm font-semibold">
                  {doctor.full_name
                    ? `Dr. ${doctor.full_name.replace(/^Dr\.?\s*/i, '')}`
                    : 'Doctor Signature'}
                </div>
                {doctor.designation && (
                  <div className="text-xs text-gray-600">{doctor.designation}</div>
                )}
              </div>
            )}
          </div>
          <div className="text-center text-[10px] text-gray-400 mt-3">Crafted with ❤️ by ClinicMx</div>
        </div>
      </div>
      </div>
    </div>
  )
}
