import { useEffect, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { QRCodeSVG } from 'qrcode.react'
import { buildPrescriptionQrPayload } from '@/lib/prescriptionQr'
import { getMedicalHistoryChecks } from '@/lib/medicalHistory'
import { cleanLogoSource } from '@/lib/logoImage'
import { type ClinicalEntry, quadrantAbbr } from '@/lib/clinicalEntries'

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
    medications: Array<{
      name: string
      dosage: string
      frequency: string
      duration: string
      instructions: string
      route?: string
    }>
    investigations: Array<{ name: string; description: string; urgency?: string }>
    notes?: string
  }
  patient: {
    first_name: string
    last_name: string
    date_of_birth?: string
    gender?: string
    phone?: string
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
    const idPart = prescription.id ? prescription.id.slice(0, 8).toUpperCase() : ''
    const namePart = `${patient.first_name} ${patient.last_name}`.trim()
    document.title =
      [namePart, idPart].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '-') ||
      originalTitleRef.current
    window.print()
  }

  return (
    <div className="prescription-print-overlay fixed inset-0 bg-black/70 z-[100] flex items-start justify-center p-4 overflow-y-auto print:bg-white">
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

      {/* Prescription document */}
      <div
        id="prescription-print-root"
        className="prescription-print-container bg-white w-full max-w-3xl my-16 print:my-0 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 print:p-6 text-gray-900"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* ── Letterhead: doctor (left) · logo (center) · practice (right) ── */}
        <div className="border-b-2 border-gray-800 pb-4 mb-4">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
            {/* Left — doctor information */}
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
        </div>

        {/* ── Patient Info ── */}
        <div className="border border-gray-300 rounded-lg px-4 py-3 mb-4 bg-gray-50">
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
                      {med.dosage && <span className="text-gray-700"> — {med.dosage}</span>}
                      {med.route && <span className="text-gray-600"> ({med.route})</span>}
                      {med.frequency && <span className="text-gray-600"> · {med.frequency}</span>}
                      {med.duration && <span className="text-gray-600"> · {med.duration}</span>}
                      {med.instructions && (
                        <div className="text-xs text-gray-500 mt-0.5 ml-2">
                          Instructions: {med.instructions}
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
        <div className="prescription-print-footer mt-8 print:mt-0">
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
          </div>
        </div>
      </div>
    </div>
  )
}
