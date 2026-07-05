import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  formatInvoiceItemLabel,
  getInvoiceItemLineTotal,
  getInvoiceItemQuantity,
  getInvoiceItemUnitPrice,
  getInvoiceItemSubtotal,
  type BillingLineItem,
} from '@/lib/billing'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { formatBDT, safeFormat } from '@/lib/utils'

export interface PdfInvoice {
  id: string
  items: BillingLineItem[] | null
  total_amount: number
  paid_amount: number
  discount_amount?: number | null
  tax_amount?: number | null
  tax_rate?: number | null
  invoice_number?: string | null
  status: string
  due_date: string | null
  created_at: string
}

export interface PdfPatient {
  first_name: string
  last_name: string
  phone?: string | null
  patient_code?: string | null
}

export function buildInvoicePdf(invoice: PdfInvoice, patient: PdfPatient, doctor: DoctorProfileData | null): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(doctor?.full_name ? `Dr. ${doctor.full_name.replace(/^Dr\.?\s*/i, '')}` : 'Doctor', marginX, 50)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let ly = 66
  if (doctor?.degrees) {
    for (const line of doctor.degrees.split('\n').map((l) => l.trim()).filter(Boolean)) {
      doc.text(line, marginX, ly)
      ly += 12
    }
  }
  if (doctor?.designation) {
    doc.setFont('helvetica', 'bold')
    doc.text(doctor.designation, marginX, ly)
    doc.setFont('helvetica', 'normal')
    ly += 12
  }
  if (doctor?.bmdc_reg) {
    doc.text(`BMDC Reg: ${doctor.bmdc_reg}`, marginX, ly)
    ly += 12
  }

  let ry = 50
  if (doctor?.workplace) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(doctor.workplace, pageWidth - marginX, ry, { align: 'right' })
    ry += 14
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (doctor?.clinic_address) {
    for (const line of doctor.clinic_address.split('\n').map((l) => l.trim()).filter(Boolean)) {
      doc.text(line, pageWidth - marginX, ry, { align: 'right' })
      ry += 11
    }
  }
  if (doctor?.phone) {
    doc.text(`Ph: ${doctor.phone}`, pageWidth - marginX, ry, { align: 'right' })
    ry += 11
  }

  let y = Math.max(ly, ry) + 10
  doc.setDrawColor(30)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 26

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('INVOICE', pageWidth / 2, y, { align: 'center' })
  if (invoice.invoice_number) {
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`#${invoice.invoice_number}`, pageWidth / 2, y, { align: 'center' })
  }
  y += 24

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const patientLine = [
    `Patient: ${patient.first_name} ${patient.last_name}`,
    patient.patient_code ? `ID: ${patient.patient_code}` : null,
    patient.phone ? `Phone: ${patient.phone}` : null,
  ]
    .filter(Boolean)
    .join('    ')
  doc.text(patientLine, marginX, y)
  doc.text(`Date: ${safeFormat(new Date().toISOString(), 'dd MMM yyyy')}`, pageWidth - marginX, y, { align: 'right' })
  y += 16
  doc.text(
    `Issued: ${safeFormat(invoice.created_at, 'dd MMM yyyy')}` +
      (invoice.due_date ? ` • Due: ${safeFormat(invoice.due_date, 'dd MMM yyyy')}` : '') +
      ` • Status: ${invoice.status}`,
    marginX,
    y
  )
  y += 20

  const items = Array.isArray(invoice.items) ? invoice.items : []
  const rows =
    items.length > 0
      ? items.map((item) => [
          formatInvoiceItemLabel({ ...item, quantity: 1 }),
          String(getInvoiceItemQuantity(item)),
          formatBDT(getInvoiceItemUnitPrice(item)),
          formatBDT(getInvoiceItemLineTotal(item)),
        ])
      : [['Invoice total', '', '', formatBDT(invoice.total_amount)]]

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Qty', 'Unit Price', 'Amount']],
    body: rows,
    margin: { left: marginX, right: marginX },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], lineWidth: 0.75, lineColor: [30, 30, 30] },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18

  const subtotal = items.length > 0 ? getInvoiceItemSubtotal(items) : invoice.total_amount || 0
  const due = Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)
  const totalsRight = pageWidth - marginX
  const totalsLeft = totalsRight - 150

  const lines: Array<[string, string, boolean]> = [['Subtotal', formatBDT(subtotal), false]]
  if ((invoice.discount_amount || 0) > 0) lines.push(['Discount', `-${formatBDT(invoice.discount_amount || 0)}`, false])
  if ((invoice.tax_amount || 0) > 0) {
    lines.push([`Tax${invoice.tax_rate ? ` (${invoice.tax_rate}%)` : ''}`, formatBDT(invoice.tax_amount || 0), false])
  }
  lines.push(['Total', formatBDT(invoice.total_amount || 0), true])
  lines.push(['Paid', formatBDT(invoice.paid_amount || 0), false])
  lines.push(['Due', formatBDT(due), true])

  doc.setFontSize(9)
  for (const [label, value, bold] of lines) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, totalsLeft, y)
    doc.text(value, totalsRight, y, { align: 'right' })
    y += 14
  }

  y += 16
  doc.setDrawColor(190)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Thank you for your visit.', marginX, y)
  doc.line(pageWidth - marginX - 120, y - 4, pageWidth - marginX, y - 4)
  doc.text('Authorized Signature', pageWidth - marginX, y + 8, { align: 'right' })

  return doc
}

export function invoicePdfFileName(invoice: PdfInvoice, patient: PdfPatient): string {
  const idPart = invoice.invoice_number || invoice.id.slice(0, 8).toUpperCase()
  const namePart = `${patient.first_name}_${patient.last_name}`.trim().replace(/\s+/g, '_')
  return `Invoice_${namePart}_${idPart}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
}
