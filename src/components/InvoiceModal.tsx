import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
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

interface InvoiceItem {
  description: string
  amount: string
}

interface PatientRow {
  id: string
  first_name: string
  last_name: string
  patient_code: string | null
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
  const [items, setItems] = useState<InvoiceItem[]>(
    template?.items?.length
      ? template.items.map((item) => ({ description: item.description, amount: String(item.amount) }))
      : [{ description: '', amount: '' }]
  )
  const [discountAmount, setDiscountAmount] = useState(String(template?.discount_amount || ''))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFormData((prev) => ({ ...prev, patient_id: defaultPatientId || prev.patient_id }))

    if (!hidePatientSelect) {
      loadPatients()
    }
  }, [defaultPatientId, hidePatientSelect])

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, patient_code')
      .order('last_name')
    setPatients((data as PatientRow[]) || [])
  }

  function addItem() {
    setItems((prev) => [...prev, { description: '', amount: '' }])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: string) {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    [items]
  )
  const discount = parseFloat(discountAmount) || 0
  const taxRate = parseFloat(formData.tax_rate) || 0
  const taxAmount = Math.max(subtotal - discount, 0) * (taxRate / 100)
  const totalAmount = Math.max(subtotal - discount + taxAmount, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const validItems = items.filter((item) => item.description.trim() && item.amount)
    if (validItems.length === 0) {
      alert('Please add at least one valid item')
      return
    }

    setSaving(true)

    try {
      const { data, error } = await supabase
        .from('invoices')
        .insert([{
          patient_id: formData.patient_id,
          items: validItems,
          total_amount: totalAmount,
          paid_amount: 0,
          discount_amount: discount,
          discount_type: 'fixed',
          discount_value: discount,
          tax_amount: taxAmount,
          tax_rate: taxRate,
          notes: formData.notes || null,
          payment_terms: formData.payment_terms || null,
          invoice_type: invoiceType,
          status: formData.status,
          due_date: formData.due_date || null,
          recurring_enabled: formData.recurring_enabled,
          recurring_frequency: formData.recurring_enabled ? formData.recurring_frequency : null,
          template_id: template?.id || null,
        }])
        .select('id')
        .single()

      if (error) throw error

      if (data?.id) {
        await supabase.from('invoice_history').insert({
          invoice_id: data.id,
          event_type: 'invoice_created',
          event_data: {
            invoice_type: invoiceType,
            template_id: template?.id || null,
          },
        })
      }

      onSave()
    } catch (error) {
      console.error('Error creating invoice:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to create invoice: ${message}`)
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

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <label className="block text-sm font-medium">Items</label>
              <Button type="button" size="sm" onClick={addItem} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Description *"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount *"
                    value={item.amount}
                    onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                    className="w-full sm:w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
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
