import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatBDT } from '@/lib/utils'

interface InvoiceSummary {
  total_amount: number
  paid_amount: number
  due_date: string | null
  status: string
}

export function FinancialReportsPanel() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInvoices()
  }, [])

  async function loadInvoices() {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('total_amount, paid_amount, due_date, status')

    setInvoices((data as InvoiceSummary[]) || [])
    setLoading(false)
  }

  const totals = useMemo(() => {
    const revenue = invoices.reduce((sum, invoice) => sum + (invoice.paid_amount || 0), 0)
    const billed = invoices.reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0)
    const outstanding = billed - revenue
    const now = new Date()

    const aging = {
      current: 0,
      over30: 0,
      over60: 0,
    }

    invoices.forEach((invoice) => {
      if (invoice.status === 'Paid' || !invoice.due_date) return
      const dueDate = new Date(invoice.due_date)
      const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      const pending = (invoice.total_amount || 0) - (invoice.paid_amount || 0)

      if (diffDays > 60) aging.over60 += pending
      else if (diffDays > 30) aging.over30 += pending
      else aging.current += pending
    })

    return { revenue, billed, outstanding, aging }
  }, [invoices])

  return (
    <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Financial Reports</h3>
        <button
          onClick={loadInvoices}
          className="text-sm text-primary hover:underline"
          type="button"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading reports...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat title="Total Billed" value={formatBDT(totals.billed)} />
            <Stat title="Revenue Collected" value={formatBDT(totals.revenue)} />
            <Stat title="Outstanding" value={formatBDT(totals.outstanding)} />
          </div>

          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-sm font-medium mb-2">Aging Summary</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <Stat title="0-30 days" value={formatBDT(totals.aging.current)} compact />
              <Stat title="31-60 days" value={formatBDT(totals.aging.over30)} compact />
              <Stat title=">60 days" value={formatBDT(totals.aging.over60)} compact />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ title, value, compact = false }: { title: string; value: string; compact?: boolean }) {
  return (
    <div className={`border border-gray-200 rounded-lg ${compact ? 'p-2' : 'p-3'}`}>
      <p className="text-xs text-text-secondary">{title}</p>
      <p className={compact ? 'text-sm font-semibold' : 'text-base font-semibold'}>{value}</p>
    </div>
  )
}
