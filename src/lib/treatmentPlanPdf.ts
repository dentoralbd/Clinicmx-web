import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getTreatmentOriginalCost, getTreatmentPlanDiscountTotal } from '@/lib/billing'
import { drawFooter, drawLetterhead, drawTotalsBlock, type PdfPatient } from '@/lib/invoicePdf'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { formatBDT, safeFormat } from '@/lib/utils'

export interface TreatmentPlanTreatment {
  id: string
  treatment_type: string
  description?: string | null
  tooth_number?: number | null
  cost?: number | null
  original_cost?: number | null
  status: string
  notes?: string | null
}

function lastAutoTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
}

export function buildTreatmentPlanPdf(
  treatments: TreatmentPlanTreatment[],
  patient: PdfPatient,
  doctor: DoctorProfileData | null,
  options: { logoSrc?: string } = {}
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawLetterhead(doc, doctor, options.logoSrc)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('TREATMENT PLAN', pageWidth / 2, y, { align: 'center' })
  y += 24

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const patientLine = [
    `Patient: ${patient.first_name} ${patient.last_name}`,
    patient.patient_code ? `ID: ${patient.patient_code}` : null,
    patient.phone ? `Phone: ${patient.phone}` : null,
  ]
    .filter(Boolean)
    .join('    ')
  doc.text(patientLine, marginX, y)
  doc.text(`Date: ${safeFormat(new Date().toISOString(), 'dd MMM yyyy')}`, pageWidth - marginX, y, { align: 'right' })
  y += 20

  const rows = treatments.map((treatment) => {
    const descriptionLines = [treatment.description?.trim() || treatment.treatment_type]
    if (treatment.notes?.trim()) descriptionLines.push(`Note: ${treatment.notes.trim()}`)
    return [
      treatment.tooth_number ? `T${treatment.tooth_number}` : '—',
      treatment.treatment_type,
      descriptionLines.join('\n'),
      treatment.status,
      formatBDT(treatment.cost ?? 0),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Tooth', 'Type', 'Description', 'Status', 'Cost']],
    body: rows,
    margin: { left: marginX, right: marginX },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, valign: 'top' },
    headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], lineWidth: 0.75, lineColor: [30, 30, 30] },
    columnStyles: {
      0: { cellWidth: 40, halign: 'center' },
      1: { cellWidth: 80 },
      3: { cellWidth: 70 },
      4: { cellWidth: 60, halign: 'right' },
    },
  })

  y = lastAutoTableY(doc) + 18

  // Plain doc.text() calls below don't auto-paginate like autoTable does, so guard
  // against the totals/footer landing off the bottom of the page when the plan is long.
  if (y > doc.internal.pageSize.getHeight() - 140) {
    doc.addPage()
    y = 50
  }

  const subtotal = treatments.reduce((sum, t) => sum + getTreatmentOriginalCost(t), 0)
  const discountTotal = getTreatmentPlanDiscountTotal(treatments)
  const total = treatments.reduce((sum, t) => sum + (t.cost ?? 0), 0)

  const totalsLines: Array<[string, string, boolean]> = [['Subtotal', formatBDT(subtotal), false]]
  if (discountTotal > 0) totalsLines.push(['Discount', `-${formatBDT(discountTotal)}`, false])
  totalsLines.push(['Total', formatBDT(total), true])

  y = drawTotalsBlock(doc, y, totalsLines) + 16

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  const disclaimer = `This document lists the treatments recorded in the patient's chart as of ${safeFormat(new Date().toISOString(), 'dd MMM yyyy')}. Costs reflect the plan at time of printing and may be revised as treatment progresses.`
  const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - marginX * 2)
  doc.text(disclaimerLines, marginX, y)
  y += disclaimerLines.length * 10 + 8

  drawFooter(doc, y)

  return doc
}

export function treatmentPlanPdfFileName(patient: PdfPatient): string {
  const namePart = `${patient.first_name}_${patient.last_name}`.trim().replace(/\s+/g, '_')
  return `Treatment_Plan_${namePart}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
}
