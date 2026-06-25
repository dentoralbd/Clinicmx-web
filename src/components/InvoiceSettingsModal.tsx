import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

interface InvoiceSettingsModalProps {
  onClose: () => void
}

export function InvoiceSettingsModal({ onClose }: InvoiceSettingsModalProps) {
  const [invoicePrefix, setInvoicePrefix] = useState('INV')
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('1')
  const [defaultTaxRate, setDefaultTaxRate] = useState('0')
  const [lateInterestRate, setLateInterestRate] = useState('0')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const { data } = await supabase
      .from('invoice_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (!data) return

    setInvoicePrefix(data.invoice_prefix || 'INV')
    setNextInvoiceNumber(String(data.next_invoice_number || 1))
    setDefaultTaxRate(String(data.default_tax_rate || 0))
    setLateInterestRate(String(data.late_interest_rate || 0))
    setPaymentTerms(data.payment_terms || '')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase
        .from('invoice_settings')
        .upsert({
          id: 1,
          invoice_prefix: invoicePrefix || 'INV',
          next_invoice_number: parseInt(nextInvoiceNumber, 10) || 1,
          default_tax_rate: parseFloat(defaultTaxRate) || 0,
          late_interest_rate: parseFloat(lateInterestRate) || 0,
          payment_terms: paymentTerms || null,
          updated_at: new Date().toISOString(),
        })

      if (error) throw error
      onClose()
    } catch (error) {
      console.error('Failed to save invoice settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Invoice Settings</h3>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Invoice Prefix</label>
              <input
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Next Invoice Number</label>
              <input
                type="number"
                min="1"
                value={nextInvoiceNumber}
                onChange={(e) => setNextInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Default Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={defaultTaxRate}
                onChange={(e) => setDefaultTaxRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Late Interest Rate (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={lateInterestRate}
                onChange={(e) => setLateInterestRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Default Payment Terms</label>
            <textarea
              rows={3}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Saving...' : 'Save Settings'}</Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
