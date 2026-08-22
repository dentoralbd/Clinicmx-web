import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Receipt,
  Landmark,
  Wallet,
  FlaskConical,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  FileSpreadsheet,
  AlertCircle,
  Calendar,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { calculateDoctorFinancialSummary } from '@/lib/doctorAnalytics'
import { listStaff, listSalaryPayments, calculateStaffSalarySummary, type StaffRecord, type StaffSalaryPayment } from '@/lib/staff'
import {
  CLINIC_EXPENSE_CATEGORIES,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  otherExpensesForPeriod,
  sumByCategory,
  calculateTotalCollected,
  calculateLabChargesPaid,
  exportClinicExpensesCSV,
  type ClinicExpenseRecord,
  type ClinicExpenseCategory,
  type ClinicExpensesSummary,
} from '@/lib/clinicExpenses'
import { ChartCard, ChartEmptyState, CHART_COLORS, formatBDTCompact, TOOLTIP_ITEM_STYLE } from '@/components/analytics/ChartCard'

const PAGE_SIZE = 1000

async function fetchAllRowsSafe<T>(table: string, filter?: (q: any) => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1)
    if (filter) query = filter(query)
    const { data, error } = await query
    if (error) {
      console.warn(`Error fetching ${table}:`, error)
      break
    }
    const page = (data as T[]) || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

function currentMonthKey() {
  return new Date().toISOString().substring(0, 7)
}

function emptyExpenseForm() {
  return {
    category: 'Instrument Purchase' as ClinicExpenseCategory,
    description: '',
    amount: '',
    expense_date: new Date().toISOString().substring(0, 10),
    vendor: '',
    notes: '',
  }
}

export function ClinicExpensesSection() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [treatments, setTreatments] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [labWorks, setLabWorks] = useState<any[]>([])
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [staffPayments, setStaffPayments] = useState<StaffSalaryPayment[]>([])
  const [expenses, setExpenses] = useState<ClinicExpenseRecord[]>([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [categoryFilter, setCategoryFilter] = useState<ClinicExpenseCategory | 'ALL'>('ALL')

  const [expenseModal, setExpenseModal] = useState<'create' | 'edit' | null>(null)
  const [editingExpense, setEditingExpense] = useState<ClinicExpenseRecord | null>(null)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm())
  const [expenseFormError, setExpenseFormError] = useState('')
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClinicExpenseRecord | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      setLoadError(null)
      const [invoiceRows, treatmentRows, patientRows, paymentRows, labWorkRows, staffRows, staffPaymentRows, expenseRows] = await Promise.all([
        fetchAllRowsSafe<any>('invoices', (q) => q.neq('status', 'Merged')),
        fetchAllRowsSafe<any>('treatments'),
        fetchAllRowsSafe<any>('patients'),
        fetchAllRowsSafe<any>('payments'),
        fetchAllRowsSafe<any>('lab_work'),
        listStaff(),
        listSalaryPayments(),
        listExpenses(),
      ])
      setInvoices(invoiceRows)
      setTreatments(treatmentRows)
      setPatients(patientRows)
      setPayments(paymentRows)
      setLabWorks(labWorkRows)
      setStaff(staffRows)
      setStaffPayments(staffPaymentRows)
      setExpenses(expenseRows)
    } catch (err) {
      console.error('Error loading clinic expenses:', err)
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not load clinic expense data. If the clinic_expenses table does not exist yet, apply migration 059 in Supabase first.'
      )
    } finally {
      setLoading(false)
    }
  }

  const uniqueMonths = useMemo(() => {
    const set = new Set<string>()
    payments.forEach((p) => {
      const d = p.payment_date || p.created_at
      if (d) set.add(String(d).substring(0, 7))
    })
    expenses.forEach((e) => set.add(e.expense_date.substring(0, 7)))
    set.add(currentMonthKey())
    return Array.from(set).sort().reverse()
  }, [payments, expenses])

  const otherThisMonth = useMemo(() => otherExpensesForPeriod(expenses, selectedMonth), [expenses, selectedMonth])
  const otherByCategory = useMemo(() => sumByCategory(otherThisMonth), [otherThisMonth])

  const summary: ClinicExpensesSummary = useMemo(() => {
    const doctorSummary = calculateDoctorFinancialSummary(treatments, invoices, patients, labWorks, payments, 'ALL', selectedMonth)
    const staffSummary = calculateStaffSalarySummary(staff, staffPayments, 'ALL', selectedMonth)
    const otherExpensesTotal = Object.values(otherByCategory).reduce((a, b) => a + b, 0)
    const labCharges = calculateLabChargesPaid(labWorks, selectedMonth)
    const totalCollected = calculateTotalCollected(payments, selectedMonth)
    const totalExpenses = doctorSummary.totalDrIncome + staffSummary.totalPaid + labCharges + otherExpensesTotal
    return {
      periodLabel: selectedMonth,
      doctorPayouts: doctorSummary.totalDrIncome,
      staffSalary: staffSummary.totalPaid,
      labCharges,
      otherExpensesTotal,
      otherByCategory,
      totalExpenses,
      totalCollected,
      profitLoss: totalCollected - totalExpenses,
    }
  }, [treatments, invoices, patients, labWorks, payments, staff, staffPayments, otherByCategory, selectedMonth])

  const breakdownData = useMemo(
    () => [
      { label: 'Doctor Payouts', value: summary.doctorPayouts },
      { label: 'Staff Salary', value: summary.staffSalary },
      { label: 'Lab Charges', value: summary.labCharges },
      { label: 'Other Expenses', value: summary.otherExpensesTotal },
    ],
    [summary]
  )

  const filteredOtherExpenses = useMemo(
    () => (categoryFilter === 'ALL' ? otherThisMonth : otherThisMonth.filter((e) => e.category === categoryFilter)),
    [otherThisMonth, categoryFilter]
  )

  function openCreateModal() {
    setEditingExpense(null)
    setExpenseForm(emptyExpenseForm())
    setExpenseFormError('')
    setExpenseModal('create')
  }

  function openEditModal(expense: ClinicExpenseRecord) {
    setEditingExpense(expense)
    setExpenseForm({
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      expense_date: expense.expense_date,
      vendor: expense.vendor || '',
      notes: expense.notes || '',
    })
    setExpenseFormError('')
    setExpenseModal('edit')
  }

  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(expenseForm.amount)
    if (!expenseForm.description.trim()) {
      setExpenseFormError('Description is required.')
      return
    }
    if (!amount || amount <= 0) {
      setExpenseFormError('Amount must be greater than 0.')
      return
    }
    setExpenseSaving(true)
    setExpenseFormError('')
    try {
      const input = {
        category: expenseForm.category,
        description: expenseForm.description,
        amount,
        expense_date: expenseForm.expense_date,
        vendor: expenseForm.vendor || null,
        notes: expenseForm.notes || null,
      }
      if (expenseModal === 'edit' && editingExpense) {
        await updateExpense(editingExpense.id, input)
      } else {
        await createExpense(input)
      }
      setExpenses(await listExpenses())
      setExpenseModal(null)
    } catch (err) {
      setExpenseFormError(err instanceof Error ? err.message : 'Failed to save expense.')
    } finally {
      setExpenseSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await deleteExpense(deleteTarget.id, deleteTarget.description)
      setExpenses(await listExpenses())
      setDeleteTarget(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete expense.')
    }
  }

  function handleDownloadCSV() {
    void exportClinicExpensesCSV(summary, otherThisMonth)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[40vh]">
        <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isProfit = summary.profitLoss >= 0

  return (
    <div className="space-y-6 page-fade-in">
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="font-medium">{loadError}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-teal-600" /> Month:
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-300 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 min-w-[140px]"
          >
            {uniqueMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={handleDownloadCSV} className="text-xs">
          <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" /> Export Excel CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiTile icon={<UserCheck className="w-4 h-4 text-teal-600" />} label="Doctor Payouts" value={formatBDT(summary.doctorPayouts)} accent="bg-teal-50" />
        <KpiTile icon={<Wallet className="w-4 h-4 text-blue-500" />} label="Staff Salary" value={formatBDT(summary.staffSalary)} accent="bg-blue-50" />
        <KpiTile icon={<FlaskConical className="w-4 h-4 text-violet-500" />} label="Lab Charges" value={formatBDT(summary.labCharges)} accent="bg-violet-50" />
        <KpiTile icon={<Receipt className="w-4 h-4 text-amber-500" />} label="Other Expenses" value={formatBDT(summary.otherExpensesTotal)} accent="bg-amber-50" />
        <KpiTile icon={<Landmark className="w-4 h-4 text-slate-500" />} label="Total Expenses" value={formatBDT(summary.totalExpenses)} accent="bg-slate-100" />
        <div className={`rounded-xl p-5 shadow-lg text-white bg-gradient-to-br ${isProfit ? 'from-emerald-700 to-emerald-900' : 'from-red-700 to-red-900'}`}>
          <div className="flex items-center gap-2 text-white/80 mb-2">
            {isProfit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="text-xs font-semibold uppercase tracking-wider">Profit / Loss ({selectedMonth})</span>
          </div>
          <p className="text-2xl font-display font-bold font-mono">{formatBDT(summary.profitLoss)}</p>
          <p className="text-xs text-white/70 mt-1">Collected {formatBDT(summary.totalCollected)}</p>
        </div>
      </div>

      <ChartCard icon={<Landmark className="w-4 h-4" />} title="Expense Breakdown" caption={`Doctor payouts, staff salary, lab charges and other expenses for ${selectedMonth}.`}>
        {summary.totalExpenses === 0 ? (
          <ChartEmptyState message={`No expenses recorded for ${selectedMonth} yet`} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={breakdownData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={formatBDTCompact} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
              <Tooltip formatter={(v: unknown) => formatBDT(Number(v))} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
              <Bar dataKey="value" name="Amount" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-teal-600" /> Other Expenses
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Instrument/material purchases, machine repairs, and any other special expense.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  categoryFilter === 'ALL' ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-gray-200 text-slate-600 hover:border-teal-300'
                }`}
              >
                All
              </button>
              {CLINIC_EXPENSE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    categoryFilter === c ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-gray-200 text-slate-600 hover:border-teal-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={openCreateModal} className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
              <Plus className="w-4 h-4 mr-1.5" /> Add Expense
            </Button>
          </div>
        </div>

        {filteredOtherExpenses.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No other expenses recorded for {selectedMonth}{categoryFilter !== 'ALL' ? ` in "${categoryFilter}"` : ''}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOtherExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800">{expense.description}</td>
                    <td className="px-5 py-3 text-slate-500">{expense.vendor || '-'}</td>
                    <td className="px-5 py-3 text-slate-500">{new Date(expense.expense_date).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{formatBDT(expense.amount)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(expense)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors" title="Edit">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(expense)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {expenseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{expenseModal === 'edit' ? 'Edit Expense' : 'Add Expense'}</h2>
              <button type="button" onClick={() => setExpenseModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="p-5 space-y-3">
              {expenseFormError && <p className="text-xs text-red-600 font-medium">{expenseFormError}</p>}
              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as ClinicExpenseCategory })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  {CLINIC_EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. Autoclave repair"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Amount (BDT) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Vendor / Payee</label>
                <input
                  type="text"
                  value={expenseForm.vendor}
                  onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setExpenseModal(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={expenseSaving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {expenseSaving ? 'Saving…' : 'Save Expense'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h2 className="font-display text-lg font-bold mb-2">Delete Expense?</h2>
            <p className="text-sm text-slate-600 mb-4">
              This will permanently delete "{deleteTarget.description}" ({formatBDT(deleteTarget.amount)}).
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700 text-white">
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${accent} mb-2`}>{icon}</div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-display font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  )
}
