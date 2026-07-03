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
  isSchemaCompatibilityError,
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

const PAYMENT_METHODS = ['Cash', 'Card', 'Cheque', 'Transfer'] as const

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
    discount_type: 'fixed' as 'fixed' | 'percentage',
    credit_amount: '',
    invoice_number: '',
    installment_count: '1',
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
  const [discountValue, setDiscountValue] = useState(String(template?.discount_amount || ''))
  const [saving, setSaving] = useState(false)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)

  // Pending treatments
  const [pendingTreatments, setPendingTreatments] = useState<PendingTreatment[]>([])
  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<Set<string>>(new Set())
  // True while items mirror the ticked treatments; cleared once the user edits items manually
  const [autoImported, setAutoImported] = useState(false)

  // Collect payment now
  const [collectPayment, setCollectPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('Cash')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    setFormData((prev) => ({ ...prev, patient_id: defaultPatientId || prev.patient_id }))

    if (!hidePatientSelect) {
      loadPatients()
    }
  }, [defaultPatientId, hidePatientSelect])

  // Load uninvoiced treatments whenever patient changes, pre-select all and import as line items
  useEffect(() => {
    const pid = formData.patient_id
    if (pid) {
      loadPendingTreatments(pid).then((loaded) => {
        setSelectedTreatmentIds(new Set(loaded.map((t) => t.id)))
        if (template) return
        setItems((prev) => {
          const blank = !prev.some((item) => item.description.trim() || item.unit_price || item.amount)
          if (!blank && !autoImported) return prev
          if (loaded.length > 0) {
            setAutoImported(true)
            return buildTreatmentInvoiceItems(loaded)
          }
          setAutoImported(false)
          return blank ? prev : [createInvoiceItem()]
        })
      })
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

  async function loadPendingTreatments(patientId: string): Promise<PendingTreatment[]> {
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
      return safeTreatments
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

        const fallbackTreatments = ((treatmentsData as PendingTreatment[]) || []).filter(
          (treatment) => !linkedTreatmentIds.has(treatment.id)
        )
        setPendingTreatments(fallbackTreatments)
        return fallbackTreatments
      } catch (fallbackError) {
        logBillingError('Failed to load pending treatments', fallbackError, { patientId, initialError: error })
        setPendingTreatments([])
        return []
      }
    }
  }

  /** While in auto-import mode, ticked treatments and invoice items stay in sync */
  function applyTreatmentSelection(next: Set<string>) {
    setSelectedTreatmentIds(next)
    if (autoImported) {
      const selected = pendingTreatments.filter((t) => next.has(t.id))
      setItems(selected.length > 0 ? buildTreatmentInvoiceItems(selected) : [createInvoiceItem()])
    }
  }

  function toggleTreatment(id: string) {
    const next = new Set(selectedTreatmentIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    applyTreatmentSelection(next)
  }

  function selectAllTreatments() {
    applyTreatmentSelection(new Set(pendingTreatments.map((t) => t.id)))
  }

  function clearTreatmentSelection() {
    applyTreatmentSelection(new Set())
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

  function addItem() {
    setAutoImported(false)
    setItems((prev) => [...prev, createInvoiceItem()])
  }

  function addQuickTreatment(description: string) {
    setAutoImported(false)
    appendItems([createInvoiceItem(description)])
  }

  function removeItem(index: number) {
    setAutoImported(false)
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof BillingLineItem, value: string) {
    setAutoImported(false)
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const subtotal = useMemo(() => getInvoiceItemSubtotal(items), [items])
  const discountValueNum = parseFloat(discountValue) || 0
  const discountCalcAmount = formData.discount_type === 'percentage'
    ? subtotal * (discountValueNum / 100)
    : discountValueNum
  const taxRate = parseFloat(formData.tax_rate) || 0
  const taxAmount = Math.max(subtotal - discountCalcAmount, 0) * (taxRate / 100)
  const creditAmount = parseFloat(formData.credit_amount) || 0
  const totalAmount = Math.max(subtotal - discountCalcAmount + taxAmount - creditAmount, 0)

  function handleCollectPaymentToggle(checked: boolean) {
    setCollectPayment(checked)
    if (checked) {
      setPaymentAmount(totalAmount > 0 ? String(totalAmount) : '')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const normalizedItems = normalizeInvoiceItems(items)
    if (!formData.patient_id) {
      alert('Please select a patient')
      return
    }
    if (normalizedItems.length === 0) {
      alert('Please add at least one valid item')
      return
    }

    const parsedPaymentAmount = parseFloat(paymentAmount) || 0
    if (collectPayment) {
      if (parsedPaymentAmount <= 0) {
        alert('Payment amount must be greater than 0')
        return
      }
      if (parsedPaymentAmount > totalAmount) {
        alert('Payment amount cannot be greater than the invoice total')
        return
      }
      if (!paymentDate) {
        alert('Please select a payment date')
        return
      }
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

      // Extended columns exist since migration 008 — fall back to the legacy-safe payload on older schemas
      const extendedPayload = {
        ...basePayload,
        notes: formData.notes || null,
        payment_terms: formData.payment_terms || null,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountCalcAmount,
        discount_type: formData.discount_type,
        discount_value: discountValueNum,
        credit_amount: creditAmount,
        invoice_number: formData.invoice_number || null,
        recurring_enabled: formData.recurring_enabled,
        recurring_frequency: formData.recurring_enabled ? formData.recurring_frequency : null,
      }

      let insertResult = await supabase
        .from('invoices')
        .insert([extendedPayload])
        .select('id')
        .single()

      if (insertResult.error && isSchemaCompatibilityError(insertResult.error)) {
        insertResult = await supabase
          .from('invoices')
          .insert([basePayload])
          .select('id')
          .single()
      }

      const { data, error } = insertResult
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

        // payment_plans table is added by a later migration — ignore if missing
        const installments = Math.max(parseInt(formData.installment_count, 10) || 1, 1)
        if (installments > 1 && formData.due_date) {
          const installmentAmount = Number((totalAmount / installments).toFixed(2))
          const planRows = Array.from({ length: installments }).map((_, index) => {
            const dueDate = new Date(formData.due_date)
            dueDate.setMonth(dueDate.getMonth() + index)
            return {
              invoice_id: data.id,
              installment_no: index + 1,
              due_date: dueDate.toISOString().slice(0, 10),
              amount: installmentAmount,
              status: 'Pending',
            }
          })

          await supabase.from('payment_plans').insert(planRows).then(() => {}, () => {})
        }

        if (collectPayment && parsedPaymentAmount > 0) {
          await recordImmediatePayment(data.id, parsedPaymentAmount)
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
      alert(`Failed to create invoice: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  /** Same fallback chain as PaymentEntryModal so older payments schemas keep working */
  async function recordImmediatePayment(invoiceId: string, amount: number) {
    const paymentDateIso = new Date(`${paymentDate}T00:00:00`).toISOString()
    let paymentStored = false
    let paymentSchemaError: unknown = null
    const paymentPayloads: Array<{
      invoice_id: string
      amount: number
      payment_method?: string
      payment_date?: string
      notes?: string | null
    }> = [
      {
        invoice_id: invoiceId,
        amount,
        payment_method: paymentMethod,
        payment_date: paymentDateIso,
        notes: null,
      },
      {
        invoice_id: invoiceId,
        amount,
        payment_date: paymentDateIso,
      },
      {
        invoice_id: invoiceId,
        amount,
      },
    ]

    for (const payload of paymentPayloads) {
      const { error: paymentError } = await supabase.from('payments').insert(payload)
      if (!paymentError) {
        paymentStored = true
        paymentSchemaError = null
        break
      }

      if (!isSchemaCompatibilityError(paymentError)) {
        throw paymentError
      }

      paymentSchemaError = paymentError
    }

    const newStatus = amount >= totalAmount ? 'Paid' : 'Partial'
    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({
        paid_amount: amount,
        status: newStatus,
      })
      .eq('id', invoiceId)

    if (invoiceError) throw invoiceError

    await supabase.from('invoice_history').insert({
      invoice_id: invoiceId,
      event_type: 'payment_recorded',
      event_data: {
        amount,
        payment_method: paymentMethod,
      },
    }).then(() => {}, () => {})

    if (!paymentStored && paymentSchemaError) {
      logBillingError('Payment recorded without payment ledger row', paymentSchemaError, { invoiceId, amount })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-full sm:max-w-2xl w-full my-4 sm:my-8">
        <div className="p-3 sm:p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">New Invoice</h2>
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
              <div className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 text-blue-800 text-sm font-medium">
                <span>
                  Pending Treatments
                  <span className="ml-2 px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-xs">
                    {pendingTreatments.length}
                  </span>
                </span>
                <span className="flex gap-2 text-xs font-normal">
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
                </span>
              </div>

              <div className="p-3 space-y-2">
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

                {autoImported ? (
                  <p className="text-xs text-blue-700">
                    Ticked treatments are added to the invoice automatically. Untick any you don't want to bill now.
                  </p>
                ) : (
                  selectedTreatmentIds.size > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => importTreatmentsAsItems()}
                      className="w-full sm:w-auto text-xs"
                    >
                      Add {selectedTreatmentIds.size} selected to invoice
                    </Button>
                  )
                )}
              </div>
            </div>
          )}

          {formData.patient_id && pendingTreatments.length === 0 && (
            <p className="text-xs text-text-secondary">
              No unbilled treatments for this patient — add items below.
            </p>
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

            <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <label className="text-sm text-text-secondary whitespace-nowrap">
                  Discount{formData.discount_type === 'percentage' ? ' (%)' : ''}:
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={formData.discount_type === 'percentage' ? '0' : '0.00'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full sm:w-32 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* ── More options ── */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowMoreOptions((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm text-text-secondary hover:bg-gray-100"
                >
                  <span>More options (tax, notes, payment terms, recurring)</span>
                  {showMoreOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showMoreOptions && (
                  <div className="p-3 space-y-3">
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
                  </div>
                )}
              </div>

              {/* ── Advanced options ── */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm text-text-secondary hover:bg-gray-100"
                >
                  <span>Advanced (discount type, credit, invoice #, installments)</span>
                  {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showAdvancedOptions && (
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Discount Type</label>
                      <select
                        value={formData.discount_type}
                        onChange={(e) => setFormData((prev) => ({ ...prev, discount_type: e.target.value as 'fixed' | 'percentage' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="fixed">Fixed amount</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Credit Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.credit_amount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, credit_amount: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Invoice # (optional)</label>
                      <input
                        type="text"
                        placeholder="Auto"
                        value={formData.invoice_number}
                        onChange={(e) => setFormData((prev) => ({ ...prev, invoice_number: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Installments</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={formData.installment_count}
                        onChange={(e) => setFormData((prev) => ({ ...prev, installment_count: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <p className="text-[11px] text-text-secondary mt-1">Needs a due date; creates a monthly payment plan.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Subtotal:</span>
                  <span>{formatBDT(subtotal)}</span>
                </div>
                {discountCalcAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-secondary">Discount:</span>
                    <span>-{formatBDT(discountCalcAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Tax:</span>
                  <span>{formatBDT(taxAmount)}</span>
                </div>
                {creditAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-secondary">Credit:</span>
                    <span>-{formatBDT(creditAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center font-medium pt-1 border-t border-gray-200">
                  <span>Total:</span>
                  <span className="text-xl font-bold text-primary">{formatBDT(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Collect payment now ── */}
          <div className="border border-green-200 rounded-lg overflow-hidden">
            <label className="flex items-center gap-3 px-3 py-2 bg-green-50 cursor-pointer">
              <input
                type="checkbox"
                checked={collectPayment}
                onChange={(e) => handleCollectPaymentToggle(e.target.checked)}
              />
              <span className="text-sm font-medium text-green-800">Collect payment now</span>
            </label>
            {collectPayment && (
              <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}
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
