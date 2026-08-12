import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingUp, PieChart, Users, ChevronDown, ChevronRight } from 'lucide-react'
import { formatBDT, safeFormat } from '@/lib/utils'
import {
  monthKey,
  revenueByTreatmentType,
  topRevenueSources,
  type AnalyticsInvoice,
  type AnalyticsPatient,
  type AnalyticsPayment,
  type AnalyticsTreatment,
  type MonthlyRevenuePoint,
  type PaymentMonthGroup,
  type RevenueByTypeRow,
  type TopRevenueSource,
} from '@/lib/analytics'
import { ChartCard, ChartEmptyState, ModeToggle, MonthSelect, CHART_COLORS, formatBDTCompact, TOOLTIP_ITEM_STYLE } from './ChartCard'

interface RevenueSectionProps {
  monthly: MonthlyRevenuePoint[]
  byType: RevenueByTypeRow[]
  topSources: TopRevenueSource[]
  invoicePayments: PaymentMonthGroup[]
  rangeInvoices: AnalyticsInvoice[]
  rangePayments: AnalyticsPayment[]
  invoices: AnalyticsInvoice[]
  patients: AnalyticsPatient[]
  treatments: AnalyticsTreatment[]
  monthAxis: string[]
}

const ALL_MONTHS = 'all'

const tooltipMoney = (value: unknown) => formatBDT(Number(value))

const statusPillClass = (status: string): string => {
  if (status === 'Paid') return 'pill-success'
  if (status === 'Overdue') return 'pill-error'
  return 'pill-warning'
}

const REVENUE_VIEW_OPTIONS = [
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'invoice' as const, label: 'Invoice' },
]

export function RevenueSection({
  monthly,
  byType,
  topSources,
  invoicePayments,
  rangeInvoices,
  rangePayments,
  invoices,
  patients,
  treatments,
  monthAxis,
}: RevenueSectionProps) {
  const navigate = useNavigate()
  const [revenueView, setRevenueView] = useState<'monthly' | 'invoice'>('monthly')
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [breakdownMonth, setBreakdownMonth] = useState<string>(ALL_MONTHS)
  const hasMonthlyData = monthly.some((m) => m.collected > 0 || m.outstanding > 0)

  const paymentsByMonthKey = useMemo(() => new Map(invoicePayments.map((g) => [g.month, g])), [invoicePayments])
  const monthlyDesc = useMemo(() => [...monthly].reverse(), [monthly])

  const monthOptions = useMemo(
    () => [
      { value: ALL_MONTHS, label: 'All months' },
      ...[...monthAxis].reverse().map((m) => ({ value: m, label: format(new Date(`${m}-01T00:00:00`), 'MMMM yyyy') })),
    ],
    [monthAxis]
  )

  const byTypeShown = useMemo(() => {
    if (breakdownMonth === ALL_MONTHS) return byType
    const monthInvoices = rangeInvoices.filter((inv) => monthKey(inv.created_at) === breakdownMonth)
    return revenueByTreatmentType(monthInvoices, treatments)
  }, [breakdownMonth, byType, rangeInvoices, treatments])

  const topSourcesShown = useMemo(() => {
    if (breakdownMonth === ALL_MONTHS) return topSources
    const monthInvoices = rangeInvoices.filter((inv) => monthKey(inv.created_at) === breakdownMonth)
    const monthPayments = rangePayments.filter((p) => monthKey(p.payment_date) === breakdownMonth)
    return topRevenueSources(monthInvoices, monthPayments, invoices, patients)
  }, [breakdownMonth, topSources, rangeInvoices, rangePayments, invoices, patients])

  // A picked month can fall outside the range after the top-level date filter changes
  // (e.g. narrowing from "All" to "1M") — monthOptions.find(...) would then return
  // undefined and render "undefined" in the caption, so fall back to "All months".
  useEffect(() => {
    if (breakdownMonth !== ALL_MONTHS && !monthOptions.some((o) => o.value === breakdownMonth)) {
      setBreakdownMonth(ALL_MONTHS)
    }
  }, [breakdownMonth, monthOptions])

  function toggleMonth(month: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <ChartCard
        icon={<TrendingUp className="w-4 h-4" />}
        title="Monthly Revenue"
        caption={
          revenueView === 'invoice'
            ? 'Invoiced vs Collected per month. Expand a month to see the individual payments behind it.'
            : 'Collected = payments received that month, regardless of when the invoice was created; Outstanding = still due on invoices created that month. Merged invoices excluded.'
        }
        headerRight={<ModeToggle value={revenueView} options={REVENUE_VIEW_OPTIONS} onChange={setRevenueView} />}
      >
        {revenueView === 'monthly' ? (
          !hasMonthlyData ? (
            <ChartEmptyState message="No invoices in this period" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis tickFormatter={formatBDTCompact} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={70} />
                <Tooltip formatter={tooltipMoney} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="collected" name="Collected" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="outstanding" name="Outstanding" fill={CHART_COLORS.outstanding} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )
        ) : !hasMonthlyData ? (
          <ChartEmptyState message="No invoices in this period" />
        ) : (
          <div className="max-h-[520px] overflow-y-auto pr-1">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary border-b border-gray-100">
              <span>Month</span>
              <span className="text-right">Invoiced</span>
              <span className="text-right">Collected</span>
            </div>
            <div className="divide-y divide-gray-50">
              {monthlyDesc.map((point) => {
                const fullLabel = format(new Date(`${point.month}-01T00:00:00`), 'MMMM yyyy')
                const group = paymentsByMonthKey.get(point.month)
                const isExpanded = expandedMonths.has(point.month)
                const hasDetail = !!group && group.rows.length > 0
                return (
                  <div key={point.month}>
                    <button
                      type="button"
                      onClick={() => hasDetail && toggleMonth(point.month)}
                      disabled={!hasDetail}
                      className={`w-full grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-3 py-2.5 text-sm text-left ${
                        hasDetail ? 'hover:bg-surface-subtle cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        {hasDetail ? (
                          isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                          )
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        {fullLabel}
                      </span>
                      <span className="text-right tabular-nums text-text-secondary">{formatBDT(point.billed)}</span>
                      <span className="text-right tabular-nums font-semibold text-primary">{formatBDT(point.collected)}</span>
                    </button>
                    {isExpanded && group && (
                      <div className="pl-9 pr-3 pb-2 divide-y divide-gray-50">
                        {group.rows.map((row) => (
                          <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{row.patientName}</p>
                              <p className="text-xs text-text-secondary">{safeFormat(row.date, 'MMM d, yyyy')}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={statusPillClass(row.invoiceStatus)}>{row.invoiceStatus}</span>
                              <span className="font-semibold tabular-nums">{formatBDT(row.amount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          icon={<PieChart className="w-4 h-4" />}
          title="Revenue by Treatment"
          caption={
            breakdownMonth === ALL_MONTHS
              ? 'Collected revenue attributed via invoice line items linked to treatments. Manually added items appear as "Other / Unlinked".'
              : `Same, for ${monthOptions.find((o) => o.value === breakdownMonth)?.label}.`
          }
          headerRight={<MonthSelect value={breakdownMonth} options={monthOptions} onChange={setBreakdownMonth} />}
        >
          {byTypeShown.length === 0 ? (
            <ChartEmptyState message="No collected revenue in this period" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, byTypeShown.length * 36)}>
              <BarChart data={byTypeShown} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={formatBDTCompact} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="type"
                  width={120}
                  tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
                  tickLine={false}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                />
                <Tooltip formatter={tooltipMoney} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                <Bar dataKey="collected" name="Collected" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          icon={<Users className="w-4 h-4" />}
          title="Top Revenue Sources"
          caption={
            breakdownMonth === ALL_MONTHS
              ? 'Patients by total payments collected in this period.'
              : `Patients by total payments collected in ${monthOptions.find((o) => o.value === breakdownMonth)?.label}.`
          }
          headerRight={<MonthSelect value={breakdownMonth} options={monthOptions} onChange={setBreakdownMonth} />}
        >
          {topSourcesShown.length === 0 ? (
            <ChartEmptyState message="No payments in this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-text-secondary border-b border-gray-100">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Patient</th>
                    <th className="py-2 pr-3 font-medium text-right">Invoices</th>
                    <th className="py-2 font-medium text-right">Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {topSourcesShown.map((source, index) => (
                    <tr key={source.patientId} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-3 text-text-secondary">{index + 1}</td>
                      <td className="py-2.5 pr-3">
                        <button
                          onClick={() => navigate(`/patients/${source.patientId}`)}
                          className="font-medium text-left hover:text-primary hover:underline transition-colors"
                        >
                          {source.name}
                        </button>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-text-secondary tabular-nums">{source.invoiceCount}</td>
                      <td className="py-2.5 text-right font-medium tabular-nums">{formatBDT(source.collected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
