import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabase'
import { drawFooter, drawLetterhead } from '@/lib/invoicePdf'
import type { DoctorProfileData } from '@/lib/doctorProfile'
import { formatBDT, safeFormat, csvCell } from '@/lib/utils'
import { logActivity } from '@/lib/activityLog'

export interface StaffRecord {
  id: string
  full_name: string
  phone: string | null
  designation: string | null
  monthly_salary: number
  app_user_id: string | null
  is_active: boolean
  joined_on: string | null
  notes: string | null
  leave_quota_days: number
  created_at: string
  updated_at: string
}

export interface StaffSalaryPayment {
  id: string
  staff_id: string
  period_month: string
  base_salary: number
  bonus: number
  deduction: number
  advance: number
  amount_paid: number
  payment_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const STAFF_COLUMNS =
  'id, full_name, phone, designation, monthly_salary, app_user_id, is_active, joined_on, notes, leave_quota_days, created_at, updated_at'
const PAYMENT_COLUMNS =
  'id, staff_id, period_month, base_salary, bonus, deduction, advance, amount_paid, payment_date, notes, created_at, updated_at'

export async function listStaff(): Promise<StaffRecord[]> {
  const { data, error } = await supabase.from('staff').select(STAFF_COLUMNS).order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as StaffRecord[]
}

export interface StaffInput {
  full_name: string
  phone?: string | null
  designation?: string | null
  monthly_salary: number
  app_user_id?: string | null
  joined_on?: string | null
  notes?: string | null
  leave_quota_days?: number
}

function staffPayload(input: StaffInput) {
  return {
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    designation: input.designation?.trim() || null,
    monthly_salary: input.monthly_salary,
    app_user_id: input.app_user_id || null,
    joined_on: input.joined_on || null,
    notes: input.notes?.trim() || null,
    leave_quota_days: input.leave_quota_days ?? 20,
  }
}

export async function createStaff(input: StaffInput): Promise<StaffRecord> {
  const { data, error } = await supabase.from('staff').insert(staffPayload(input)).select(STAFF_COLUMNS).single()
  if (error) throw new Error(error.message)
  const row = data as StaffRecord
  logActivity({ action: 'create', entityType: 'staff', entityId: row.id, entityLabel: row.full_name, details: 'Staff member added' })
  return row
}

export async function updateStaff(id: string, input: StaffInput): Promise<StaffRecord> {
  const { data, error } = await supabase.from('staff').update(staffPayload(input)).eq('id', id).select(STAFF_COLUMNS).single()
  if (error) throw new Error(error.message)
  const row = data as StaffRecord
  logActivity({ action: 'edit', entityType: 'staff', entityId: id, entityLabel: row.full_name, details: 'Staff details updated' })
  return row
}

export async function setStaffActive(id: string, isActive: boolean, fullName?: string): Promise<void> {
  const { error } = await supabase.from('staff').update({ is_active: isActive }).eq('id', id)
  if (error) throw new Error(error.message)
  logActivity({
    action: 'edit',
    entityType: 'staff',
    entityId: id,
    entityLabel: fullName ?? null,
    details: isActive ? 'Marked active' : 'Marked inactive',
  })
}

export async function deleteStaff(id: string, fullName?: string): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id)
  if (error) throw new Error(error.message)
  logActivity({ action: 'delete', entityType: 'staff', entityId: id, entityLabel: fullName ?? null, details: 'Staff member deleted' })
}

export async function listSalaryPayments(): Promise<StaffSalaryPayment[]> {
  const { data, error } = await supabase.from('staff_salary_payments').select(PAYMENT_COLUMNS).order('period_month', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as StaffSalaryPayment[]
}

/**
 * Ensures every active staff member has a payment row for the given month,
 * snapshotting their CURRENT monthly_salary into base_salary — this is what
 * keeps an old month's statement correct after a later raise. Safe to call
 * repeatedly: onConflict + ignoreDuplicates means an already-generated
 * month with figures entered is never overwritten.
 */
export async function ensureMonthRows(periodMonth: string, activeStaff: StaffRecord[]): Promise<void> {
  if (activeStaff.length === 0) return
  const rows = activeStaff.map((s) => ({
    staff_id: s.id,
    period_month: periodMonth,
    base_salary: s.monthly_salary,
  }))
  const { error } = await supabase
    .from('staff_salary_payments')
    .upsert(rows, { onConflict: 'staff_id,period_month', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

export interface SalaryPaymentInput {
  bonus: number
  deduction: number
  advance: number
  amount_paid: number
  payment_date: string | null
  notes: string | null
}

export async function updateSalaryPayment(
  id: string,
  input: SalaryPaymentInput,
  staffName?: string,
  periodMonth?: string
): Promise<void> {
  const { error } = await supabase
    .from('staff_salary_payments')
    .update({
      bonus: input.bonus,
      deduction: input.deduction,
      advance: input.advance,
      amount_paid: input.amount_paid,
      payment_date: input.payment_date,
      notes: input.notes,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  logActivity({
    action: 'edit',
    entityType: 'staff_salary',
    entityId: id,
    entityLabel: staffName ?? null,
    details: periodMonth ? `Salary payment updated for ${periodMonth}` : 'Salary payment updated',
  })
}

// ---------------------------------------------------------------------------
// Statement calculation + export
// ---------------------------------------------------------------------------

export type SalaryStatus = 'Pending' | 'Partial' | 'Paid'

export interface StaffStatementRow {
  paymentId: string
  staffId: string
  fullName: string
  designation: string
  phone: string
  baseSalary: number
  bonus: number
  deduction: number
  advance: number
  netPayable: number
  amountPaid: number
  due: number
  status: SalaryStatus
  paymentDate: string | null
  notes: string
}

export interface StaffSalarySummary {
  staffLabel: string
  periodLabel: string
  totalBase: number
  totalBonus: number
  totalDeduction: number
  totalAdvance: number
  totalNetPayable: number
  totalPaid: number
  totalDue: number
  rowCount: number
  items: StaffStatementRow[]
}

function deriveStatus(netPayable: number, amountPaid: number): SalaryStatus {
  if (amountPaid <= 0) return 'Pending'
  if (amountPaid < netPayable) return 'Partial'
  return 'Paid'
}

/** selectedStaffId: 'ALL' or a specific staff id. periodMonth: 'YYYY-MM'. */
export function calculateStaffSalarySummary(
  staff: StaffRecord[],
  payments: StaffSalaryPayment[],
  selectedStaffId: string,
  periodMonth: string
): StaffSalarySummary {
  const staffMap = new Map(staff.map((s) => [s.id, s]))

  const rows: StaffStatementRow[] = payments
    .filter((p) => p.period_month === periodMonth && (selectedStaffId === 'ALL' || p.staff_id === selectedStaffId))
    .map((p): StaffStatementRow | null => {
      const s = staffMap.get(p.staff_id)
      if (!s) return null
      const netPayable = p.base_salary + p.bonus - p.deduction - p.advance
      return {
        paymentId: p.id,
        staffId: s.id,
        fullName: s.full_name,
        designation: s.designation || '',
        phone: s.phone || '',
        baseSalary: p.base_salary,
        bonus: p.bonus,
        deduction: p.deduction,
        advance: p.advance,
        netPayable,
        amountPaid: p.amount_paid,
        due: netPayable - p.amount_paid,
        status: deriveStatus(netPayable, p.amount_paid),
        paymentDate: p.payment_date,
        notes: p.notes || '',
      }
    })
    .filter((r): r is StaffStatementRow => r !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalBase += r.baseSalary
      acc.totalBonus += r.bonus
      acc.totalDeduction += r.deduction
      acc.totalAdvance += r.advance
      acc.totalNetPayable += r.netPayable
      acc.totalPaid += r.amountPaid
      acc.totalDue += r.due
      return acc
    },
    { totalBase: 0, totalBonus: 0, totalDeduction: 0, totalAdvance: 0, totalNetPayable: 0, totalPaid: 0, totalDue: 0 }
  )

  const staffLabel = selectedStaffId === 'ALL' ? 'All Staff' : staffMap.get(selectedStaffId)?.full_name || 'Staff'

  return {
    staffLabel,
    periodLabel: periodMonth,
    ...totals,
    rowCount: rows.length,
    items: rows,
  }
}

export function exportStaffSalaryCSV(summary: StaffSalarySummary) {
  const csvLines: string[] = []

  csvLines.push(`"Total Base Salary",${summary.totalBase.toFixed(2)}`)
  csvLines.push(`"Total Bonus",${summary.totalBonus.toFixed(2)}`)
  csvLines.push(`"Total Deduction",${summary.totalDeduction.toFixed(2)}`)
  csvLines.push(`"Total Advance",${summary.totalAdvance.toFixed(2)}`)
  csvLines.push(`"Total Net Payable",${summary.totalNetPayable.toFixed(2)}`)
  csvLines.push(`"Total Paid",${summary.totalPaid.toFixed(2)}`)
  csvLines.push(`"Total Due",${summary.totalDue.toFixed(2)}`)
  csvLines.push('')

  const headers = [
    'Staff Name', 'Designation', 'Phone', 'Base Salary', 'Bonus', 'Deduction',
    'Advance', 'Net Payable', 'Paid', 'Due', 'Status', 'Payment Date', 'Notes',
  ]
  csvLines.push(headers.join(','))

  summary.items.forEach((r) => {
    csvLines.push(
      [
        csvCell(r.fullName),
        csvCell(r.designation),
        csvCell(r.phone),
        r.baseSalary.toFixed(2),
        r.bonus.toFixed(2),
        r.deduction.toFixed(2),
        r.advance.toFixed(2),
        r.netPayable.toFixed(2),
        r.amountPaid.toFixed(2),
        r.due.toFixed(2),
        csvCell(r.status),
        csvCell(r.paymentDate || ''),
        csvCell(r.notes),
      ].join(',')
    )
  })

  csvLines.push('')
  csvLines.push(
    [
      '"TOTALS"', '""', '""',
      summary.totalBase.toFixed(2),
      summary.totalBonus.toFixed(2),
      summary.totalDeduction.toFixed(2),
      summary.totalAdvance.toFixed(2),
      summary.totalNetPayable.toFixed(2),
      summary.totalPaid.toFixed(2),
      summary.totalDue.toFixed(2),
      '""', '""', '""',
    ].join(',')
  )

  const csvContent = csvLines.join('\n')
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Staff_Salary_${summary.staffLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${summary.periodLabel}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateStaffSalaryPDF(summary: StaffSalarySummary, doctorProfile: DoctorProfileData | null): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const marginX = 30
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawLetterhead(doc, doctorProfile)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('STAFF SALARY STATEMENT', pageWidth / 2, y, { align: 'center' })
  y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Staff: ${summary.staffLabel}`, marginX, y)
  doc.text(`Period: ${summary.periodLabel}`, pageWidth - marginX, y, { align: 'right' })
  y += 14
  doc.text(`Report Date: ${safeFormat(new Date().toISOString(), 'dd MMM yyyy, hh:mm a')}`, marginX, y)
  y += 18

  autoTable(doc, {
    startY: y,
    head: [['Total Base', 'Total Bonus', 'Total Deduction', 'Total Advance', 'Net Payable', 'Total Paid', 'Total Due']],
    body: [[
      formatBDT(summary.totalBase),
      formatBDT(summary.totalBonus),
      formatBDT(summary.totalDeduction),
      formatBDT(summary.totalAdvance),
      formatBDT(summary.totalNetPayable),
      formatBDT(summary.totalPaid),
      formatBDT(summary.totalDue),
    ]],
    styles: { fontSize: 8, cellPadding: 6, halign: 'center', fontStyle: 'bold' },
    headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255] },
    theme: 'grid',
    margin: { left: marginX, right: marginX },
  })

  y = (doc as any).lastAutoTable.finalY + 16

  const tableRows = summary.items.map((r) => [
    r.fullName,
    r.designation || '-',
    formatBDT(r.baseSalary),
    formatBDT(r.bonus),
    formatBDT(r.deduction),
    formatBDT(r.advance),
    formatBDT(r.netPayable),
    formatBDT(r.amountPaid),
    formatBDT(r.due),
    r.status,
  ])

  tableRows.push([
    'TOTALS', '',
    formatBDT(summary.totalBase),
    formatBDT(summary.totalBonus),
    formatBDT(summary.totalDeduction),
    formatBDT(summary.totalAdvance),
    formatBDT(summary.totalNetPayable),
    formatBDT(summary.totalPaid),
    formatBDT(summary.totalDue),
    '',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Staff Name', 'Designation', 'Base Salary', 'Bonus', 'Deduction', 'Advance', 'Net Payable', 'Paid', 'Due', 'Status']],
    body: tableRows,
    styles: { fontSize: 7.5, cellPadding: 3.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 90 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold' },
      9: { halign: 'center' },
    },
    theme: 'striped',
    margin: { left: marginX, right: marginX },
  })

  y = (doc as any).lastAutoTable.finalY + 30

  const pageHeight = doc.internal.pageSize.getHeight()
  if (y > pageHeight - 70) {
    doc.addPage()
    y = 60
  }

  const sigWidth = 140
  doc.setLineWidth(0.75)
  doc.setDrawColor(180, 180, 180)

  doc.line(marginX, y, marginX + sigWidth, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Staff Signature & Date', marginX + 15, y + 12)

  doc.line(pageWidth - marginX - sigWidth, y, pageWidth - marginX, y)
  doc.text('Authorized Clinic Signature', pageWidth - marginX - sigWidth + 15, y + 12)

  drawFooter(doc, y + 35)

  return doc
}
