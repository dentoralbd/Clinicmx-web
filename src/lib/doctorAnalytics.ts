import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawFooter, drawLetterhead } from '@/lib/invoicePdf'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { formatBDT, safeFormat } from '@/lib/utils'

export interface DoctorTreatmentRecord {
  id: string
  patient_id: string
  tooth_number: number | null
  treatment_type: string
  description: string | null
  status: string
  cost: number
  created_at: string
  doctor_name: string | null
  doctor_share_pct: number
  patientName: string
  patientCode?: string
  collectedAmount: number
}

export interface DoctorMonthlySummary {
  doctorName: string
  periodLabel: string
  totalProcedures: number
  completedProcedures: number
  totalBilledCost: number
  totalCollectedCash: number
  cumulativeBilledSalary: number
  cumulativeCollectedSalary: number
  clinicNetShare: number
  items: DoctorTreatmentRecord[]
}

/**
 * Calculates doctor performance, revenue share, and cumulative salary for a selected month/doctor.
 */
export function calculateDoctorMonthlyStats(
  treatments: any[],
  invoices: any[],
  patients: any[],
  selectedDoctor: string,
  selectedMonthYear: string // 'YYYY-MM' or 'ALL'
): DoctorMonthlySummary {
  // Create patient map for fast name lookup
  const patientMap = new Map<string, { name: string; code?: string }>()
  patients.forEach((p) => {
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient'
    patientMap.set(p.id, { name: fullName, code: p.patient_code })
  })

  // Create invoice paid amount map by treatment / patient
  const invoicePaidMap = new Map<string, { totalAmount: number; paidAmount: number }>()
  invoices.forEach((inv) => {
    if (inv.id && inv.status !== 'Merged' && inv.status !== 'Cancelled') {
      invoicePaidMap.set(inv.id, {
        totalAmount: Number(inv.total_amount || 0),
        paidAmount: Number(inv.paid_amount || 0),
      })
    }
  })

  // Filter treatments by doctor and month
  const filteredItems: DoctorTreatmentRecord[] = []

  treatments.forEach((t) => {
    const docName = (t.doctor_name || '').trim() || 'Unassigned / General'
    
    // Check doctor match
    if (selectedDoctor !== 'ALL' && docName.toLowerCase() !== selectedDoctor.toLowerCase()) {
      return
    }

    // Check date match if month filter applied
    if (selectedMonthYear !== 'ALL' && t.created_at) {
      const dateStr = t.created_at.substring(0, 7) // 'YYYY-MM'
      if (dateStr !== selectedMonthYear) return
    }

    const sharePct = Number(t.doctor_share_pct ?? 30)
    const cost = Number(t.cost || 0)
    const ptInfo = patientMap.get(t.patient_id) || { name: 'Unknown Patient' }

    // Estimate collected cash proportional to linked invoice
    let collectedAmount = 0
    if (t.invoice_id && invoicePaidMap.has(t.invoice_id)) {
      const inv = invoicePaidMap.get(t.invoice_id)!
      if (inv.totalAmount > 0) {
        const payRatio = Math.min(1, Math.max(0, inv.paidAmount / inv.totalAmount))
        collectedAmount = cost * payRatio
      }
    } else if (t.status === 'Completed' && t.is_invoiced) {
      collectedAmount = cost
    }

    filteredItems.push({
      id: t.id,
      patient_id: t.patient_id,
      tooth_number: t.tooth_number,
      treatment_type: t.treatment_type || 'Procedure',
      description: t.description || null,
      status: t.status || 'Planned',
      cost,
      created_at: t.created_at,
      doctor_name: docName,
      doctor_share_pct: sharePct,
      patientName: ptInfo.name,
      patientCode: ptInfo.code,
      collectedAmount,
    })
  })

  // Compute totals
  let totalBilledCost = 0
  let totalCollectedCash = 0
  let cumulativeBilledSalary = 0
  let cumulativeCollectedSalary = 0
  let completedCount = 0

  filteredItems.forEach((item) => {
    totalBilledCost += item.cost
    totalCollectedCash += item.collectedAmount

    const billedShare = item.cost * (item.doctor_share_pct / 100)
    const collectedShare = item.collectedAmount * (item.doctor_share_pct / 100)

    cumulativeBilledSalary += billedShare
    cumulativeCollectedSalary += collectedShare

    if (item.status === 'Completed') {
      completedCount++
    }
  })

  const clinicNetShare = totalCollectedCash - cumulativeCollectedSalary

  return {
    doctorName: selectedDoctor === 'ALL' ? 'All Doctors' : selectedDoctor,
    periodLabel: selectedMonthYear === 'ALL' ? 'All Time' : selectedMonthYear,
    totalProcedures: filteredItems.length,
    completedProcedures: completedCount,
    totalBilledCost,
    totalCollectedCash,
    cumulativeBilledSalary,
    cumulativeCollectedSalary,
    clinicNetShare,
    items: filteredItems,
  }
}

/**
 * Downloads a CSV file with doctor salary and treatment work breakdown.
 */
export function exportDoctorSalaryCSV(summary: DoctorMonthlySummary) {
  const headers = [
    'Date',
    'Patient Code',
    'Patient Name',
    'Doctor Name',
    'Procedure / Treatment',
    'Status',
    'Total Cost (BDT)',
    'Payment Collected (BDT)',
    'Doctor Share %',
    'Billed Salary Share (BDT)',
    'Collected Salary Share (BDT)',
  ]

  const rows = summary.items.map((item) => {
    const dateStr = item.created_at ? item.created_at.substring(0, 10) : ''
    const billedShare = (item.cost * (item.doctor_share_pct / 100)).toFixed(2)
    const collectedShare = (item.collectedAmount * (item.doctor_share_pct / 100)).toFixed(2)

    return [
      `"${dateStr}"`,
      `"${item.patientCode || ''}"`,
      `"${item.patientName.replace(/"/g, '""')}"`,
      `"${(item.doctor_name || '').replace(/"/g, '""')}"`,
      `"${item.treatment_type.replace(/"/g, '""')}"`,
      `"${item.status}"`,
      item.cost.toFixed(2),
      item.collectedAmount.toFixed(2),
      `${item.doctor_share_pct}%`,
      billedShare,
      collectedShare,
    ].join(',')
  })

  // Add Summary Rows
  rows.push('')
  rows.push(`"SUMMARY TOTALS (${summary.doctorName} - ${summary.periodLabel})",,,,,,,,,,`)
  rows.push(`"Total Procedures Count",${summary.totalProcedures},,,,,,,,,`)
  rows.push(`"Completed Procedures Count",${summary.completedProcedures},,,,,,,,,`)
  rows.push(`"Total Work Value (Billed)",${summary.totalBilledCost.toFixed(2)},,,,,,,,,`)
  rows.push(`"Total Cash Collected",${summary.totalCollectedCash.toFixed(2)},,,,,,,,,`)
  rows.push(`"Cumulative Billed Doctor Salary",${summary.cumulativeBilledSalary.toFixed(2)},,,,,,,,,`)
  rows.push(`"Cumulative Collected Doctor Salary (Payout)",${summary.cumulativeCollectedSalary.toFixed(2)},,,,,,,,,`)
  rows.push(`"Clinic Net Share",${summary.clinicNetShare.toFixed(2)},,,,,,,,,`)

  const csvContent = [headers.join(','), ...rows].join('\n')
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Doctor_Salary_Report_${summary.doctorName.replace(/[^a-zA-Z0-9]/g, '_')}_${summary.periodLabel}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Generates an A4 PDF Salary Statement & Performance Report using jsPDF.
 */
export function generateDoctorSalaryPDF(
  summary: DoctorMonthlySummary,
  doctorProfile: DoctorProfileData | null
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawLetterhead(doc, doctorProfile)

  // Title Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('DOCTOR FINANCIAL ANALYTICS & SALARY STATEMENT', pageWidth / 2, y, { align: 'center' })
  y += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Doctor: ${summary.doctorName}`, marginX, y)
  doc.text(`Period: ${summary.periodLabel}`, pageWidth - marginX, y, { align: 'right' })
  y += 14
  doc.text(`Generated: ${safeFormat(new Date().toISOString(), 'dd MMM yyyy, hh:mm a')}`, marginX, y)
  y += 20

  // Summary Metrics Card Table
  autoTable(doc, {
    startY: y,
    head: [['Total Work Value', 'Cash Collected', 'Doctor Share % Avg', 'Cumulative Billed Share', 'Payout Salary Earned']],
    body: [[
      formatBDT(summary.totalBilledCost),
      formatBDT(summary.totalCollectedCash),
      summary.items.length > 0 ? `${(summary.items.reduce((a, b) => a + b.doctor_share_pct, 0) / summary.items.length).toFixed(0)}%` : '30%',
      formatBDT(summary.cumulativeBilledSalary),
      formatBDT(summary.cumulativeCollectedSalary),
    ]],
    styles: { fontSize: 8, cellPadding: 5, halign: 'center' },
    headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255], fontStyle: 'bold' },
    theme: 'grid',
    margin: { left: marginX, right: marginX },
  })

  y = (doc as any).lastAutoTable.finalY + 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Itemized Procedure & Earnings Breakdown', marginX, y)
  y += 12

  // Detailed Table
  const tableRows = summary.items.map((item) => {
    const dateStr = item.created_at ? item.created_at.substring(0, 10) : ''
    const collectedShare = item.collectedAmount * (item.doctor_share_pct / 100)
    return [
      dateStr,
      item.patientName,
      item.treatment_type,
      item.status,
      formatBDT(item.cost),
      formatBDT(item.collectedAmount),
      `${item.doctor_share_pct}%`,
      formatBDT(collectedShare),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Patient Name', 'Procedure', 'Status', 'Cost', 'Collected', 'Share %', 'Salary Earned']],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 90 },
      2: { cellWidth: 100 },
      3: { cellWidth: 55 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'center' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
    theme: 'striped',
    margin: { left: marginX, right: marginX },
  })

  y = (doc as any).lastAutoTable.finalY + 30

  // Signatures section
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y > pageHeight - 80) {
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

  drawFooter(doc, y + 40)

  return doc
}
