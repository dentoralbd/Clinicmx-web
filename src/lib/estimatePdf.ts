import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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
import { drawFooter, drawLetterhead, drawTotalsBlock, type PdfPatient } from '@/lib/invoicePdf'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { formatBDT, safeFormat } from '@/lib/utils'

function lastAutoTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
}

export function buildEstimatePdf(
  treatments: PendingTreatmentLike[],
  patient: PdfPatient,
  doctor: DoctorProfileData | null,
  options: { groupSimilar?: boolean; logoSrc?: string } = {}
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawLetterhead(doc, doctor, options.logoSrc)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('TREATMENT ESTIMATE', pageWidth / 2, y, { align: 'center' })
  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Quotation', pageWidth / 2, y, { align: 'center' })
  y += 24

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

  const rawItems = buildTreatmentInvoiceItems(treatments)
  const items = options.groupSimilar ? groupSimilarInvoiceItems(rawItems) : rawItems
  const rows = items.map((item) => [
    formatInvoiceItemLabel({ ...item, quantity: 1 }),
    String(getInvoiceItemQuantity(item)),
    formatBDT(getInvoiceItemUnitPrice(item)),
    formatBDT(getInvoiceItemLineTotal(item)),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Treatment', 'Qty', 'Unit Price', 'Amount']],
    body: rows,
    margin: { left: marginX, right: marginX },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], lineWidth: 0.75, lineColor: [30, 30, 30] },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  })

  y = lastAutoTableY(doc) + 18

  const total = getInvoiceItemSubtotal(items)
  y = drawTotalsBlock(doc, y, [['Estimated Total', formatBDT(total), true]]) + 16

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.text('This is an estimate, not an invoice. Final charges may vary based on clinical findings.', marginX, y)
  y += 12
  doc.text(`Valid for 30 days from ${safeFormat(new Date().toISOString(), 'dd MMM yyyy')}.`, marginX, y)
  y += 16

  drawFooter(doc, y)

  return doc
}

export function estimatePdfFileName(patient: PdfPatient): string {
  const namePart = `${patient.first_name}_${patient.last_name}`.trim().replace(/\s+/g, '_')
  return `Estimate_${namePart}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
}
