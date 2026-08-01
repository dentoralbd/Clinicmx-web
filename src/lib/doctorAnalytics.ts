import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawFooter, drawLetterhead } from '@/lib/invoicePdf'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { formatBDT, safeFormat, csvCell } from '@/lib/utils'

// ============================================================================
// Two-part ledger, matching the clinic's reference statement format
// (2026-08-01 redesign): a "Work Done" log and a "Collections" log that do
// NOT line up row-for-row. Money in the statement is driven by real
// `payments` rows, never by allocating an invoice's payment ratio across its
// treatments — that produced fractional "paid" amounts (e.g. BDT 3,333.33
// against a still-incomplete BDT 4,000 crown) that were never actual
// payments. See calculateDoctorFinancialSummary for the attribution rule.
//
// No referral-fee (RF) tracking: no migration ever added an rf_pct column,
// it only ever rendered zero, and the user confirmed leaving it out.
// ============================================================================

export interface WorkDoneRow {
  id: string
  date: string
  patientName: string
  patientCode?: string
  refBy: string
  sourceOfIncome: string // Treatment / Procedure name
  amount: number // Billed cost
  note: string
}

export interface CollectionRow {
  id: string // payment id
  date: string // payment_date
  patientName: string
  patientCode?: string
  refBy: string // the invoice's single attributed doctor
  totalPaid: number // the actual payment amount — never a fraction of it
  txC: number // this payment's pro-rata share of the invoice's lab cost
  netA: number // totalPaid - txC
  doctorSharePct: number // cost-weighted average across the invoice's treatments
  clinicIncome: number
  drIncome: number
}

export interface FlaggedRow {
  id: string
  date: string // '' for standing reconciliation gaps (not tied to one event)
  patientName: string
  amount: number
  reason: string
}

export interface DoctorFinancialSummary {
  doctorName: string
  periodLabel: string
  totalWorkDone: number // Sum of Work Done Amount (billed)
  totalPaid: number // Sum of Collections Total Paid (actual cash)
  totalTxC: number
  totalNetA: number
  totalClinicIncome: number
  totalDrIncome: number
  workRowCount: number
  collectionRowCount: number
  workRows: WorkDoneRow[]
  collectionRows: CollectionRow[]
  flaggedRows: FlaggedRow[]
  flaggedTotal: number
}

// Invoices in these statuses are not real, current, active money and are
// deliberately excluded from the invoice map — a payment referencing one
// falls through to "unknown invoice" and gets flagged rather than folded
// into normal payout math. Matches FinancialReportsPanel.tsx's definition
// of an active invoice.
const INACTIVE_INVOICE_STATUSES = new Set(['Merged', 'Cancelled', 'Void', 'Deleted'])

/**
 * Two-part doctor payout statement: a Work Done log (what was performed,
 * no money) and a Collections log (real payments, with the payout math),
 * plus a Needs Attention list for money that can't be safely attributed.
 *
 * Attribution rule for a payment: invoice -> its linked treatments ->
 * doctor_name. Exactly one distinct doctor across those treatments -> the
 * whole payment is theirs. Zero or more-than-one distinct doctor -> flagged
 * for manual resolution, never guessed/split (user decision, 2026-08-01).
 */
export function calculateDoctorFinancialSummary(
  treatments: any[],
  invoices: any[],
  patients: any[],
  labWorks: any[],
  payments: any[],
  selectedDoctor: string,
  selectedMonthYear: string // 'YYYY-MM' or 'ALL'
): DoctorFinancialSummary {
  const patientMap = new Map<string, { name: string; code?: string }>()
  patients.forEach((p) => {
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient'
    patientMap.set(p.id, { name: fullName, code: p.patient_code })
  })

  const invoiceMap = new Map<string, { totalAmount: number; paidAmount: number; patientId: string | null }>()
  invoices.forEach((inv) => {
    if (inv.id && !INACTIVE_INVOICE_STATUSES.has(inv.status)) {
      invoiceMap.set(inv.id, {
        totalAmount: Number(inv.total_amount || 0),
        paidAmount: Number(inv.paid_amount || 0),
        patientId: inv.patient_id ?? null,
      })
    }
  })

  // Lab work expense (TxC), keyed by treatment ID or plan group ID.
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

  // Every treatment linked to a given invoice — the basis for attributing
  // that invoice's payments to a doctor.
  const treatmentsByInvoice = new Map<string, any[]>()
  treatments.forEach((t) => {
    if (!t.invoice_id) return
    const arr = treatmentsByInvoice.get(t.invoice_id) || []
    arr.push(t)
    treatmentsByInvoice.set(t.invoice_id, arr)
  })

  function labCostForTreatment(t: any): number {
    return labCostMap.get(t.id) || (t.treatment_plan_group_id ? labCostMap.get(t.treatment_plan_group_id) || 0 : 0)
  }

  // ---- Work Done: one row per treatment, no money columns ----
  const workRows: WorkDoneRow[] = []
  treatments.forEach((t) => {
    const docName = (t.doctor_name || '').trim() || 'Dr. Attending'
    if (selectedDoctor !== 'ALL' && docName.toLowerCase() !== selectedDoctor.toLowerCase()) return

    // Bucketed by completion date, falling back to creation date for
    // treatments not yet Completed (no completion date exists for those).
    const createdDateStr = t.created_at ? String(t.created_at).substring(0, 10) : ''
    const completedDateStr = t.completed_at ? String(t.completed_at).substring(0, 10) : ''
    const bucketDateStr = completedDateStr || createdDateStr
    if (selectedMonthYear !== 'ALL' && bucketDateStr && bucketDateStr.substring(0, 7) !== selectedMonthYear) return

    const ptInfo = patientMap.get(t.patient_id) || { name: 'Patient' }
    const note = t.notes || (t.tooth_number ? `Tooth #${t.tooth_number}` : '')

    workRows.push({
      id: t.id,
      date: bucketDateStr,
      patientName: ptInfo.name,
      patientCode: ptInfo.code,
      refBy: docName,
      sourceOfIncome: t.treatment_type || 'Procedure',
      amount: Number(t.cost || 0),
      note,
    })
  })

  // ---- Collections: one row per real payment ----
  // Flagged items are only surfaced in the unscoped "All Doctors" admin
  // view — they represent payments without a single confirmed doctor, so
  // showing them inside one specific doctor's (possibly self-locked) view
  // would leak ambiguous cross-doctor data. Admin reconciles them.
  const includeFlagged = selectedDoctor === 'ALL'
  const collectionRows: CollectionRow[] = []
  const flaggedRows: FlaggedRow[] = []

  payments.forEach((p) => {
    const amount = Number(p.amount || 0)
    if (amount <= 0) return

    const dateStr = p.payment_date
      ? String(p.payment_date).substring(0, 10)
      : p.created_at
        ? String(p.created_at).substring(0, 10)
        : ''
    if (selectedMonthYear !== 'ALL' && dateStr && dateStr.substring(0, 7) !== selectedMonthYear) return

    const invoice = p.invoice_id ? invoiceMap.get(p.invoice_id) : undefined
    if (!invoice) {
      if (includeFlagged) {
        flaggedRows.push({
          id: p.id,
          date: dateStr,
          patientName: 'Unknown',
          amount,
          reason: 'Payment references a removed, merged, or non-active invoice',
        })
      }
      return
    }

    const ptInfo = (invoice.patientId && patientMap.get(invoice.patientId)) || { name: 'Patient' }
    const invoiceTreatments = treatmentsByInvoice.get(p.invoice_id) || []

    if (invoiceTreatments.length === 0) {
      if (includeFlagged) {
        flaggedRows.push({
          id: p.id,
          date: dateStr,
          patientName: ptInfo.name,
          amount,
          reason: 'Invoice has no linked treatments to attribute this payment to',
        })
      }
      return
    }

    const distinctDoctors = new Set(invoiceTreatments.map((t) => (t.doctor_name || '').trim()).filter(Boolean))

    if (distinctDoctors.size === 0) {
      if (includeFlagged) {
        flaggedRows.push({
          id: p.id,
          date: dateStr,
          patientName: ptInfo.name,
          amount,
          reason: `${invoiceTreatments.length} treatment(s) on this invoice have no doctor assigned`,
        })
      }
      return
    }

    if (distinctDoctors.size > 1) {
      if (includeFlagged) {
        flaggedRows.push({
          id: p.id,
          date: dateStr,
          patientName: ptInfo.name,
          amount,
          reason: `${invoiceTreatments.length} treatments, ${distinctDoctors.size} doctors on this invoice — assign manually`,
        })
      }
      return
    }

    const doctorName = Array.from(distinctDoctors)[0]
    if (selectedDoctor !== 'ALL' && doctorName.toLowerCase() !== selectedDoctor.toLowerCase()) return

    const payFraction = invoice.totalAmount > 0 ? Math.min(1, Math.max(0, amount / invoice.totalAmount)) : 0

    let invoiceLabCost = 0
    let costSum = 0
    let weightedPctSum = 0
    invoiceTreatments.forEach((t) => {
      const tCost = Number(t.cost || 0)
      invoiceLabCost += labCostForTreatment(t)
      costSum += tCost
      weightedPctSum += tCost * Number(t.doctor_share_pct ?? 30)
    })
    // Pro-rata: a fully-paid invoice deducts its full lab cost exactly
    // once (summed across all its payments); a half-paid invoice deducts
    // half, matching the fraction of the work actually paid for.
    const txC = invoiceLabCost * payFraction
    const netA = Math.max(0, amount - txC)
    const doctorSharePct = costSum > 0 ? weightedPctSum / costSum : Number(invoiceTreatments[0]?.doctor_share_pct ?? 30)
    const drIncome = netA * (doctorSharePct / 100)
    const clinicIncome = netA - drIncome

    collectionRows.push({
      id: p.id,
      date: dateStr,
      patientName: ptInfo.name,
      patientCode: ptInfo.code,
      refBy: doctorName,
      totalPaid: amount,
      txC,
      netA,
      doctorSharePct: Math.round(doctorSharePct * 100) / 100,
      clinicIncome,
      drIncome,
    })
  })

  // ---- Reconciliation gaps: invoice.paid_amount with no matching ledger
  // rows to back it (recordInvoicePayment's legacy-schema fallback can
  // update paid_amount without writing a payments row). Not month-scoped —
  // a standing data gap, not a dated event — so it doesn't disappear just
  // because a specific month is selected. ----
  if (includeFlagged) {
    const ledgeredByInvoice = new Map<string, number>()
    payments.forEach((p) => {
      if (!p.invoice_id) return
      ledgeredByInvoice.set(p.invoice_id, (ledgeredByInvoice.get(p.invoice_id) || 0) + Number(p.amount || 0))
    })
    invoiceMap.forEach((inv, invId) => {
      const ledgered = ledgeredByInvoice.get(invId) || 0
      const gap = inv.paidAmount - ledgered
      if (gap > 0.01) {
        const ptInfo = (inv.patientId && patientMap.get(inv.patientId)) || { name: 'Patient' }
        flaggedRows.push({
          id: `gap-${invId}`,
          date: '',
          patientName: ptInfo.name,
          amount: gap,
          reason: 'Invoice shows this much paid with no matching payment record on file — data gap, not a new payout',
        })
      }
    })
  }

  let totalWorkDone = 0
  workRows.forEach((r) => (totalWorkDone += r.amount))

  let totalPaid = 0
  let totalTxC = 0
  let totalNetA = 0
  let totalClinicIncome = 0
  let totalDrIncome = 0
  collectionRows.forEach((r) => {
    totalPaid += r.totalPaid
    totalTxC += r.txC
    totalNetA += r.netA
    totalClinicIncome += r.clinicIncome
    totalDrIncome += r.drIncome
  })

  let flaggedTotal = 0
  flaggedRows.forEach((r) => (flaggedTotal += r.amount))

  return {
    doctorName: selectedDoctor === 'ALL' ? 'All Doctors' : selectedDoctor,
    periodLabel: selectedMonthYear === 'ALL' ? 'All Time' : selectedMonthYear,
    totalWorkDone,
    totalPaid,
    totalTxC,
    totalNetA,
    totalClinicIncome,
    totalDrIncome,
    workRowCount: workRows.length,
    collectionRowCount: collectionRows.length,
    workRows,
    collectionRows,
    flaggedRows,
    flaggedTotal,
  }
}

/**
 * Downloads a CSV of the two-part statement: Work Done, Collections, and
 * (when non-empty) Needs Attention.
 */
export function exportFinancialStatementCSV(summary: DoctorFinancialSummary) {
  const csvLines: string[] = []

  csvLines.push(`"Total Work Done (Billed)",${summary.totalWorkDone.toFixed(2)}`)
  csvLines.push(`"Total Collected",${summary.totalPaid.toFixed(2)}`)
  csvLines.push(`"Clinic Cost (TxC)",${summary.totalTxC.toFixed(2)}`)
  csvLines.push(`"Clinic Income",${summary.totalClinicIncome.toFixed(2)}`)
  csvLines.push(`"Dr Income",${summary.totalDrIncome.toFixed(2)}`)
  if (summary.flaggedRows.length > 0) {
    csvLines.push(`"Needs Attention (excluded from totals above)",${summary.flaggedTotal.toFixed(2)}`)
  }
  csvLines.push('')

  csvLines.push('"WORK DONE"')
  csvLines.push(['Date', 'Patient Name', 'Ref By', 'Source Of Income', 'Amount', 'Note'].join(','))
  summary.workRows.forEach((r) => {
    csvLines.push(
      [csvCell(r.date), csvCell(r.patientName), csvCell(r.refBy), csvCell(r.sourceOfIncome), r.amount.toFixed(2), csvCell(r.note)].join(',')
    )
  })
  csvLines.push(['"TOTAL"', '""', '""', '""', summary.totalWorkDone.toFixed(2), '""'].join(','))
  csvLines.push('')

  csvLines.push('"COLLECTIONS"')
  csvLines.push(['Date', 'Patient Name', 'Ref By', 'Total Paid', 'TxC', 'Net A', '%', 'Clinic Income', 'Dr. Income'].join(','))
  summary.collectionRows.forEach((r) => {
    csvLines.push(
      [
        csvCell(r.date),
        csvCell(r.patientName),
        csvCell(r.refBy),
        r.totalPaid.toFixed(2),
        r.txC.toFixed(2),
        r.netA.toFixed(2),
        `${r.doctorSharePct}%`,
        r.clinicIncome.toFixed(2),
        r.drIncome.toFixed(2),
      ].join(',')
    )
  })
  csvLines.push(
    [
      '"TOTALS"',
      '""',
      '""',
      summary.totalPaid.toFixed(2),
      summary.totalTxC.toFixed(2),
      summary.totalNetA.toFixed(2),
      '""',
      summary.totalClinicIncome.toFixed(2),
      summary.totalDrIncome.toFixed(2),
    ].join(',')
  )

  if (summary.flaggedRows.length > 0) {
    csvLines.push('')
    csvLines.push('"NEEDS ATTENTION — not included in any total above"')
    csvLines.push(['Date', 'Patient Name', 'Amount', 'Reason'].join(','))
    summary.flaggedRows.forEach((r) => {
      csvLines.push([csvCell(r.date), csvCell(r.patientName), r.amount.toFixed(2), csvCell(r.reason)].join(','))
    })
    csvLines.push(['"TOTAL"', '""', summary.flaggedTotal.toFixed(2), '""'].join(','))
  }

  const csvContent = csvLines.join('\n')
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
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
 * Generates an A4 landscape PDF of the two-part statement.
 */
export function generateFinancialStatementPDF(
  summary: DoctorFinancialSummary,
  doctorProfile: DoctorProfileData | null
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const marginX = 30
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  let y = drawLetterhead(doc, doctorProfile)

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

  const summaryHead = ['Total Work Done', 'Total Collected', 'Clinic Cost (TxC)', 'Clinic Income', 'Dr. Income']
  const summaryBody = [
    formatBDT(summary.totalWorkDone),
    formatBDT(summary.totalPaid),
    formatBDT(summary.totalTxC),
    formatBDT(summary.totalClinicIncome),
    formatBDT(summary.totalDrIncome),
  ]
  if (summary.flaggedRows.length > 0) {
    summaryHead.push('Needs Attention')
    summaryBody.push(formatBDT(summary.flaggedTotal))
  }
  autoTable(doc, {
    startY: y,
    head: [summaryHead],
    body: [summaryBody],
    styles: { fontSize: 8, cellPadding: 6, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255] },
    theme: 'grid',
    margin: { left: marginX, right: marginX },
  })
  y = (doc as any).lastAutoTable.finalY + 18

  function ensureRoom(minHeight: number) {
    if (y > pageHeight - minHeight) {
      doc.addPage()
      y = 40
    }
  }

  // ---- Work Done ----
  ensureRoom(120)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('WORK DONE', marginX, y)
  y += 8

  const workTableRows = summary.workRows.map((r) => [r.date, r.patientName, r.refBy, r.sourceOfIncome, formatBDT(r.amount), r.note || '-'])
  workTableRows.push(['TOTAL', '', '', '', formatBDT(summary.totalWorkDone), ''])
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Patient Name', 'Ref By', 'Source Of Income', 'Amount', 'Note']],
    body: workTableRows,
    styles: { fontSize: 7.5, cellPadding: 3.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right' } },
    theme: 'striped',
    margin: { left: marginX, right: marginX },
  })
  y = (doc as any).lastAutoTable.finalY + 22

  // ---- Collections ----
  ensureRoom(120)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('COLLECTIONS', marginX, y)
  y += 8

  const collectionTableRows = summary.collectionRows.map((r) => [
    r.date,
    r.patientName,
    r.refBy,
    formatBDT(r.totalPaid),
    formatBDT(r.txC),
    formatBDT(r.netA),
    `${r.doctorSharePct}%`,
    formatBDT(r.clinicIncome),
    formatBDT(r.drIncome),
  ])
  collectionTableRows.push([
    'TOTALS',
    '',
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
    head: [['Date', 'Patient Name', 'Ref By', 'Total Paid', 'TxC', 'Net A', '%', 'Clinic Income', 'Dr. Income']],
    body: collectionTableRows,
    styles: { fontSize: 7.5, cellPadding: 3.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'center' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right', fontStyle: 'bold' },
    },
    theme: 'striped',
    margin: { left: marginX, right: marginX },
  })
  y = (doc as any).lastAutoTable.finalY + 22

  // ---- Needs Attention ----
  if (summary.flaggedRows.length > 0) {
    ensureRoom(120)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(180, 83, 9)
    doc.text('NEEDS ATTENTION — not included in any total above', marginX, y)
    doc.setTextColor(0, 0, 0)
    y += 8

    const flaggedTableRows = summary.flaggedRows.map((r) => [r.date || '-', r.patientName, formatBDT(r.amount), r.reason])
    flaggedTableRows.push(['', '', formatBDT(summary.flaggedTotal), 'TOTAL'])
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Patient Name', 'Amount', 'Reason']],
      body: flaggedTableRows,
      styles: { fontSize: 7.5, cellPadding: 3.5 },
      headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' } },
      theme: 'striped',
      margin: { left: marginX, right: marginX },
    })
    y = (doc as any).lastAutoTable.finalY + 30
  }

  // ---- Signatures ----
  ensureRoom(70)
  const sigWidth = 140
  doc.setLineWidth(0.75)
  doc.setDrawColor(180, 180, 180)

  doc.line(marginX, y, marginX + sigWidth, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Doctor Signature & Date', marginX + 15, y + 12)

  doc.line(pageWidth - marginX - sigWidth, y, pageWidth - marginX, y)
  doc.text('Authorized Clinic Signature', pageWidth - marginX - sigWidth + 15, y + 12)

  drawFooter(doc, y + 35)

  return doc
}
