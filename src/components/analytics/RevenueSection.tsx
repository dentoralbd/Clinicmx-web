import { useNavigate } from 'react-router-dom'
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
import { TrendingUp, PieChart, Users } from 'lucide-react'
import { formatBDT } from '@/lib/utils'
import type { MonthlyRevenuePoint, RevenueByTypeRow, TopRevenueSource } from '@/lib/analytics'
import { ChartCard, ChartEmptyState, CHART_COLORS, formatBDTCompact, TOOLTIP_ITEM_STYLE } from './ChartCard'

interface RevenueSectionProps {
  monthly: MonthlyRevenuePoint[]
  byType: RevenueByTypeRow[]
  topSources: TopRevenueSource[]
}

const tooltipMoney = (value: unknown) => formatBDT(Number(value))

export function RevenueSection({ monthly, byType, topSources }: RevenueSectionProps) {
  const navigate = useNavigate()
  const hasMonthlyData = monthly.some((m) => m.collected > 0 || m.outstanding > 0)

  return (
    <div className="space-y-6">
      <ChartCard
        icon={<TrendingUp className="w-4 h-4" />}
        title="Monthly Revenue"
        caption="Collected = payments received on invoices created that month; Outstanding = still due on them. Merged invoices excluded."
      >
        {!hasMonthlyData ? (
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
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          icon={<PieChart className="w-4 h-4" />}
          title="Revenue by Treatment"
          caption='Collected revenue attributed via invoice line items linked to treatments. Manually added items appear as "Other / Unlinked".'
        >
          {byType.length === 0 ? (
            <ChartEmptyState message="No collected revenue in this period" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, byType.length * 36)}>
              <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
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
          caption="Patients by total payments collected in this period."
        >
          {topSources.length === 0 ? (
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
                  {topSources.map((source, index) => (
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
