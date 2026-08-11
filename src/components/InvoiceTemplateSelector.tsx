import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatBDT } from '@/lib/utils'
import { listTreatmentCatalogItems } from '@/lib/catalog'

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
  /** Synthesized from a Catalog procedure's default fee, not a real invoice_templates row. */
  isFromCatalog?: boolean
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

  // Every priced Catalog procedure doubles as a one-tap quick-invoice
  // template — keeps Billing's quick templates in sync with the Catalog
  // instead of needing a separate invoice_templates row kept up to date by
  // hand. Only offered for "basic" invoices (a single line item per template).
  const { data: catalogItems = [] } = useQuery({ queryKey: ['treatmentCatalogItems'], queryFn: listTreatmentCatalogItems })
  const catalogTemplates: InvoiceTemplateData[] =
    invoiceType === 'basic'
      ? catalogItems
          .filter((item) => item.default_fee != null)
          .map((item) => ({
            id: `catalog-${item.id}`,
            name: item.name,
            description: item.category?.name ?? null,
            invoice_type: 'basic',
            items: [
              {
                description: item.name,
                amount: item.default_fee as number,
                quantity: 1,
                unit_price: item.default_fee as number,
                line_total: item.default_fee as number,
              },
            ],
            discount_amount: 0,
            tax_rate: 0,
            payment_terms: null,
            isFromCatalog: true,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : []

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

  const allTemplates = [...templates, ...catalogTemplates]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Invoice Templates</h3>
            <p className="text-sm text-text-secondary">Select a {invoiceType} template for quick invoice creation</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(85vh-80px)]">
          {loading ? (
            <div className="py-8 text-center text-text-secondary">Loading templates...</div>
          ) : allTemplates.length === 0 ? (
            <div className="py-8 text-center text-text-secondary">No templates found for this invoice type.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allTemplates.map((template) => {
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
                        {template.isFromCatalog ? 'Catalog' : template.invoice_type}
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
