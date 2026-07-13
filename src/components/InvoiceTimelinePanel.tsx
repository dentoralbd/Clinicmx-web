import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeFormat, formatBDT } from '@/lib/utils'

interface InvoiceTimelinePanelProps {
  invoiceId: string
}

interface HistoryRow {
  id: string
  event_type: string
  event_data: Record<string, unknown> | null
  created_at: string
}

function describeEvent(row: HistoryRow): string {
  const data = row.event_data || {}
  switch (row.event_type) {
    case 'invoice_created':
      return 'Invoice created'
    case 'payment_recorded': {
      const amount = typeof data.amount === 'number' ? formatBDT(data.amount) : null
      const method = typeof data.payment_method === 'string' ? data.payment_method : null
      return amount ? `Payment recorded — ${amount}${method ? ` (${method})` : ''}` : 'Payment recorded'
    }
    case 'status_updated': {
      const status = typeof data.status === 'string' ? data.status : null
      return status ? `Status set to ${status}` : 'Status updated'
    }
    case 'items_recalculated': {
      const reason = typeof data.reason === 'string' ? data.reason : ''
      const change = reason.endsWith('deleted') ? 'deletion' : reason.endsWith('edited') ? 'edit' : 'change'
      return `Items recalculated after treatment ${change}`
    }
    case 'merged_from': {
      const ids = Array.isArray(data.source_invoice_ids) ? data.source_invoice_ids.length : null
      return ids ? `Created by merging ${ids} invoice(s)` : 'Created by merging invoices'
    }
    case 'merged_into':
      return 'Merged into another invoice'
    case 'invoice_edited': {
      const added = Array.isArray(data.added_treatment_ids) ? data.added_treatment_ids.length : 0
      const removed = Array.isArray(data.removed_treatment_ids) ? data.removed_treatment_ids.length : 0
      const parts = [added > 0 ? `${added} treatment(s) added` : null, removed > 0 ? `${removed} freed` : null].filter(Boolean)
      return parts.length > 0 ? `Invoice edited — ${parts.join(', ')}` : 'Invoice manually edited'
    }
    default:
      return row.event_type.replace(/_/g, ' ')
  }
}

/** Read-only timeline of invoice_history events. Renders nothing on any error,
 *  empty result, or a legacy schema that lacks the table. */
export function InvoiceTimelinePanel({ invoiceId }: InvoiceTimelinePanelProps) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('invoice_history')
      .select('id, event_type, event_data, created_at')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        setRows(error ? [] : ((data as HistoryRow[]) || []))
        setLoaded(true)
      }, () => {
        if (!cancelled) {
          setRows([])
          setLoaded(true)
        }
      })
    return () => { cancelled = true }
  }, [invoiceId])

  if (!loaded || rows.length === 0) return null

  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">History</p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{describeEvent(row)}</span>
            <span className="text-xs text-text-secondary whitespace-nowrap">
              {safeFormat(row.created_at, 'MMM d, yyyy h:mm a')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
