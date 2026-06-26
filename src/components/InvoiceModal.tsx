import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, ChevronDown, ChevronUp, Plus, Square } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  buildLegacySafeInvoicePayload,
  buildTreatmentInvoiceItems,
  createInvoiceItem,
  extractTreatmentIdsFromInvoiceItems,
  getFriendlySupabaseErrorMessage,
  getInvoiceItemLineTotal,
  getInvoiceItemSubtotal,
  logBillingError,
  normalizeInvoiceItems,
  QUICK_TREATMENT_OPTIONS,
  type BillingLineItem,
} from '@/lib/billing'
import { supabase } from '@/lib/supabase'
import { formatBDT } from '@/lib/utils'
import type { InvoiceTemplateData } from '@/components/InvoiceTemplateSelector'

interface InvoiceModalProps {
  onClose: () => void
  onSave: () => void
  defaultPatientId?: string
  hidePatientSelect?: boolean
  invoiceType?: 'basic' | 'advanced'
  template?: InvoiceTemplateData | null
}

interface PatientRow {
  id: string
  first_name: string
  last_name: string
  patient_code: string | null
}

interface PendingTreatment {
  id: string
  treatment_type: string
  description: string | null
  tooth_number: number | null
  status: string
  cost: number
  is_invoiced?: boolean
  invoice_id?: string | null
}

export function InvoiceModal({
  onClose,
  onSave,
  defaultPatientId = '',
  hidePatientSelect = false,
  invoiceType = 'basic',
  template = null,
}: InvoiceModalProps) {
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [formData, setFormData] = useState({
    patient_id: defaultPatientId,
    due_date: '',
    status: 'Pending',
    notes: '',
    payment_terms: template?.payment_terms || '',
    tax_rate: String(template?.tax_rate || 0),
    recurring_enabled: false,
    recurring_frequency: 'monthly',
  })
  const [items, setItems] = useState<BillingLineItem[]>(
    template?.items?.length
      ? template.items.map((item) => ({
          description: item.description,
          quantity: String(item.quantity || 1),
          unit_price: String(item.unit_price ?? item.amount ?? ''),
          amount: String(item.line_total ?? item.amount ?? ''),
        }))
      : [createInvoiceItem()]
  )
  const [discountAmount, setDiscountAmount] = useState(String(template?.discount_amount || ''))
  const [saving, setSaving] = useState(false)

  // Pending treatments
  const [pendingTreatments, setPendingTreatments] = useState<PendingTreatment[]>([])
  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<Set<string>>(new Set())
  const [showTreatments, setShowTreatments] = useState(true)

  useEffect(() => {
    setFormData((prev) => ({ ...prev, patient_id: defaultPatientId || prev.patient_id }))

    if (!hidePatientSelect) {
      loadPatients()
    }
  }, [defaultPatientId, hidePatientSelect])

  // Load uninvoiced treatments whenever patient changes
  useEffect(() => {
    const pid = formData.patient_id
    if (pid) {
      loadPendingTreatments(pid)
    } else {
      setPendingTreatments([])
      setSelectedTreatmentIds(new Set())
    }
  }, [formData.patient_id])

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, patient_code')
      .order('last_name')
    setPatients((data as PatientRow[]) || [])
  }

  async function loadPendingTreatments(patientId: string) {
    try {
      const { data, error } = await supabase
        .from('treatments')
        .select('id, treatment_type, description, tooth_number, status, cost, is_invoiced, invoice_id')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      if (error) throw error

      const safeTreatments = ((data as PendingTreatment[]) || []).filter(
        (treatment) => !treatment.is_invoiced && !treatment.invoice_id
      )
      setPendingTreatments(safeTreatments)
    } catch (error) {
      try {
        const [{ data: treatmentsData, error: treatmentsError }, { data: invoicesData, error: invoicesError }] = await Promise.all([
          supabase
            .from('treatments')
            .select('id, treatment_type, description, tooth_number, status, cost')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false }),
          supabase
            .from('invoices')
            .select('items')
            .eq('patient_id', patientId),
        ])

        if (treatmentsError) throw treatmentsError
        if (invoicesError) throw invoicesError

        const linkedTreatmentIds = extractTreatmentIdsFromInvoiceItems(
          (invoicesData || []).flatMap((invoice: { items?: unknown }) => (Array.isArray(invoice.items) ? invoice.items : []))
        )

        setPendingTreatments(
          ((treatmentsData as PendingTreatment[]) || []).filter((treatment) => !linkedTreatmentIds.has(treatment.id))
        )
      } catch (fallbackError) {
        logBillingError('Failed to load pending treatments', fallbackError, { patientId, initialError: error })
        setPendingTreatments([])
      }
    }
    setSelectedTreatmentIds(new Set())
  }

  function toggleTreatment(id: string) {
    setSelectedTreatmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function selectAllTreatments() {
    setSelectedTreatmentIds(new Set(pendingTreatments.map((t) => t.id)))
  }

  function clearTreatmentSelection() {
    setSelectedTreatmentIds(new Set())
  }

  function appendItems(nextItems: BillingLineItem[]) {
    if (nextItems.length === 0) return

    setItems((prev) => {
      const nonEmpty = prev.filter((item) => item.description.trim() || item.unit_price || item.amount)
      return nonEmpty.length > 0 ? [...nonEmpty, ...nextItems] : nextItems
    })
  }

  /** Convert selected pending treatments into invoice line items */
  function importTreatmentsAsItems(treatmentIds = Array.from(selectedTreatmentIds)) {
    const selected = pendingTreatments.filter((t) => treatmentIds.includes(t.id))
    if (selected.length === 0) return

    appendItems(buildTreatmentInvoiceItems(selected))
    setSelectedTreatmentIds(new Set(treatmentIds))
  }

  function importAllPendingTreatments() {
    const allTreatmentIds = pendingTreatments.map((treatment) => treatment.id)
    importTreatmentsAsItems(allTreatmentIds)
  }

  function addItem() {
    setItems((prev) => [...prev, createInvoiceItem()])
  }

  function addQuickTreatment(description: string) {
    appendItems([createInvoiceItem(description)])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof BillingLineItem, value: string) {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const subtotal = useMemo(() => getInvoiceItemSubtotal(items), [items])
  const discount = parseFloat(discountAmount) || 0
  const taxRate = parseFloat(formData.tax_rate) || 0
  const taxAmount = Math.max(subtotal - discount, 0) * (taxRate / 100)
  const totalAmount = Math.max(subtotal - discount + taxAmount, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const normalizedItems = normalizeInvoiceItems(items)
    if (normalizedItems.length === 0) {
      alert('Please add at least one valid item')
      return
    }
    setSaving(true)
    try {
      const basePayload = buildLegacySafeInvoicePayload({
        patientId: formData.patient_id,
        items: normalizedItems,
        totalAmount,
        paidAmount: 0,
        status: formData.status,
        dueDate: formData.due_date,
      })

      const { data, error } = await supabase
        .from('invoices')
        .insert([basePayload])
        .select('id')
        .single()

      if (error) throw error

      if (data?.id) {
        // invoice_history table is added by a later migration — ignore if missing
        await supabase.from('invoice_history').insert({
          invoice_id: data.id,
          event_type: 'invoice_created',
          event_data: {
            invoice_type: invoiceType,
            template_id: template?.id || null,
          },
        }).then(() => {}, () => {})

        // treatments.is_invoiced / invoice_id are added by a later migration — ignore if missing
        if (selectedTreatmentIds.size > 0) {
          await supabase
            .from('treatments')
            .update({ is_invoiced: true, invoice_id: data.id })
            .in('id', Array.from(selectedTreatmentIds))
            .then(() => {}, () => {})
        }
      }

      onSave()
    } catch (error) {
      logBillingError('Failed to create invoice', error, {
        patientId: formData.patient_id,
        itemCount: normalizedItems.length,
        totalAmount,
      })
      const message = getFriendlySupabaseErrorMessage(error)
      alert(`Failed to create invoice. Only legacy-safe invoice fields are sent, but the database still rejected the request: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-full sm:max-w-2xl w-full my-4 sm:my-8">
        <div className="p-3 sm:p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">New {invoiceType === 'advanced' ? 'Advanced ' : ''}Invoice</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hidePatientSelect && (
              <div>
                <label className="block text-sm font-medium mb-1">Patient *</label>
                <select
                  required
                  value={formData.patient_id}
                  onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select patient...</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.patient_code ? `${patient.patient_code} - ` : ''}{patient.first_name} {patient.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={hidePatientSelect ? 'sm:col-span-2' : ''}>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* ── From Patient Treatments ── */}
          {pendingTreatments.length > 0 && (
            <div className="border border-blue-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTreatments((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 text-blue-800 text-sm font-medium"
              >
                <span>From Patient Treatments ({pendingTreatments.length} pending)</span>
                {showTreatments ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showTreatments && (
                <div className="p-3 space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllTreatments}
                      className="text-blue-600 hover:underline"
                    >
                      Select all
                    </button>
                    <span className="text-gray-400">·</span>
                    <button
                      type="button"
                      onClick={clearTreatmentSelection}
                      className="text-gray-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>

                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {pendingTreatments.map((t) => {
                      const checked = selectedTreatmentIds.has(t.id)
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => toggleTreatment(t.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                              checked ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            {checked
                              ? <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              : <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                            <span className="flex-1 min-w-0 truncate">
                              {t.treatment_type}
                              {t.tooth_number ? ` (T${t.tooth_number})` : ''}
                              {t.description ? ` – ${t.description}` : ''}
                            </span>
                            <span className="text-gray-500 font-medium flex-shrink-0">
                              {formatBDT(t.cost || 0)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={importAllPendingTreatments}
                      className="w-full sm:w-auto text-xs"
                    >
                      Use all pending treatments
                    </Button>
                    {selectedTreatmentIds.size > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={importTreatmentsAsItems}
                        className="w-full sm:w-auto text-xs"
                      >
                        Add {selectedTreatmentIds.size} selected to invoice
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <label className="block text-sm font-medium">Items</label>
              <Button type="button" size="sm" onClick={addItem} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK_TREATMENT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => addQuickTreatment(option)}
                  className="px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10"
                >
                  + {option}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_90px_120px_110px_auto] gap-2 items-start">
                  <input
                    type="text"
                    placeholder="Description *"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Qty"
                    value={item.quantity || '1'}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Unit price *"
                    value={item.unit_price || ''}
                    onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-right">
                    {formatBDT(getInvoiceItemLineTotal(item))}
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="w-full sm:w-auto px-3 py-2 text-red-600 hover:text-red-700 rounded-lg border border-red-200 hover:border-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                  <label className="text-sm text-text-secondary whitespace-nowrap">Discount:</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full sm:w-32 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                  <label className="text-sm text-text-secondary whitespace-nowrap">Tax %:</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tax_rate: e.target.value }))}
                    className="w-full sm:w-32 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <textarea
                rows={2}
                placeholder="Internal notes"
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <input
                type="text"
                placeholder="Payment terms (e.g. Due in 7 days)"
                value={formData.payment_terms}
                onChange={(e) => setFormData((prev) => ({ ...prev, payment_terms: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.recurring_enabled}
                  onChange={(e) => setFormData((prev) => ({ ...prev, recurring_enabled: e.target.checked }))}
                />
                Recurring invoice
              </label>

              {formData.recurring_enabled && (
                <select
                  value={formData.recurring_frequency}
                  onChange={(e) => setFormData((prev) => ({ ...prev, recurring_frequency: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              )}

              <div className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Subtotal:</span>
                  <span>{formatBDT(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Tax:</span>
                  <span>{formatBDT(taxAmount)}</span>
                </div>
                <div className="flex justify-between items-center font-medium pt-1 border-t border-gray-200">
                  <span>Total:</span>
                  <span className="text-xl font-bold text-primary">{formatBDT(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button type="submit" disabled={saving} className="w-full sm:flex-1">
              {saving ? 'Creating...' : 'Create Invoice'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
