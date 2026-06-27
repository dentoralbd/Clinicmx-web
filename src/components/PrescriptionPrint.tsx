import { Printer, X } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'

interface PrescriptionPrintProps {
  prescription: {
    prescribed_date: string
    chief_complaint?: string
    on_examination?: string
    diagnosis?: string
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

  return (
    <div className="prescription-print-overlay fixed inset-0 bg-black/70 z-[100] flex items-start justify-center p-4 overflow-y-auto print:bg-white">
      {/* Action bar – hidden on print */}
      <div className="print:hidden fixed top-4 right-4 flex gap-2 z-[101]">
        <button
          onClick={() => window.print()}
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
        className="prescription-print-container bg-white w-full max-w-2xl my-16 print:my-0 rounded-2xl print:rounded-none shadow-2xl print:shadow-none p-8 print:p-6 text-gray-900"
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* ── Letterhead ── */}
        <div className="border-b-2 border-gray-800 pb-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xl font-bold text-gray-900 leading-tight">
                {doctor.full_name
                  ? `Dr. ${doctor.full_name.replace(/^Dr\.?\s*/i, '')}`
                  : 'Doctor Name'}
              </div>
              {doctor.degrees && (
                <div className="text-sm text-gray-600 mt-0.5">{doctor.degrees}</div>
              )}
              {doctor.designation && (
                <div className="text-sm font-semibold text-gray-700 mt-0.5">{doctor.designation}</div>
              )}
              {doctor.workplace && (
                <div className="text-sm text-gray-600 mt-0.5">{doctor.workplace}</div>
              )}
              {doctor.clinic_address && (
                <div className="text-xs text-gray-500 mt-0.5">{doctor.clinic_address}</div>
              )}
              <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
                {doctor.bmdc_reg && <span>BMDC Reg: {doctor.bmdc_reg}</span>}
                {doctor.phone && <span>Ph: {doctor.phone}</span>}
                {doctor.email && <span>Email: {doctor.email}</span>}
              </div>
            </div>
            <div className="text-right text-sm text-gray-600">
              <div className="font-medium">Date:</div>
              <div>{format(new Date(prescription.prescribed_date), 'dd MMM yyyy')}</div>
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
          </div>
        </div>

        {/* ── Clinical Notes ── */}
        {(prescription.chief_complaint || prescription.on_examination || prescription.diagnosis) && (
          <div className="border border-gray-200 rounded-lg px-4 py-3 mb-4 space-y-1 text-sm">
            {prescription.chief_complaint && (
              <div>
                <span className="font-semibold">Chief Complaint:</span>{' '}
                {prescription.chief_complaint}
              </div>
            )}
            {prescription.on_examination && (
              <div>
                <span className="font-semibold">On Examination:</span>{' '}
                {prescription.on_examination}
              </div>
            )}
            {prescription.diagnosis && (
              <div>
                <span className="font-semibold">Diagnosis:</span>{' '}
                {prescription.diagnosis}
              </div>
            )}
          </div>
        )}

        {/* ── Rx ── */}
        {filteredMeds.length > 0 && (
          <div className="mb-4">
            <div className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: 'serif' }}>
              ℞
            </div>
            <ol className="space-y-3">
              {filteredMeds.map((med, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
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
          </div>
        )}

        {/* ── Investigations ── */}
        {filteredInvs.length > 0 && (
          <div className="mb-4 border-t border-dashed border-gray-300 pt-3">
            <div className="font-semibold text-sm text-gray-700 mb-2">Investigations:</div>
            <ul className="space-y-1">
              {filteredInvs.map((inv, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
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

        {/* ── Notes ── */}
        {prescription.notes && (
          <div className="mb-4 border-t border-dashed border-gray-300 pt-3 text-sm">
            <span className="font-semibold">Notes:</span> {prescription.notes}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="mt-8 flex justify-between items-end border-t border-gray-300 pt-4">
          <div className="text-sm text-gray-500">
            Follow-up: ___________________
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
  )
}
