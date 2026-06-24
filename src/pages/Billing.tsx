import { useState, useEffect } from 'react'
import { Plus, DollarSign, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

interface Invoice {
  id: string
  patient_id: string
  items: any
  total_amount: number
  paid_amount: number
  status: string
  due_date: string | null
  created_at: string
  patients: {
    first_name: string
    last_name: string
  }
}

export function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    loadInvoices()
  }, [])

  async function loadInvoices() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          patients (first_name, last_name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setInvoices(data || [])
    } catch (error) {
      console.error('Error loading invoices:', error)
    } finally {
      setLoading(false)
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
      setInvoices(invoices.filter((i) => i.id !== id))
    } catch (error) {
      console.error('Error deleting invoice:', error)
      alert('Failed to delete invoice')
    }
  }

  const filteredInvoices = filter === 'all'
    ? invoices
    : invoices.filter(i => i.status === filter)

  const stats = {
    total: invoices.reduce((sum, i) => sum + i.total_amount, 0),
    paid: invoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.paid_amount, 0),
    pending: invoices.filter(i => i.status === 'Pending').reduce((sum, i) => sum + i.total_amount, 0),
  }

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-text-secondary mt-1">Invoices and payments</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Invoice
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-secondary text-sm">Total Billed</p>
              <p className="text-2xl font-bold mt-1">${stats.total.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-secondary text-sm">Paid</p>
              <p className="text-2xl font-bold mt-1">${stats.paid.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-secondary text-sm">Pending</p>
              <p className="text-2xl font-bold mt-1">${stats.pending.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('Pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'Pending' ? 'bg-primary text-white' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('Paid')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'Paid' ? 'bg-primary text-white' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
            }`}
          >
            Paid
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <span className="spinner" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            {filter === 'all' ? 'No invoices yet. Click "New Invoice" to get started.' : `No ${filter.toLowerCase()} invoices.`}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredInvoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                onMarkPaid={() => markAsPaid(invoice.id, invoice.total_amount)}
                onDelete={() => deleteInvoice(invoice.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <InvoiceModal
          onClose={() => setShowModal(false)}
          onSave={() => { loadInvoices(); setShowModal(false) }}
        />
      )}
    </div>
  )
}

function InvoiceRow({ invoice, onMarkPaid, onDelete }: { invoice: Invoice; onMarkPaid: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const items = Array.isArray(invoice.items) ? invoice.items : []
  const statusColors: Record<string, string> = {
    Pending: 'bg-orange-100 text-orange-700',
    Paid: 'bg-green-100 text-green-700',
    Overdue: 'bg-red-100 text-red-700',
  }

  return (
    <div className="hover:bg-gray-50 transition-colors">
      <div
        className="p-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">
                {invoice.patients.first_name} {invoice.patients.last_name}
              </p>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[invoice.status] || 'bg-gray-100'}`}>
                {invoice.status}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-1">
              {format(new Date(invoice.created_at), 'MMM d, yyyy')}
              {invoice.due_date && ` • Due: ${format(new Date(invoice.due_date), 'MMM d, yyyy')}`}
              {items.length > 0 && ` • ${items.length} item${items.length !== 1 ? 's' : ''}`}
            </p>
            <p className="text-lg font-bold text-primary mt-1">
              ${invoice.total_amount.toFixed(2)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {invoice.status === 'Pending' && (
              <Button variant="outline" size="sm" onClick={onMarkPaid}>
                Mark Paid
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onDelete}>
              Delete
            </Button>
            <button className="p-1 text-text-secondary hover:text-text-primary transition-colors" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && items.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Line Items</p>
            {items.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-sm">
                <span className="text-text-primary">{item.description}</span>
                <span className="font-medium text-primary">${item.amount?.toFixed(2) || '0.00'}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
              <span className="text-sm font-semibold">Total</span>
              <span className="font-bold text-primary">${invoice.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InvoiceModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [patients, setPatients] = useState<any[]>([])
  const [formData, setFormData] = useState({
    patient_id: '',
    due_date: '',
    status: 'Pending',
  })
  const [items, setItems] = useState([{
    description: '',
    amount: '',
  }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPatients()
  }, [])

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .order('last_name')
    setPatients(data || [])
  }

  function addItem() {
    setItems([...items, { description: '', amount: '' }])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: string, value: string) {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase.from('invoices').insert([{
        patient_id: formData.patient_id,
        items: items.filter(i => i.description && i.amount),
        total_amount: totalAmount,
        paid_amount: 0,
        status: formData.status,
        due_date: formData.due_date || null,
      }])

      if (error) throw error
      onSave()
    } catch (error) {
      console.error('Error creating invoice:', error)
      alert('Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">New Invoice</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Patient *</label>
              <select
                required
                value={formData.patient_id}
                onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Items</label>
              <Button type="button" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
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
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="px-3 py-2 text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
              <span className="font-medium">Total:</span>
              <span className="text-xl font-bold text-primary">${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Creating...' : 'Create Invoice'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
