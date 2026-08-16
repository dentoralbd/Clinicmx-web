import { supabase } from '@/lib/supabase'
import { csvCell } from '@/lib/utils'
import { logActivity } from '@/lib/activityLog'

// One-off categories plus the recurring-template categories (Rent/Utilities/
// Subscription — see recurringExpenses.ts) that a generated row can carry.
// clinic_expenses' CHECK constraint (migration 062) accepts this full union.
export const CLINIC_EXPENSE_CATEGORIES = [
  'Instrument Purchase',
  'Material Purchase',
  'Machine Repair',
  'Rent',
  'Utilities',
  'Subscription',
  'Other',
] as const
export type ClinicExpenseCategory = (typeof CLINIC_EXPENSE_CATEGORIES)[number]

export interface ClinicExpenseRecord {
  id: string
  category: ClinicExpenseCategory
  description: string
  amount: number
  expense_date: string
  vendor: string | null
  notes: string | null
  created_by: string | null
  recurring_expense_id: string | null
  created_at: string
  updated_at: string
}

const EXPENSE_COLUMNS =
  'id, category, description, amount, expense_date, vendor, notes, created_by, recurring_expense_id, created_at, updated_at'

export async function listExpenses(): Promise<ClinicExpenseRecord[]> {
  const { data, error } = await supabase
    .from('clinic_expenses')
    .select(EXPENSE_COLUMNS)
    .order('expense_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ClinicExpenseRecord[]
}

export interface ClinicExpenseInput {
  category: ClinicExpenseCategory
  description: string
  amount: number
  expense_date: string
  vendor?: string | null
  notes?: string | null
}

function expensePayload(input: ClinicExpenseInput) {
  return {
    category: input.category,
    description: input.description.trim(),
    amount: input.amount,
    expense_date: input.expense_date,
    vendor: input.vendor?.trim() || null,
    notes: input.notes?.trim() || null,
  }
}

export async function createExpense(input: ClinicExpenseInput, createdBy?: string | null): Promise<ClinicExpenseRecord> {
  const { data, error } = await supabase
    .from('clinic_expenses')
    .insert({ ...expensePayload(input), created_by: createdBy ?? null })
    .select(EXPENSE_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  const row = data as ClinicExpenseRecord
  logActivity({ action: 'create', entityType: 'clinic_expense', entityId: row.id, entityLabel: row.description, details: `${row.category} · ${row.amount}` })
  return row
}

export async function updateExpense(id: string, input: ClinicExpenseInput): Promise<ClinicExpenseRecord> {
  const { data, error } = await supabase
    .from('clinic_expenses')
    .update(expensePayload(input))
    .eq('id', id)
    .select(EXPENSE_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  const row = data as ClinicExpenseRecord
  logActivity({ action: 'edit', entityType: 'clinic_expense', entityId: id, entityLabel: row.description, details: 'Expense updated' })
  return row
}

export async function deleteExpense(id: string, description?: string): Promise<void> {
  const { error } = await supabase.from('clinic_expenses').delete().eq('id', id)
  if (error) throw new Error(error.message)
  logActivity({ action: 'delete', entityType: 'clinic_expense', entityId: id, entityLabel: description ?? null, details: 'Expense deleted' })
}

// ---------------------------------------------------------------------------
// Period totals + Clinic Expenses tab summary
// ---------------------------------------------------------------------------

/** 'YYYY-MM' bucketing on expense_date, same convention as calculateStaffSalarySummary/calculateDoctorFinancialSummary. */
export function otherExpensesForPeriod(expenses: ClinicExpenseRecord[], periodMonth: string): ClinicExpenseRecord[] {
  return expenses.filter((e) => e.expense_date.substring(0, 7) === periodMonth)
}

export function sumByCategory(expenses: ClinicExpenseRecord[]): Record<ClinicExpenseCategory, number> {
  const totals = Object.fromEntries(CLINIC_EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ClinicExpenseCategory, number>
  expenses.forEach((e) => {
    totals[e.category] = (totals[e.category] || 0) + Number(e.amount || 0)
  })
  return totals
}

/**
 * Raw cash collected in the period -- sum of payments.amount, NOT
 * DoctorFinancialSummary.totalPaid (which silently drops payments that
 * can't be attributed to exactly one doctor -- see doctorAnalytics.ts's
 * flaggedRows). Mirrors the payment_date-falling-back-to-created_at
 * bucketing calculateDoctorFinancialSummary already uses.
 */
export function calculateTotalCollected(payments: any[], periodMonth: string): number {
  let total = 0
  payments.forEach((p) => {
    const dateStr = p.payment_date
      ? String(p.payment_date).substring(0, 10)
      : p.created_at
      ? String(p.created_at).substring(0, 10)
      : ''
    if (!dateStr || dateStr.substring(0, 7) !== periodMonth) return
    total += Number(p.amount || 0)
  })
  return total
}

/**
 * Lab charges actually paid to the vendor in the period. lab_work has no
 * "date paid" column (is_paid is a bare boolean -- see 030_lab_work.sql),
 * so this buckets by date_sent (when the cost commitment to the lab was
 * made), falling back to created_at if blank.
 */
export function calculateLabChargesPaid(labWorks: any[], periodMonth: string): number {
  let total = 0
  labWorks.forEach((lw) => {
    if (!lw.is_paid || lw.status === 'Cancelled') return
    const dateStr = lw.date_sent || lw.created_at
    if (!dateStr || String(dateStr).substring(0, 7) !== periodMonth) return
    total += lw.pricing_mode === 'flat' ? Number(lw.flat_price) || 0 : (Number(lw.unit_price) || 0) * (Number(lw.unit_count) || 0)
  })
  return total
}

export interface ClinicExpensesSummary {
  periodLabel: string
  doctorPayouts: number
  staffSalary: number
  labCharges: number
  otherExpensesTotal: number
  otherByCategory: Record<ClinicExpenseCategory, number>
  totalExpenses: number
  totalCollected: number
  profitLoss: number
}

export function exportClinicExpensesCSV(summary: ClinicExpensesSummary, otherExpenseRows: ClinicExpenseRecord[]) {
  const lines: string[] = []
  lines.push(`"Period",${csvCell(summary.periodLabel)}`)
  lines.push(`"Doctor Payouts",${summary.doctorPayouts.toFixed(2)}`)
  lines.push(`"Staff Salary",${summary.staffSalary.toFixed(2)}`)
  lines.push(`"Lab Charges",${summary.labCharges.toFixed(2)}`)
  lines.push(`"Other Expenses",${summary.otherExpensesTotal.toFixed(2)}`)
  lines.push(`"Total Expenses",${summary.totalExpenses.toFixed(2)}`)
  lines.push(`"Total Collected",${summary.totalCollected.toFixed(2)}`)
  lines.push(`"Profit / Loss",${summary.profitLoss.toFixed(2)}`)
  lines.push('')

  lines.push(['Category', 'Description', 'Vendor', 'Amount', 'Date', 'Notes'].join(','))
  otherExpenseRows.forEach((e) => {
    lines.push(
      [csvCell(e.category), csvCell(e.description), csvCell(e.vendor || ''), e.amount.toFixed(2), csvCell(e.expense_date), csvCell(e.notes || '')].join(',')
    )
  })

  const csvContent = lines.join('\n')
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Clinic_Expenses_${summary.periodLabel}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
