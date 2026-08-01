import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawFooter, drawLetterhead } from '@/lib/invoicePdf'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { formatBDT, safeFormat, csvCell } from '@/lib/utils'

// No referral-fee (RF) tracking yet: an earlier version of this statement
// read `t.rf_pct`, but no migration ever added that column to `treatments`,
// so RF was silently always 0 in every export. Removed rather than shown
// as a permanently-zero line; add rf_pct back with a real migration + UI
// field if referral fees become something the clinic tracks.
export interface FinancialStatementRow {
  id: string
  date: string
  patientName: string
  patientCode?: string
  refBy: string
  sourceOfIncome: string // Treatment / Procedure name
  amount: number // Billed Amount
  note: string // Remarks / Notes
  totalPaid: number // Paid Amount collected from invoice
  txC: number // Treatment Cost / Lab Expense (Direct Cost)
  netA: number // Total Paid - TxC
  doctorSharePct: number // Doctor % (e.g. 50%, 30%)
  clinicIncome: number // Clinic's earnings
  drIncome: number // Doctor's earnings
}

export interface DoctorFinancialSummary {
  doctorName: string
  periodLabel: string
  totalWorkflow: number // Sum of Amount
  totalPaid: number // Sum of Total Paid
  totalTxC: number // Sum of TxC (Lab/Direct Expenses)
  totalNetA: number // Sum of Net A
  totalClinicIncome: number // Sum of Clinic Income
  totalDrIncome: number // Sum of Doctor Income
  rowCount: number
  items: FinancialStatementRow[]
}

/**
 * Calculates complete financial statement matching clinic accounting layout.
 */
export function calculateDoctorFinancialSummary(
  treatments: any[],
  invoices: any[],
  patients: any[],
  labWorks: any[],
  selectedDoctor: string,
  selectedMonthYear: string // 'YYYY-MM' or 'ALL'
): DoctorFinancialSummary {
  // Create patient map
  const patientMap = new Map<string, { name: string; code?: string }>()
  patients.forEach((p) => {
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient'
    patientMap.set(p.id, { name: fullName, code: p.patient_code })
  })

  // Create invoice map
  const invoiceMap = new Map<string, { totalAmount: number; paidAmount: number }>()
  invoices.forEach((inv) => {
    if (inv.id && inv.status !== 'Merged' && inv.status !== 'Cancelled') {
      invoiceMap.set(inv.id, {
        totalAmount: Number(inv.total_amount || 0),
        paidAmount: Number(inv.paid_amount || 0),
      })
    }
  })

  // Create lab work expense map (TxC) by treatment ID or plan group ID
  const labCostMap = new Map<string, number>()
  if (Array.isArray(labWorks)) {
    labWorks.forEach((lw) => {
      const cost = Number(lw.pricing_mode === 'flat' ? lw.flat_price : (lw.unit_price || 0) * (lw.unit_count || 1))
      if (lw.source_treatment_id) {
        labCostMap.set(lw.source_treatment_id, (labCostMap.get(lw.source_treatment_id) || 0) + cost)
      } else if (lw.source_plan_group_id) {
        labCostMap.set(lw.source_plan_group_id, (labCostMap.get(lw.source_plan_group_id) || 0) + cost)
      }
    })
  }

  const rows: FinancialStatementRow[] = []

  treatments.forEach((t) => {
    const docName = (t.doctor_name || '').trim() || 'Dr. Attending'

    // Doctor filter
    if (selectedDoctor !== 'ALL' && docName.toLowerCase() !== selectedDoctor.toLowerCase()) {
      return
    }

    // Month filter
    const createdDateStr = t.created_at ? t.created_at.substring(0, 10) : ''
    if (selectedMonthYear !== 'ALL' && createdDateStr) {
      const dateStrMonth = createdDateStr.substring(0, 7)
      if (dateStrMonth !== selectedMonthYear) return
    }

    const amount = Number(t.cost || 0)
    const ptInfo = patientMap.get(t.patient_id) || { name: 'Patient' }

    // Proportional paid amount
    let totalPaid = 0
    if (t.invoice_id && invoiceMap.has(t.invoice_id)) {
      const inv = invoiceMap.get(t.invoice_id)!
      if (inv.totalAmount > 0) {
        const payRatio = Math.min(1, Math.max(0, inv.paidAmount / inv.totalAmount))
        totalPaid = amount * payRatio
      }
    } else if (t.status === 'Completed' && t.is_invoiced) {
      totalPaid = amount
    }

    // TxC (Direct Lab Cost)
    const txC = labCostMap.get(t.id) || (t.treatment_plan_group_id ? labCostMap.get(t.treatment_plan_group_id) || 0 : 0)

    const netA = Math.max(0, totalPaid - txC)
    const doctorSharePct = Number(t.doctor_share_pct ?? 30) // Default 30% — matches migration 044 and every write path

    // Income calculation
    const drIncome = netA * (doctorSharePct / 100)
    const clinicIncome = netA - drIncome

    const note = t.notes || (t.tooth_number ? `Tooth #${t.tooth_number}` : '')

    rows.push({
      id: t.id,
      date: createdDateStr,
      patientName: ptInfo.name,
      patientCode: ptInfo.code,
      refBy: docName,
      sourceOfIncome: t.treatment_type || 'Procedure',
      amount,
      note,
      totalPaid,
      txC,
      netA,
      doctorSharePct,
      clinicIncome,
      drIncome,
    })
  })

  // Aggregations matching sample excel header
  let totalWorkflow = 0
  let totalPaid = 0
  let totalTxC = 0
  let totalNetA = 0
  let totalClinicIncome = 0
  let totalDrIncome = 0

  rows.forEach((r) => {
    totalWorkflow += r.amount
    totalPaid += r.totalPaid
    totalTxC += r.txC
    totalNetA += r.netA
    totalClinicIncome += r.clinicIncome
    totalDrIncome += r.drIncome
  })

  return {
    doctorName: selectedDoctor === 'ALL' ? 'All Doctors' : selectedDoctor,
    periodLabel: selectedMonthYear === 'ALL' ? 'All Time' : selectedMonthYear,
    totalWorkflow,
    totalPaid,
    totalTxC,
    totalNetA,
    totalClinicIncome,
    totalDrIncome,
    rowCount: rows.length,
    items: rows,
  }
}

/**
 * Downloads CSV formatted matching the clinic's sample financial statement spreadsheet.
 */
export function exportFinancialStatementCSV(summary: DoctorFinancialSummary) {
  const csvLines: string[] = []

  // Top Summary Block (matching sample statement)
  csvLines.push(`"Total WorkFlow",${summary.totalWorkflow.toFixed(2)}`)
  csvLines.push(`"Clinic Income",${summary.totalClinicIncome.toFixed(2)}`)
  csvLines.push(`"Dr Income",${summary.totalDrIncome.toFixed(2)}`)
  csvLines.push(`"Clinic Cost (TxC)",${summary.totalTxC.toFixed(2)}`)
  csvLines.push('')

  // Detailed Table Headers
  const headers = [
    'Date',
    'Patient Name',
    'Ref By',
    'Source Of Income',
    'Amount',
    'Note',
    'Total Paid',
    'TxC',
    'Net A',
    '%',
    'Clinic Income',
    'Dr. Income',
  ]
  csvLines.push(headers.join(','))

  summary.items.forEach((r) => {
    csvLines.push(
      [
        csvCell(r.date),
        csvCell(r.patientName),
        csvCell(r.refBy),
        csvCell(r.sourceOfIncome),
        r.amount.toFixed(2),
        csvCell(r.note),
        r.totalPaid.toFixed(2),
        r.txC.toFixed(2),
        r.netA.toFixed(2),
        `${r.doctorSharePct}%`,
        r.clinicIncome.toFixed(2),
        r.drIncome.toFixed(2),
      ].join(',')
    )
  })

  // Bottom Summary Row
  csvLines.push('')
  csvLines.push(
    [
      '"TOTALS"',
      '""',
      '""',
      '""',
      summary.totalWorkflow.toFixed(2),
      '""',
      summary.totalPaid.toFixed(2),
      summary.totalTxC.toFixed(2),
      summary.totalNetA.toFixed(2),
      '""',
      summary.totalClinicIncome.toFixed(2),
      summary.totalDrIncome.toFixed(2),
    ].join(',')
  )

  const csvContent = csvLines.join('\n')
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Financial_Statement_${summary.doctorName.replace(/[^a-zA-Z0-9]/g, '_')}_${summary.periodLabel}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Generates an A4 PDF Financial Statement matching sample clinic report.
 */
export function generateFinancialStatementPDF(
  summary: DoctorFinancialSummary,
  doctorProfile: DoctorProfileData | null
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }) // Landscape for full columns
  const marginX = 30
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawLetterhead(doc, doctorProfile)

  // Title Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('CLINICAL FINANCIAL STATEMENT & DOCTOR PAYOUT REPORT', pageWidth / 2, y, { align: 'center' })
  y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Attending Doctor / Ref By: ${summary.doctorName}`, marginX, y)
  doc.text(`Period: ${summary.periodLabel}`, pageWidth - marginX, y, { align: 'right' })
  y += 14
  doc.text(`Report Date: ${safeFormat(new Date().toISOString(), 'dd MMM yyyy, hh:mm a')}`, marginX, y)
  y += 18

  // Top Summary Block Box
  autoTable(doc, {
    startY: y,
    head: [['Total WorkFlow', 'Total Paid', 'Clinic Cost (TxC)', 'Clinic Income', 'Dr. Income']],
    body: [[
      formatBDT(summary.totalWorkflow),
      formatBDT(summary.totalPaid),
      formatBDT(summary.totalTxC),
      formatBDT(summary.totalClinicIncome),
      formatBDT(summary.totalDrIncome),
    ]],
    styles: { fontSize: 8, cellPadding: 6, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255] },
    theme: 'grid',
    margin: { left: marginX, right: marginX },
  })

  y = (doc as any).lastAutoTable.finalY + 16

  // Itemized Rows
  const tableRows = summary.items.map((r) => [
    r.date,
    r.patientName,
    r.refBy,
    r.sourceOfIncome,
    formatBDT(r.amount),
    r.note || '-',
    formatBDT(r.totalPaid),
    formatBDT(r.txC),
    formatBDT(r.netA),
    `${r.doctorSharePct}%`,
    formatBDT(r.clinicIncome),
    formatBDT(r.drIncome),
  ])

  // Footer Totals Row
  tableRows.push([
    'TOTALS',
    '',
    '',
    '',
    formatBDT(summary.totalWorkflow),
    '',
    formatBDT(summary.totalPaid),
    formatBDT(summary.totalTxC),
    formatBDT(summary.totalNetA),
    '',
    formatBDT(summary.totalClinicIncome),
    formatBDT(summary.totalDrIncome),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Patient Name', 'Ref By', 'Source Of Income', 'Amount', 'Note', 'Total Paid', 'TxC', 'Net A', '%', 'Clinic Income', 'Dr. Income']],
    body: tableRows,
    styles: { fontSize: 7.5, cellPadding: 3.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 85 },
      2: { cellWidth: 90 },
      3: { cellWidth: 85 },
      4: { halign: 'right' },
      5: { cellWidth: 60 },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'center' },
      10: { halign: 'right', fontStyle: 'bold' },
      11: { halign: 'right', fontStyle: 'bold' },
    },
    theme: 'striped',
    margin: { left: marginX, right: marginX },
  })

  y = (doc as any).lastAutoTable.finalY + 30

  // Signatures section
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y > pageHeight - 70) {
    doc.addPage()
    y = 60
  }

  const sigWidth = 140
  doc.setLineWidth(0.75)
  doc.setDrawColor(180, 180, 180)

  // Doctor Signature
  doc.line(marginX, y, marginX + sigWidth, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Doctor Signature & Date', marginX + 15, y + 12)

  // Clinic Admin Signature
  doc.line(pageWidth - marginX - sigWidth, y, pageWidth - marginX, y)
  doc.text('Authorized Clinic Signature', pageWidth - marginX - sigWidth + 15, y + 12)

  drawFooter(doc, y + 35)

  return doc
}
