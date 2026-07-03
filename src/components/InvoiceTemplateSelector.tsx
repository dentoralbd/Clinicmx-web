import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { formatBDT } from '@/lib/utils'

type InvoiceType = 'basic' | 'advanced'

export interface InvoiceTemplateData {
  id: string
  name: string
  description: string | null
  invoice_type: string
  items: Array<{
    description: string
    amount: number | string
    quantity?: number | string
    unit_price?: number | string
    line_total?: number | string
  }>
  discount_amount: number
  tax_rate: number
  payment_terms: string | null
}

interface InvoiceTemplateSelectorProps {
  invoiceType: InvoiceType
  onSelectTemplate: (template: InvoiceTemplateData) => void
  onClose: () => void
}

export function InvoiceTemplateSelector({
  invoiceType,
  onSelectTemplate,
  onClose,
}: InvoiceTemplateSelectorProps) {
  const [templates, setTemplates] = useState<InvoiceTemplateData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTemplates()
  }, [invoiceType])

  async function loadTemplates() {
    setLoading(true)
    const { data } = await supabase
      .from('invoice_templates')
      .select('*')
      .eq('is_active', true)
      .eq('invoice_type', invoiceType)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true })

    setTemplates((data as unknown as InvoiceTemplateData[]) || [])
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Invoice Templates</h3>
            <p className="text-sm text-text-secondary">Select a {invoiceType} template for quick invoice creation</p>
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(85vh-80px)]">
          {loading ? (
            <div className="py-8 text-center text-text-secondary">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center text-text-secondary">No templates found for this invoice type.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => {
                const subtotal = Array.isArray(template.items)
                  ? template.items.reduce((sum, item) => sum + (parseFloat(String(item.amount)) || 0), 0)
                  : 0
                const taxAmount = subtotal * ((template.tax_rate || 0) / 100)
                const total = subtotal - (template.discount_amount || 0) + taxAmount

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onSelectTemplate(template)}
                    className="text-left p-4 border border-gray-200 rounded-lg hover:border-primary hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-semibold">{template.name}</h4>
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-text-secondary uppercase">
                        {template.invoice_type}
                      </span>
                    </div>
                    {template.description && (
                      <p className="text-sm text-text-secondary mt-1">{template.description}</p>
                    )}
                    <p className="text-xs text-text-secondary mt-2">
                      {Array.isArray(template.items) ? template.items.length : 0} item(s)
                    </p>
                    <p className="text-sm font-semibold text-primary mt-2">{formatBDT(total)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
