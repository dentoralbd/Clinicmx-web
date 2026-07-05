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

export interface PdfPayment {
  id: string
  amount: number
  payment_date: string
  payment_method: string | null
  invoice_id: string
  payment_methods?: { name: string } | null
}

export interface BuildInvoicePdfOptions {
  /** Combined statement only: adds an "Outstanding invoices only" subtitle */
  dueOnly?: boolean
  /** Combined statement only: whether to include each invoice's line items or just its totals */
  showItems?: boolean
  /** Combined statement only: payment history table */
  payments?: PdfPayment[]
  /** Clinic/doctor logo as a data URL — same source used by the on-screen letterhead */
  logoSrc?: string
}

function invoiceLabel(invoice: PdfInvoice) {
  return invoice.invoice_number ? `#${invoice.invoice_number}` : invoice.id.slice(0, 8).toUpperCase()
}

function getInvoiceDue(invoice: PdfInvoice) {
  return Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)
}

function lastAutoTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
}

function drawLogo(doc: jsPDF, logoSrc?: string): void {
  // Only data URLs are usable here — jsPDF cannot fetch a relative/external URL synchronously.
  if (!logoSrc || !logoSrc.startsWith('data:')) return
  try {
    const props = doc.getImageProperties(logoSrc)
    const pageWidth = doc.internal.pageSize.getWidth()
    const maxHeight = 55
    const maxWidth = 130
    let height = maxHeight
    let width = (props.width / props.height) * height
    if (width > maxWidth) {
      width = maxWidth
      height = (props.height / props.width) * width
    }
    doc.addImage(
      logoSrc,
      props.fileType || 'PNG',
      pageWidth / 2 - width / 2,
      36,
      width,
      height,
      undefined,
      'FAST'
    )
  } catch (error) {
    console.error('Failed to embed logo in invoice PDF:', error)
  }
}

function drawLetterhead(doc: jsPDF, doctor: DoctorProfileData | null, logoSrc?: string): number {
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()

  drawLogo(doc, logoSrc)

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

  const y = Math.max(ly, ry) + 10
  doc.setDrawColor(30)
  doc.line(marginX, y, pageWidth - marginX, y)
  return y + 26
}

function drawTotalsBlock(
  doc: jsPDF,
  y: number,
  lines: Array<[string, string, boolean]>,
  opts?: { fontSize?: number }
): number {
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const totalsRight = pageWidth - marginX
  const totalsLeft = totalsRight - 150

  doc.setFontSize(opts?.fontSize ?? 9)
  let cursor = y
  for (const [label, value, bold] of lines) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, totalsLeft, cursor)
    doc.text(value, totalsRight, cursor, { align: 'right' })
    cursor += 14
  }
  return cursor
}

function drawFooter(doc: jsPDF, y: number): void {
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  doc.setDrawColor(190)
  doc.line(marginX, y, pageWidth - marginX, y)
  const footerY = y + 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Thank you for your visit.', marginX, footerY)
  doc.line(pageWidth - marginX - 120, footerY - 4, pageWidth - marginX, footerY - 4)
  doc.text('Authorized Signature', pageWidth - marginX, footerY + 8, { align: 'right' })
}

function buildSingleInvoicePdf(
  invoice: PdfInvoice,
  patient: PdfPatient,
  doctor: DoctorProfileData | null,
  logoSrc?: string
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawLetterhead(doc, doctor, logoSrc)

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

  y = lastAutoTableY(doc) + 18

  const subtotal = items.length > 0 ? getInvoiceItemSubtotal(items) : invoice.total_amount || 0
  const due = getInvoiceDue(invoice)

  const lines: Array<[string, string, boolean]> = [['Subtotal', formatBDT(subtotal), false]]
  if ((invoice.discount_amount || 0) > 0) lines.push(['Discount', `-${formatBDT(invoice.discount_amount || 0)}`, false])
  if ((invoice.tax_amount || 0) > 0) {
    lines.push([`Tax${invoice.tax_rate ? ` (${invoice.tax_rate}%)` : ''}`, formatBDT(invoice.tax_amount || 0), false])
  }
  lines.push(['Total', formatBDT(invoice.total_amount || 0), true])
  lines.push(['Paid', formatBDT(invoice.paid_amount || 0), false])
  lines.push(['Due', formatBDT(due), true])

  y = drawTotalsBlock(doc, y, lines) + 16
  drawFooter(doc, y)

  return doc
}

function buildCombinedInvoicePdf(
  invoices: PdfInvoice[],
  patient: PdfPatient,
  doctor: DoctorProfileData | null,
  options: BuildInvoicePdfOptions,
  logoSrc?: string
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const showItems = options.showItems ?? true

  let y = drawLetterhead(doc, doctor, logoSrc)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('COMBINED INVOICE / STATEMENT', pageWidth / 2, y, { align: 'center' })
  if (options.dueOnly) {
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Outstanding invoices only', pageWidth / 2, y, { align: 'center' })
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
  y += 20

  for (const invoice of invoices) {
    const items = Array.isArray(invoice.items) ? invoice.items : []
    const adjustments: string[] = []
    if ((invoice.discount_amount || 0) > 0) adjustments.push(`Discount -${formatBDT(invoice.discount_amount || 0)}`)
    if ((invoice.tax_amount || 0) > 0) {
      adjustments.push(`Tax${invoice.tax_rate ? ` (${invoice.tax_rate}%)` : ''} +${formatBDT(invoice.tax_amount || 0)}`)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Invoice ${invoiceLabel(invoice)}`, marginX, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(
      `${safeFormat(invoice.created_at, 'dd MMM yyyy')}` +
        (invoice.due_date ? ` • Due: ${safeFormat(invoice.due_date, 'dd MMM yyyy')}` : '') +
        ` • ${invoice.status}` +
        (adjustments.length > 0 ? ` • ${adjustments.join(' • ')}` : ''),
      pageWidth - marginX,
      y,
      { align: 'right' }
    )
    y += 8

    if (showItems) {
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
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], lineWidth: 0.5, lineColor: [30, 30, 30] },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      })
      y = lastAutoTableY(doc) + 6
    } else {
      y += 4
    }

    const due = getInvoiceDue(invoice)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const totalsText = `Total ${formatBDT(invoice.total_amount || 0)}   ·   Paid ${formatBDT(invoice.paid_amount || 0)}   ·   Due ${formatBDT(due)}`
    doc.text(totalsText, pageWidth - marginX, y, { align: 'right' })
    y += 18

    if (y > doc.internal.pageSize.getHeight() - 120 && invoice !== invoices[invoices.length - 1]) {
      doc.addPage()
      y = 50
    }
  }

  const payments = options.payments || []
  if (payments.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 150) {
      doc.addPage()
      y = 50
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Payment History', marginX, y)
    y += 8

    const invoiceLabelById = new Map(invoices.map((invoice) => [invoice.id, invoiceLabel(invoice)]))
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Invoice', 'Method', 'Amount']],
      body: payments.map((payment) => [
        safeFormat(payment.payment_date, 'dd MMM yyyy'),
        invoiceLabelById.get(payment.invoice_id) || '—',
        payment.payment_method || payment.payment_methods?.name || '—',
        formatBDT(payment.amount),
      ]),
      margin: { left: marginX, right: marginX },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], lineWidth: 0.75, lineColor: [30, 30, 30] },
      columnStyles: { 3: { halign: 'right' } },
    })
    y = lastAutoTableY(doc) + 18
  }

  if (y > doc.internal.pageSize.getHeight() - 120) {
    doc.addPage()
    y = 50
  }

  const grandTotal = invoices.reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0)
  const grandPaid = invoices.reduce((sum, invoice) => sum + (invoice.paid_amount || 0), 0)
  const grandDue = Math.max(grandTotal - grandPaid, 0)

  doc.setDrawColor(30)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 16
  y = drawTotalsBlock(
    doc,
    y,
    [
      ['Grand Total', formatBDT(grandTotal), true],
      ['Total Paid', formatBDT(grandPaid), false],
      ['Total Due', formatBDT(grandDue), true],
    ],
    { fontSize: 10 }
  )
  y += 12

  drawFooter(doc, y)

  return doc
}

export function buildInvoicePdf(
  invoices: PdfInvoice[],
  patient: PdfPatient,
  doctor: DoctorProfileData | null,
  options: BuildInvoicePdfOptions = {}
): jsPDF {
  if (invoices.length <= 1) {
    return buildSingleInvoicePdf(invoices[0], patient, doctor, options.logoSrc)
  }
  return buildCombinedInvoicePdf(invoices, patient, doctor, options, options.logoSrc)
}

export function invoicePdfFileName(invoices: PdfInvoice[], patient: PdfPatient): string {
  const namePart = `${patient.first_name}_${patient.last_name}`.trim().replace(/\s+/g, '_')
  if (invoices.length <= 1) {
    const idPart = invoices[0]?.invoice_number || invoices[0]?.id.slice(0, 8).toUpperCase() || 'Invoice'
    return `Invoice_${namePart}_${idPart}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
  }
  return `Statement_${namePart}_${invoices.length}invoices.pdf`.replace(/[\\/:*?"<>|]/g, '-')
}
