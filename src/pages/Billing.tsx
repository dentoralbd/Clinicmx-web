import { useMemo, useState, useEffect } from 'react'
import {
  buildInvoiceItemPreview,
  extractTreatmentIdsFromInvoiceItems,
  formatInvoiceItemLabel,
  getInvoiceItemLineTotal,
  getInvoiceItemSubtotal,
  type BillingLineItem,
} from '@/lib/billing'
import {
  Plus,
  DollarSign,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Mail,
  MoreVertical,
  Printer,
  Settings,
  BarChart3,
  Search,
  X,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InvoiceModal } from '@/components/InvoiceModal'
import { InvoiceTemplateSelector } from '@/components/InvoiceTemplateSelector'
import type { InvoiceTemplateData } from '@/components/InvoiceTemplateSelector'
import { PaymentHistoryPanel } from '@/components/PaymentHistoryPanel'
import { PaymentEntryModal } from '@/components/PaymentEntryModal'
import { FinancialReportsPanel } from '@/components/FinancialReportsPanel'
import { InvoiceSettingsModal } from '@/components/InvoiceSettingsModal'
import { supabase } from '@/lib/supabase'
import { safeFormat, formatBDT } from '@/lib/utils'

interface Invoice {
  id: string
  patient_id: string
  items: BillingLineItem[] | null
  total_amount: number
  paid_amount: number
  discount_amount?: number | null
  tax_amount?: number | null
  tax_rate?: number | null
  notes?: string | null
  payment_terms?: string | null
  invoice_number?: string | null
  invoice_type?: string | null
  recurring_enabled?: boolean | null
  recurring_frequency: string | null
  status: string
  due_date: string | null
  created_at: string
  patients: {
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    patient_code: string | null
  } | null
}

export function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showBasicModal, setShowBasicModal] = useState(false)
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [showReports, setShowReports] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showPendingPatients, setShowPendingPatients] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<InvoiceTemplateData | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [pendingPatients, setPendingPatients] = useState<Array<{ patient_id: string; name: string; count: number }>>([])
  const [preselectedPatientId, setPreselectedPatientId] = useState('')
  const [patientFilter, setPatientFilter] = useState<{ id: string; name: string } | null>(null)
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false)

  useEffect(() => {
    loadInvoices()
    loadPendingPatients()
  }, [])

  useEffect(() => {
    if (!showMoreMenu) return
    const handler = () => setShowMoreMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showMoreMenu])

  useEffect(() => {
    if (!showPendingPatients) return
    const handler = () => setShowPendingPatients(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showPendingPatients])

  useEffect(() => {
    if (!showPatientSuggestions) return
    const handler = () => setShowPatientSuggestions(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showPatientSuggestions])

  async function loadInvoices() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('invoices')
        .select('*, patients (first_name, last_name, email, phone, patient_code)')
        .order('created_at', { ascending: false })

      if (error) throw error
      setInvoices((data as Invoice[]) || [])
    } catch (error) {
      console.error('Error loading invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadPendingPatients() {
    interface PendingTreatmentRow {
      id: string
      patient_id: string | null
      invoice_id?: string | null
      patients: { first_name: string; last_name: string } | null
    }

    function groupByPatient(rows: PendingTreatmentRow[]) {
      const map = new Map<string, { name: string; count: number }>()
      for (const row of rows) {
        if (!row.patient_id) continue
        const name = row.patients
          ? `${row.patients.first_name} ${row.patients.last_name}`.trim()
          : 'Unknown patient'
        const existing = map.get(row.patient_id)
        if (existing) {
          existing.count += 1
        } else {
          map.set(row.patient_id, { name, count: 1 })
        }
      }
      return Array.from(map.entries()).map(([patient_id, { name, count }]) => ({ patient_id, name, count }))
    }

    try {
      const { data, error } = await supabase
        .from('treatments')
        .select('id, patient_id, invoice_id, patients (first_name, last_name)')
        .eq('is_invoiced', false)

      if (error) throw error

      setPendingPatients(groupByPatient(((data || []) as PendingTreatmentRow[]).filter((row) => !row.invoice_id)))
    } catch {
      // treatments.is_invoiced / invoice_id are added by a later migration —
      // fall back to cross-referencing treatment ids stored in invoice items
      try {
        const [{ data: treatmentsData, error: treatmentsError }, { data: invoicesData, error: invoicesError }] = await Promise.all([
          supabase.from('treatments').select('id, patient_id, patients (first_name, last_name)'),
          supabase.from('invoices').select('items'),
        ])

        if (treatmentsError) throw treatmentsError
        if (invoicesError) throw invoicesError

        const linkedTreatmentIds = extractTreatmentIdsFromInvoiceItems(
          (invoicesData || []).flatMap((invoice: { items?: unknown }) => (Array.isArray(invoice.items) ? invoice.items : []))
        )

        setPendingPatients(
          groupByPatient(((treatmentsData || []) as PendingTreatmentRow[]).filter((row) => !linkedTreatmentIds.has(row.id)))
        )
      } catch {
        setPendingPatients([])
      }
    }
  }

  async function markAsPaid(id: string, totalAmount: number) {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'Paid',
          paid_amount: totalAmount,
        })
        .eq('id', id)

      if (error) throw error
      await supabase.from('invoice_history').insert({
        invoice_id: id,
        event_type: 'status_updated',
        event_data: { status: 'Paid' },
      }).then(() => {}, () => {})
      loadInvoices()
    } catch (error) {
      console.error('Error updating invoice:', error)
      alert('Failed to update invoice')
    }
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice?')) return

    try {
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) throw error
      setInvoices((prev) => prev.filter((invoice) => invoice.id !== id))
      setSelectedInvoices((prev) => prev.filter((invoiceId) => invoiceId !== id))
    } catch (error) {
      console.error('Error deleting invoice:', error)
      alert('Failed to delete invoice')
    }
  }

  async function bulkUpdateStatus(status: 'Pending' | 'Paid') {
    if (selectedInvoices.length === 0) return

    try {
      const ids = [...selectedInvoices]
      const updates = status === 'Paid'
        ? filteredInvoices
            .filter((invoice) => ids.includes(invoice.id))
            .map((invoice) => ({ id: invoice.id, paid_amount: invoice.total_amount, status }))
        : ids.map((id) => ({ id, status }))

      for (const update of updates) {
        const { id, ...payload } = update
        const { error } = await supabase
          .from('invoices')
          .update(payload)
          .eq('id', id)

        if (error) throw error
      }

      setSelectedInvoices([])
      loadInvoices()
    } catch (error) {
      console.error('Error updating invoices:', error)
      alert('Failed to update selected invoices')
    }
  }

  function exportInvoices() {
    const rows = filteredInvoices.map((invoice) => ({
      invoice_number: invoice.invoice_number || '',
      patient: `${invoice.patients?.first_name || ''} ${invoice.patients?.last_name || ''}`.trim(),
      type: invoice.invoice_type,
      status: invoice.status,
      total: invoice.total_amount,
      paid: invoice.paid_amount,
      due_date: invoice.due_date || '',
    }))

    const csv = [
      Object.keys(rows[0] || { invoice_number: '', patient: '', type: '', status: '', total: '', paid: '', due_date: '' }).join(','),
      ...rows.map((row) => Object.values(row).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `invoices-${new Date().toISOString().slice(0, 10)}.csv`)
    link.click()
    URL.revokeObjectURL(url)
  }

  const billedPatients = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; phone: string | null; patient_code: string | null }>()
    for (const invoice of invoices) {
      if (!invoice.patients || seen.has(invoice.patient_id)) continue
      seen.set(invoice.patient_id, {
        id: invoice.patient_id,
        name: `${invoice.patients.first_name} ${invoice.patients.last_name}`.trim(),
        phone: invoice.patients.phone,
        patient_code: invoice.patients.patient_code,
      })
    }
    return Array.from(seen.values())
  }, [invoices])

  const recentPatients = useMemo(() => billedPatients.slice(0, 8), [billedPatients])

  const patientSuggestions = useMemo(() => {
    const query = patientSearch.trim()
    if (!query) return []
    const queryLower = query.toLowerCase()
    return billedPatients
      .filter(
        (patient) =>
          patient.name.toLowerCase().includes(queryLower) ||
          (patient.patient_code ?? '').toLowerCase().includes(queryLower) ||
          (patient.phone ?? '').includes(query)
      )
      .slice(0, 8)
  }, [billedPatients, patientSearch])

  const filteredInvoices = useMemo(() => {
    let result = invoices
    if (patientFilter) result = result.filter((invoice) => invoice.patient_id === patientFilter.id)
    if (filter !== 'all') result = result.filter((invoice) => invoice.status === filter)
    return result
  }, [filter, invoices, patientFilter])

  const stats = {
    total: invoices.reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0),
    paid: invoices.filter((invoice) => invoice.status === 'Paid').reduce((sum, invoice) => sum + (invoice.paid_amount || 0), 0),
    pending: invoices
      .filter((invoice) => (invoice.total_amount || 0) > (invoice.paid_amount || 0))
      .reduce((sum, invoice) => sum + ((invoice.total_amount || 0) - (invoice.paid_amount || 0)), 0),
  }

  const allVisibleSelected = filteredInvoices.length > 0 && filteredInvoices.every((invoice) => selectedInvoices.includes(invoice.id))

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-text-secondary mt-1">Invoices, payments, templates, and reports</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setShowBasicModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
          <Button variant="outline" onClick={() => setShowTemplateSelector(true)}>From Template</Button>
          {pendingPatients.length > 0 && (
            <div className="relative">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPendingPatients((v) => !v)
                }}
                className="border-amber-300 text-amber-900 hover:bg-amber-50"
              >
                <Clock className="w-4 h-4 mr-1" />
                Unbilled Treatments ({pendingPatients.length})
              </Button>
              {showPendingPatients && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-amber-200 rounded-lg shadow-lg z-20 min-w-64 p-3">
                  <div className="flex flex-wrap gap-2">
                    {pendingPatients.map(({ patient_id, name, count }) => (
                      <button
                        key={patient_id}
                        type="button"
                        onClick={() => {
                          setPreselectedPatientId(patient_id)
                          setShowBasicModal(true)
                          setShowPendingPatients(false)
                        }}
                        className="px-2.5 py-1 bg-amber-50 border border-amber-300 rounded-full text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                      >
                        {name} ({count})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <Button variant="outline" onClick={() => setShowReports((prev) => !prev)}>
            <BarChart3 className="w-4 h-4 mr-1" />
            Reports
          </Button>
          <Button variant="outline" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4 mr-1" />
            Settings
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setShowMoreMenu((v) => !v)
              }}
              aria-label="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-36">
                <button
                  className="w-full flex items-center text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    exportInvoices()
                    setShowMoreMenu(false)
                  }}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export CSV
                </button>
                <button
                  className="w-full flex items-center text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    window.print()
                    setShowMoreMenu(false)
                  }}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showReports && <FinancialReportsPanel />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard title="Total Billed" value={formatBDT(stats.total)} icon={<DollarSign className="w-6 h-6" />} color="blue" />
        <SummaryCard title="Paid" value={formatBDT(stats.paid)} icon={<CheckCircle className="w-6 h-6" />} color="green" />
        <SummaryCard title="Pending" value={formatBDT(stats.pending)} icon={<Clock className="w-6 h-6" />} color="orange" />
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={patientSearch}
                placeholder="Search patient by name, phone, or ID..."
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-72 max-w-full focus:outline-none focus:ring-2 focus:ring-primary/30"
                onChange={(e) => {
                  setPatientSearch(e.target.value)
                  setShowPatientSuggestions(true)
                }}
                onFocus={() => setShowPatientSuggestions(true)}
              />
              {showPatientSuggestions && patientSearch.trim() !== '' && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-72 max-h-64 overflow-y-auto">
                  {patientSuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-text-secondary">No matching patients</div>
                  ) : (
                    patientSuggestions.map((patient) => (
                      <button
                        key={patient.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        onClick={() => {
                          setPatientFilter({ id: patient.id, name: patient.name })
                          setPatientSearch('')
                          setShowPatientSuggestions(false)
                        }}
                      >
                        <div className="text-sm font-medium text-text-primary">{patient.name}</div>
                        <div className="text-xs text-text-secondary">
                          {[patient.patient_code, patient.phone].filter(Boolean).join(' • ') || 'No code / phone'}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {patientFilter && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                {patientFilter.name}
                <button onClick={() => setPatientFilter(null)} aria-label="Clear patient filter" className="hover:opacity-70">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
          {recentPatients.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                <History className="w-3.5 h-3.5" /> Recent:
              </span>
              {recentPatients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => setPatientFilter({ id: patient.id, name: patient.name })}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    patientFilter?.id === patient.id
                      ? 'bg-primary text-white border-primary'
                      : 'bg-gray-100 text-text-primary border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {patient.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex gap-2">
            {['all', 'Pending', 'Partial', 'Paid'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === status ? 'bg-primary text-white' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                }`}
              >
                {status === 'all' ? 'All' : status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) => {
                  setSelectedInvoices(e.target.checked ? filteredInvoices.map((invoice) => invoice.id) : [])
                }}
              />
              Select all
            </label>
            <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus('Pending')} disabled={selectedInvoices.length === 0}>Mark Pending</Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus('Paid')} disabled={selectedInvoices.length === 0}>Mark Paid</Button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <span className="spinner" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            {patientFilter
              ? `No ${filter === 'all' ? '' : `${filter.toLowerCase()} `}invoices for ${patientFilter.name}.`
              : filter === 'all' ? 'No invoices yet. Click "New Invoice" to get started.' : `No ${filter.toLowerCase()} invoices.`}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredInvoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                checked={selectedInvoices.includes(invoice.id)}
                onSelect={(checked) => {
                  setSelectedInvoices((prev) => {
                    if (checked) return [...new Set([...prev, invoice.id])]
                    return prev.filter((id) => id !== invoice.id)
                  })
                }}
                onMarkPaid={() => markAsPaid(invoice.id, invoice.total_amount)}
                onDelete={() => deleteInvoice(invoice.id)}
                onPaymentRecorded={loadInvoices}
              />
            ))}
          </div>
        )}
      </div>

      {showTemplateSelector && (
        <InvoiceTemplateSelector
          invoiceType="basic"
          onClose={() => setShowTemplateSelector(false)}
          onSelectTemplate={(template) => {
            setSelectedTemplate(template)
            setShowTemplateSelector(false)
            setShowBasicModal(true)
          }}
        />
      )}

      {showBasicModal && (
        <InvoiceModal
          invoiceType="basic"
          template={selectedTemplate}
          defaultPatientId={preselectedPatientId}
          onClose={() => {
            setShowBasicModal(false)
            setSelectedTemplate(null)
            setPreselectedPatientId('')
          }}
          onSave={() => {
            loadInvoices()
            loadPendingPatients()
            setShowBasicModal(false)
            setSelectedTemplate(null)
            setPreselectedPatientId('')
          }}
        />
      )}

      {showSettings && <InvoiceSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function SummaryCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: 'blue' | 'green' | 'orange' }) {
  const colorMap: Record<'blue' | 'green' | 'orange', string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  }

  return (
    <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-lg ${colorMap[color]} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function InvoiceRow({
  invoice,
  checked,
  onSelect,
  onMarkPaid,
  onDelete,
  onPaymentRecorded,
}: {
  invoice: Invoice
  checked: boolean
  onSelect: (checked: boolean) => void
  onMarkPaid: () => void
  onDelete: () => void
  onPaymentRecorded: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  const items = Array.isArray(invoice.items) ? invoice.items : []
  const subtotal = getInvoiceItemSubtotal(items)
  const remainingBalance = Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)
  const itemPreview = buildInvoiceItemPreview(items)

  const statusColors: Record<string, string> = {
    Pending: 'bg-orange-100 text-orange-700',
    Partial: 'bg-amber-100 text-amber-700',
    Paid: 'bg-green-100 text-green-700',
    Overdue: 'bg-red-100 text-red-700',
  }

  const overdueDays = invoice.due_date && invoice.status !== 'Paid'
    ? Math.max(Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)), 0)
    : 0
  const lateInterest = overdueDays > 0 ? (remainingBalance * 0.01 * Math.ceil(overdueDays / 30)) : 0

  return (
    <div className="hover:bg-gray-50 transition-colors">
      <div className="p-4 cursor-pointer select-none" onClick={() => setExpanded((prev) => !prev)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onSelect(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium">
                  {invoice.patients?.first_name} {invoice.patients?.last_name}
                </p>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[invoice.status] || 'bg-gray-100'}`}>
                  {invoice.status}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-text-secondary uppercase">
                  {invoice.invoice_type || 'basic'}
                </span>
                {invoice.invoice_number && (
                  <span className="text-xs text-text-secondary">#{invoice.invoice_number}</span>
                )}
              </div>
              <p className="text-sm text-text-secondary mt-1">
                {safeFormat(invoice.created_at, 'MMM d, yyyy')}
                {invoice.due_date && ` • Due: ${safeFormat(invoice.due_date, 'MMM d, yyyy')}`}
                {items.length > 0 && ` • ${items.length} item${items.length !== 1 ? 's' : ''}`}
                {invoice.recurring_enabled && ` • Recurring (${invoice.recurring_frequency || 'monthly'})`}
              </p>
              {itemPreview && (
                <p className="text-sm text-text-secondary mt-1 truncate">{itemPreview}</p>
              )}
              <p className="text-lg font-bold text-primary mt-1">{formatBDT(invoice.total_amount)}</p>
              {overdueDays > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  Overdue by {overdueDays} day(s) • Est. late interest: {formatBDT(lateInterest)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
            {invoice.status === 'Pending' && (
              <Button variant="outline" size="sm" onClick={onMarkPaid}>Mark Paid</Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowPaymentModal(true)} disabled={remainingBalance <= 0}>
              Record Payment
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const email = invoice.patients?.email
                if (!email) {
                  alert('Patient email is not available')
                  return
                }
                const subject = encodeURIComponent(`Invoice ${invoice.invoice_number || invoice.id}`)
                const body = encodeURIComponent(`Dear ${invoice.patients?.first_name || 'Patient'},\n\nYour invoice total is ${formatBDT(invoice.total_amount)}.`)
                window.location.href = `mailto:${email}?subject=${subject}&body=${body}`
              }}
            >
              <Mail className="w-4 h-4 mr-1" />Email
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>Delete</Button>
            <button className="p-1 text-text-secondary hover:text-text-primary transition-colors" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {items.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Line Items</p>
              {items.map((item, idx) => (
                <div key={`${invoice.id}-${idx}`} className="flex justify-between items-center text-sm">
                  <div className="min-w-0 pr-3">
                    <span className="text-text-primary">{formatInvoiceItemLabel(item)}</span>
                    {getInvoiceItemLineTotal(item) > 0 && (
                      <p className="text-xs text-text-secondary">
                        {formatBDT(getInvoiceItemLineTotal(item) / Math.max(Number(item.quantity) || 1, 1))} each
                      </p>
                    )}
                  </div>
                  <span className="font-medium text-primary">{formatBDT(getInvoiceItemLineTotal(item))}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-200 space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Subtotal</span>
                  <span>{formatBDT(subtotal)}</span>
                </div>
                {(invoice.discount_amount || 0) > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-secondary">Discount</span>
                    <span className="text-green-600">-{formatBDT(invoice.discount_amount || 0)}</span>
                  </div>
                )}
                {(invoice.tax_amount || 0) > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-secondary">Tax ({invoice.tax_rate || 0}%)</span>
                    <span>{formatBDT(invoice.tax_amount || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center font-semibold pt-1 border-t border-gray-200">
                  <span>Total</span>
                  <span className="font-bold text-primary">{formatBDT(invoice.total_amount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Paid</span>
                  <span>{formatBDT(invoice.paid_amount || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Remaining</span>
                  <span className="font-medium">{formatBDT(remainingBalance)}</span>
                </div>
                {!!invoice.notes && <p className="text-xs text-text-secondary pt-2">Notes: {invoice.notes}</p>}
                {!!invoice.payment_terms && <p className="text-xs text-text-secondary">Terms: {invoice.payment_terms}</p>}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Payment History</p>
            <PaymentHistoryPanel invoiceId={invoice.id} />
          </div>
        </div>
      )}

      {showPaymentModal && (
        <PaymentEntryModal
          invoiceId={invoice.id}
          invoiceTotal={invoice.total_amount}
          invoicePaid={invoice.paid_amount}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => {
            setShowPaymentModal(false)
            onPaymentRecorded()
          }}
        />
      )}
    </div>
  )
}
