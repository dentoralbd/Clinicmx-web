import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activityLog'

export const RECURRING_EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Subscription', 'Other'] as const
export type RecurringExpenseCategory = (typeof RECURRING_EXPENSE_CATEGORIES)[number]

export interface RecurringExpenseRecord {
  id: string
  category: RecurringExpenseCategory
  description: string
  amount: number
  vendor: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const RECURRING_COLUMNS = 'id, category, description, amount, vendor, notes, is_active, created_at, updated_at'

export async function listRecurringExpenses(): Promise<RecurringExpenseRecord[]> {
  const { data, error } = await supabase
    .from('recurring_expenses')
    .select(RECURRING_COLUMNS)
    .order('description', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as RecurringExpenseRecord[]
}

export interface RecurringExpenseInput {
  category: RecurringExpenseCategory
  description: string
  amount: number
  vendor?: string | null
  notes?: string | null
}

function recurringPayload(input: RecurringExpenseInput) {
  return {
    category: input.category,
    description: input.description.trim(),
    amount: input.amount,
    vendor: input.vendor?.trim() || null,
    notes: input.notes?.trim() || null,
  }
}

export async function createRecurringExpense(input: RecurringExpenseInput): Promise<RecurringExpenseRecord> {
  const { data, error } = await supabase
    .from('recurring_expenses')
    .insert(recurringPayload(input))
    .select(RECURRING_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  const row = data as RecurringExpenseRecord
  logActivity({ action: 'create', entityType: 'recurring_expense', entityId: row.id, entityLabel: row.description, details: `${row.category} · ${row.amount}/mo` })
  return row
}

export async function updateRecurringExpense(id: string, input: RecurringExpenseInput): Promise<RecurringExpenseRecord> {
  const { data, error } = await supabase
    .from('recurring_expenses')
    .update(recurringPayload(input))
    .eq('id', id)
    .select(RECURRING_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  const row = data as RecurringExpenseRecord
  logActivity({ action: 'edit', entityType: 'recurring_expense', entityId: id, entityLabel: row.description, details: 'Recurring expense updated' })
  return row
}

export async function setRecurringExpenseActive(id: string, isActive: boolean, description?: string): Promise<void> {
  const { error } = await supabase.from('recurring_expenses').update({ is_active: isActive }).eq('id', id)
  if (error) throw new Error(error.message)
  logActivity({
    action: 'edit',
    entityType: 'recurring_expense',
    entityId: id,
    entityLabel: description ?? null,
    details: isActive ? 'Marked active' : 'Marked inactive',
  })
}

export async function deleteRecurringExpense(id: string, description?: string): Promise<void> {
  const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
  if (error) throw new Error(error.message)
  logActivity({ action: 'delete', entityType: 'recurring_expense', entityId: id, entityLabel: description ?? null, details: 'Recurring expense deleted' })
}

export interface GenerateRecurringExpenseItem {
  recurring_expense_id: string
  category: RecurringExpenseCategory
  description: string
  /** This month's actual amount — lets a variable bill (electricity, water)
   * be entered at generation time instead of always using the template's
   * default/estimated amount. */
  amount: number
  vendor: string | null
  notes: string | null
}

/**
 * Creates one clinic_expenses row (dated the 1st of periodMonth) per item,
 * for admin review/editing like any other expense afterward. Idempotent:
 * UNIQUE (recurring_expense_id, expense_date) on clinic_expenses (migration
 * 062) + ignoreDuplicates means re-running for a month that's already
 * generated is a safe no-op, mirroring staff.ts's ensureMonthRows.
 */
export async function generateRecurringExpensesForMonth(periodMonth: string, items: GenerateRecurringExpenseItem[]): Promise<void> {
  if (items.length === 0) return
  const expenseDate = `${periodMonth}-01`
  const rows = items.map((it) => ({
    category: it.category,
    description: it.description,
    amount: it.amount,
    expense_date: expenseDate,
    vendor: it.vendor,
    notes: it.notes,
    recurring_expense_id: it.recurring_expense_id,
  }))
  const { error } = await supabase
    .from('clinic_expenses')
    .upsert(rows, { onConflict: 'recurring_expense_id,expense_date', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  logActivity({ action: 'create', entityType: 'clinic_expense', entityLabel: null, details: `Generated ${items.length} recurring expense(s) for ${periodMonth}` })
}
