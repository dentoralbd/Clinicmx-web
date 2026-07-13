import { jsPDF } from 'jspdf'
import { format, differenceInYears } from 'date-fns'
import { drawLetterhead, type PdfPatient } from '@/lib/invoicePdf'
import { entriesToText, type ClinicalEntry } from '@/lib/clinicalEntries'
import { getMedicalHistoryChecks } from '@/lib/medicalHistory'

export interface PdfPrescriptionDoctor {
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

export interface PdfPrescription {
  id?: string
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

export interface PdfPrescriptionPatient extends PdfPatient {
  date_of_birth?: string
  gender?: string
  medical_history?: string | null
}

function calcAge(dob?: string): string {
  if (!dob) return 'N/A'
  try {
    return `${differenceInYears(new Date(), new Date(dob))} yrs`
  } catch {
    return 'N/A'
  }
}

function sectionText(entries: ClinicalEntry[] | undefined, text: string | undefined): string {
  const fromEntries = entries ? entriesToText(entries) : ''
  return fromEntries || text?.trim() || ''
}

export function buildPrescriptionPdf(
  prescription: PdfPrescription,
  patient: PdfPrescriptionPatient,
  doctor: PdfPrescriptionDoctor | null,
  options: { logoSrc?: string } = {}
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - marginX * 2

  let y = drawLetterhead(doc, doctor as Parameters<typeof drawLetterhead>[1], options.logoSrc)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('PRESCRIPTION', pageWidth / 2, y, { align: 'center' })
  y += 24

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const patientLine = [
    `Patient: ${patient.first_name} ${patient.last_name}`,
    `Age: ${calcAge(patient.date_of_birth)}`,
    patient.gender ? `Gender: ${patient.gender}` : null,
    patient.phone ? `Phone: ${patient.phone}` : null,
    patient.patient_code ? `ID: ${patient.patient_code}` : null,
  ]
    .filter(Boolean)
    .join('    ')
  doc.text(patientLine, marginX, y)
  doc.text(`Date: ${format(new Date(prescription.prescribed_date), 'dd MMM yyyy')}`, pageWidth - marginX, y, { align: 'right' })
  y += 20
  doc.setDrawColor(190)
  doc.line(marginX, y - 10, pageWidth - marginX, y - 10)

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 90) {
      doc.addPage()
      y = 50
    }
  }

  const writeSection = (label: string, text: string) => {
    if (!text) return
    ensureSpace(28)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(label, marginX, y)
    y += 13
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(text, contentWidth)
    for (const line of lines) {
      ensureSpace(12)
      doc.text(line, marginX, y)
      y += 12
    }
    y += 6
  }

  writeSection('Chief Complaint', sectionText(prescription.chief_complaint_entries, prescription.chief_complaint))
  writeSection('Clinical Findings', sectionText(prescription.on_examination_entries, prescription.on_examination))
  writeSection('Diagnosis', sectionText(prescription.diagnosis_entries, prescription.diagnosis))

  const filteredInvs = prescription.investigations.filter((inv) => inv.name?.trim())
  if (filteredInvs.length > 0) {
    ensureSpace(28)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('Investigations', marginX, y)
    y += 13
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    for (const inv of filteredInvs) {
      const text =
        inv.name +
        (inv.urgency && inv.urgency !== 'Routine' ? ` (${inv.urgency})` : '') +
        (inv.description ? ` — ${inv.description}` : '')
      const lines = doc.splitTextToSize(`☐ ${text}`, contentWidth)
      for (const line of lines) {
        ensureSpace(12)
        doc.text(line, marginX, y)
        y += 12
      }
    }
    y += 6
  }

  writeSection('Treatment Plan', sectionText(prescription.treatment_plan_entries, prescription.treatment_plan))

  const { items: historyChecks, other: historyOther } = getMedicalHistoryChecks(patient.medical_history)
  const checkedHistoryLabels = historyChecks.filter((item) => item.checked).map((item) => item.label)
  if (checkedHistoryLabels.length > 0 || historyOther) {
    const text = [...checkedHistoryLabels, historyOther ? `Other: ${historyOther}` : null].filter(Boolean).join(', ')
    writeSection('Medical History', text)
  }

  const filteredMeds = prescription.medications.filter((med) => med.name?.trim())
  if (filteredMeds.length > 0) {
    ensureSpace(30)
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Rx', marginX, y)
    y += 16

    filteredMeds.forEach((med, idx) => {
      ensureSpace(24)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      const head = `${idx + 1}. ${med.name}`
      doc.text(head, marginX, y)
      const headWidth = doc.getTextWidth(head)

      doc.setFont('helvetica', 'normal')
      const detail = [
        med.dosage ? ` — ${med.dosage}` : '',
        med.route ? ` (${med.route})` : '',
        med.frequency ? ` · ${med.frequency}` : '',
        med.duration ? ` · ${med.duration}` : '',
      ].join('')
      const detailLines = doc.splitTextToSize(detail, contentWidth - headWidth - 4)
      if (detailLines.length > 0) doc.text(detailLines[0], marginX + headWidth + 4, y)
      y += 12
      for (const line of detailLines.slice(1)) {
        ensureSpace(11)
        doc.text(line, marginX + 14, y)
        y += 11
      }

      if (med.instructions) {
        doc.setFontSize(8)
        doc.setTextColor(120)
        const instrLines = doc.splitTextToSize(`Instructions: ${med.instructions}`, contentWidth - 14)
        for (const line of instrLines) {
          ensureSpace(11)
          doc.text(line, marginX + 14, y)
          y += 11
        }
        doc.setTextColor(0)
        doc.setFontSize(9.5)
      }
      y += 6
    })
  }

  if (prescription.notes) {
    writeSection('Notes', prescription.notes)
  }

  ensureSpace(60)
  y = Math.max(y + 16, pageHeight - 90)
  doc.setDrawColor(190)
  doc.line(marginX, y, pageWidth - marginX, y)
  const footerY = y + 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Follow-up: ___________________', marginX, footerY)
  if (prescription.id) {
    doc.setFontSize(7)
    doc.setTextColor(140)
    doc.text(`Prescription ID: ${prescription.id.slice(0, 8).toUpperCase()}`, marginX, footerY + 12)
    doc.setTextColor(0)
  }

  doc.line(pageWidth - marginX - 130, footerY - 4, pageWidth - marginX, footerY - 4)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(
    doctor?.full_name ? `Dr. ${doctor.full_name.replace(/^Dr\.?\s*/i, '')}` : 'Doctor Signature',
    pageWidth - marginX,
    footerY + 8,
    { align: 'right' }
  )
  if (doctor?.designation) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(doctor.designation, pageWidth - marginX, footerY + 19, { align: 'right' })
  }

  return doc
}

export function prescriptionPdfFileName(prescription: PdfPrescription, patient: PdfPatient): string {
  const namePart = `${patient.first_name}_${patient.last_name}`.trim().replace(/\s+/g, '_')
  const idPart = prescription.id ? prescription.id.slice(0, 8).toUpperCase() : 'Prescription'
  return `Prescription_${namePart}_${idPart}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
}
