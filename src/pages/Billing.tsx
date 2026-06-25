import { useState, useEffect } from 'react'
import { Plus, DollarSign, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InvoiceModal } from '@/components/InvoiceModal'
import { supabase } from '@/lib/supabase'
import { safeFormat, formatBDT } from '@/lib/utils'

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
              <p className="text-2xl font-bold mt-1">{formatBDT(stats.total)}</p>
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
              <p className="text-2xl font-bold mt-1">{formatBDT(stats.paid)}</p>
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
              <p className="text-2xl font-bold mt-1">{formatBDT(stats.pending)}</p>
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
  const discount = (invoice as any).discount_amount || 0
  const subtotal = items.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0)
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
                {invoice.patients?.first_name} {invoice.patients?.last_name}
              </p>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[invoice.status] || 'bg-gray-100'}`}>
                {invoice.status}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-1">
              {safeFormat(invoice.created_at, 'MMM d, yyyy')}
              {invoice.due_date && ` • Due: ${safeFormat(invoice.due_date, 'MMM d, yyyy')}`}
              {items.length > 0 && ` • ${items.length} item${items.length !== 1 ? 's' : ''}`}
            </p>
            <p className="text-lg font-bold text-primary mt-1">
              {formatBDT(invoice.total_amount)}
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
                <span className="font-medium text-primary">{formatBDT(parseFloat(item.amount) || 0)}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-200 space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary">Subtotal</span>
                <span>{formatBDT(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Discount</span>
                  <span className="text-green-600">-{formatBDT(discount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center font-semibold pt-1 border-t border-gray-200">
                <span>Total</span>
                <span className="font-bold text-primary">{formatBDT(invoice.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
