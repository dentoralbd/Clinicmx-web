import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  buildLegacySafeInvoicePayload,
  createInvoiceItem,
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
import { logActivity } from '@/lib/activityLog'
import type { InvoiceTemplateData } from '@/components/InvoiceTemplateSelector'

interface AdvancedInvoiceModalProps {
  onClose: () => void
  onSave: () => void
  defaultPatientId?: string
  template?: InvoiceTemplateData | null
}

export function AdvancedInvoiceModal({ onClose, onSave, defaultPatientId = '', template = null }: AdvancedInvoiceModalProps) {
  const [formData, setFormData] = useState({
    patient_id: defaultPatientId,
    due_date: '',
    invoice_number: '',
    notes: '',
    payment_terms: template?.payment_terms || '',
    tax_rate: String(template?.tax_rate || 0),
    discount_type: 'fixed',
    discount_value: String(template?.discount_amount || 0),
    credit_amount: '0',
    recurring_enabled: false,
    recurring_frequency: 'monthly',
    installment_count: '1',
  })
  const [items, setItems] = useState<BillingLineItem[]>(
    Array.isArray(template?.items) && template.items.length > 0
      ? template.items.map((item) => ({
          description: item.description,
          quantity: String(item.quantity || 1),
          unit_price: String(item.unit_price ?? item.amount ?? ''),
          amount: String(item.line_total ?? item.amount ?? ''),
        }))
      : [createInvoiceItem()]
  )
  const [saving, setSaving] = useState(false)

  const subtotal = useMemo(() => getInvoiceItemSubtotal(items), [items])
  const discountValue = parseFloat(formData.discount_value) || 0
  const discountAmount = formData.discount_type === 'percentage'
    ? subtotal * (discountValue / 100)
    : discountValue
  const taxRate = parseFloat(formData.tax_rate) || 0
  const taxAmount = Math.max(subtotal - discountAmount, 0) * (taxRate / 100)
  const creditAmount = parseFloat(formData.credit_amount) || 0
  const totalAmount = Math.max(subtotal - discountAmount + taxAmount - creditAmount, 0)

  function updateItem(index: number, field: keyof BillingLineItem, value: string) {
    const next = [...items]
    next[index] = { ...next[index], [field]: value }
    setItems(next)
  }

  function addItem() {
    setItems((prev) => [...prev, createInvoiceItem()])
  }

  function addQuickTreatment(description: string) {
    setItems((prev) => [...prev.filter((item) => item.description.trim() || item.unit_price || item.amount), createInvoiceItem(description)])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalizedItems = normalizeInvoiceItems(items)

    if (!formData.patient_id) {
      alert('Please select a patient')
      return
    }

    if (normalizedItems.length === 0) {
      alert('Please add at least one invoice item')
      return
    }

    setSaving(true)
    try {
      const basePayload = buildLegacySafeInvoicePayload({
        patientId: formData.patient_id,
        items: normalizedItems,
        totalAmount,
        paidAmount: 0,
        status: 'Pending',
        dueDate: formData.due_date,
      })

      const { data, error } = await supabase
        .from('invoices')
        .insert([basePayload])
        .select('id')
        .single()

      if (error) throw error

      logActivity({
        action: 'create',
        entityType: 'invoice',
        entityId: data?.id ?? null,
        entityLabel: formData.invoice_number || null,
        patientId: formData.patient_id,
        details: `Total ${formatBDT(totalAmount)} (advanced)`,
      })

      // payment_plans table is added by a later migration — ignore if missing
      const installments = Math.max(parseInt(formData.installment_count, 10) || 1, 1)
      if (installments > 1 && formData.due_date && data?.id) {
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

      if (data?.id) {
        // invoice_history table is added by a later migration — ignore if missing
        await supabase.from('invoice_history').insert({
          invoice_id: data.id,
          event_type: 'invoice_created',
          event_data: { invoice_type: 'advanced', template_id: template?.id || null },
        }).then(() => {}, () => {})
      }

      onSave()
    } catch (error) {
      logBillingError('Failed to create advanced invoice', error, {
        patientId: formData.patient_id,
        itemCount: normalizedItems.length,
        totalAmount,
      })
      const message = getFriendlySupabaseErrorMessage(error)
      alert(`Failed to create advanced invoice. Legacy-safe fields were used, but the database still rejected the request: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-4 sm:my-8">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-xl font-bold">New Advanced Invoice</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Patient ID *</label>
              <input
                required
                value={formData.patient_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, patient_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Invoice Number</label>
              <input
                value={formData.invoice_number}
                onChange={(e) => setFormData((prev) => ({ ...prev, invoice_number: e.target.value }))}
                placeholder="Custom number (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Installments</label>
              <input
                type="number"
                min="1"
                value={formData.installment_count}
                onChange={(e) => setFormData((prev) => ({ ...prev, installment_count: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Items</label>
              <Button type="button" size="sm" onClick={addItem}>Add Item</Button>
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
                    value={item.description}
                    placeholder="Description"
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity || '1'}
                    placeholder="Qty"
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.unit_price || ''}
                    placeholder="Unit price"
                    onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-right">
                    {formatBDT(getInvoiceItemLineTotal(item))}
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => removeItem(idx)}>Remove</Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Discount Type</label>
              <select
                value={formData.discount_type}
                onChange={(e) => setFormData((prev) => ({ ...prev, discount_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="fixed">Fixed</option>
                <option value="percentage">Percentage</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Discount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.discount_value}
                onChange={(e) => setFormData((prev) => ({ ...prev, discount_value: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tax %</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.tax_rate}
                onChange={(e) => setFormData((prev) => ({ ...prev, tax_rate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Credit</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.credit_amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, credit_amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Payment Terms</label>
              <textarea
                rows={3}
                value={formData.payment_terms}
                onChange={(e) => setFormData((prev) => ({ ...prev, payment_terms: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.recurring_enabled}
              onChange={(e) => setFormData((prev) => ({ ...prev, recurring_enabled: e.target.checked }))}
            />
            Recurring Invoice
          </label>

          {formData.recurring_enabled && (
            <div>
              <label className="block text-sm font-medium mb-1">Recurring Frequency</label>
              <select
                value={formData.recurring_frequency}
                onChange={(e) => setFormData((prev) => ({ ...prev, recurring_frequency: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
          )}

          <div className="border-t border-gray-200 pt-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatBDT(subtotal)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>-{formatBDT(discountAmount)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>{formatBDT(taxAmount)}</span></div>
            <div className="flex justify-between"><span>Credit</span><span>-{formatBDT(creditAmount)}</span></div>
            <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200"><span>Total</span><span>{formatBDT(totalAmount)}</span></div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Creating...' : 'Create Advanced Invoice'}</Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
