import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, DollarSign, CheckCircle2 } from 'lucide-react'
import { formatBDT } from '@/lib/utils'
import type {
  AvgCostRow,
  ConversionTrendPoint,
  ProcedureCountRow,
  TreatmentConversion,
  TypeYoYRow,
  YoYPoint,
} from '@/lib/analytics'
import { ChartCard, ChartEmptyState, ModeToggle, CHART_COLORS, YEAR_SERIES_COLORS, formatBDTCompact, TOOLTIP_ITEM_STYLE } from './ChartCard'

interface TreatmentMixSectionProps {
  counts: ProcedureCountRow[]
  avgCosts: AvgCostRow[]
  conversion: TreatmentConversion
  countsYoY: { data: TypeYoYRow[]; years: string[] }
  avgCostsYoY: { data: TypeYoYRow[]; years: string[] }
  conversionTrend: ConversionTrendPoint[]
  conversionYoY: { data: YoYPoint[]; years: string[] }
}

const MODE_OPTIONS = [
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'yearly' as const, label: 'Yearly' },
]

const tooltipMoney = (value: unknown) => formatBDT(Number(value))

export function TreatmentMixSection({
  counts,
  avgCosts,
  conversion,
  countsYoY,
  avgCostsYoY,
  conversionTrend,
  conversionYoY,
}: TreatmentMixSectionProps) {
  const [typeBreakdownMode, setTypeBreakdownMode] = useState<'monthly' | 'yearly'>('monthly')
  const [conversionMode, setConversionMode] = useState<'monthly' | 'yearly'>('monthly')
  const pipeline = conversion.planned + conversion.inProgress + conversion.completed
  const hasConversionTrendData = conversionTrend.some((p) => p.pipeline > 0)
  const hasConversionYoYData = conversionYoY.years.some((y) => conversionYoY.data.some((d) => Number(d[y]) > 0))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          icon={<Activity className="w-4 h-4" />}
          title="Procedures by Type"
          caption={
            typeBreakdownMode === 'yearly'
              ? 'Top 5 types by all-time volume, compared year over year.'
              : 'Number of treatments recorded per type (Cancelled excluded).'
          }
          headerRight={<ModeToggle value={typeBreakdownMode} options={MODE_OPTIONS} onChange={setTypeBreakdownMode} />}
        >
          {typeBreakdownMode === 'monthly' ? (
            counts.length === 0 ? (
              <ChartEmptyState message="No treatments in this period" />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, counts.length * 36)}>
                <BarChart data={counts} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={120}
                    tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                  />
                  <Tooltip itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                  <Bar dataKey="count" name="Procedures" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )
          ) : countsYoY.data.length === 0 ? (
            <ChartEmptyState message="No treatments on record" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, countsYoY.data.length * 44)}>
              <BarChart data={countsYoY.data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="type"
                  width={120}
                  tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
                  tickLine={false}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                />
                <Tooltip itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                {countsYoY.years.map((year, i) => (
                  <Bar key={year} dataKey={year} name={year} fill={YEAR_SERIES_COLORS[i % YEAR_SERIES_COLORS.length]} radius={[0, 4, 4, 0]} maxBarSize={16} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          icon={<DollarSign className="w-4 h-4" />}
          title="Average Cost per Procedure"
          caption={
            typeBreakdownMode === 'yearly'
              ? 'Top 5 types by all-time frequency, mean cost compared year over year.'
              : 'Mean recorded treatment cost per type (zero-cost rows excluded); tooltip shows sample size.'
          }
          headerRight={<ModeToggle value={typeBreakdownMode} options={MODE_OPTIONS} onChange={setTypeBreakdownMode} />}
        >
          {typeBreakdownMode === 'monthly' ? (
            avgCosts.length === 0 ? (
              <ChartEmptyState message="No costed treatments in this period" />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, avgCosts.length * 36)}>
                <BarChart data={avgCosts} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
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
                  <Tooltip
                    formatter={(value: unknown, _name: unknown, entry: { payload?: unknown }) => [
                      `${formatBDT(Number(value))} (n=${(entry?.payload as AvgCostRow | undefined)?.n ?? '—'})`,
                      'Avg cost',
                    ]}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    cursor={{ fill: 'rgba(74, 58, 167, 0.06)' }}
                  />
                  <Bar dataKey="avgCost" name="Avg cost" fill={CHART_COLORS.secondary} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )
          ) : avgCostsYoY.data.length === 0 ? (
            <ChartEmptyState message="No costed treatments on record" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(280, avgCostsYoY.data.length * 44)}>
              <BarChart data={avgCostsYoY.data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
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
                <Tooltip formatter={tooltipMoney} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(74, 58, 167, 0.06)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                {avgCostsYoY.years.map((year, i) => (
                  <Bar key={year} dataKey={year} name={year} fill={YEAR_SERIES_COLORS[i % YEAR_SERIES_COLORS.length]} radius={[0, 4, 4, 0]} maxBarSize={16} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard
        icon={<CheckCircle2 className="w-4 h-4" />}
        title="Treatment Completion"
        caption="How treatments in the selected period progressed through the pipeline."
      >
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <ConversionStat label="Planned" value={conversion.planned} />
          <ConversionStat label="In Progress" value={conversion.inProgress} />
          <ConversionStat label="Completed" value={conversion.completed} highlight />
          <ConversionStat label="Cancelled" value={conversion.cancelled} muted />
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Completion Rate</p>
            <p className="text-2xl font-bold tracking-tight mt-1 text-primary">
              {pipeline > 0 ? `${Math.round(conversion.completionRate * 100)}%` : '—'}
            </p>
            <p className="text-[11px] text-text-secondary mt-1">of {pipeline} non-cancelled</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-5 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Completion rate trend</p>
          <ModeToggle value={conversionMode} options={MODE_OPTIONS} onChange={setConversionMode} />
        </div>
        {conversionMode === 'monthly' ? (
          !hasConversionTrendData ? (
            <ChartEmptyState message="No treatments in this period" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={conversionTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis unit="%" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={40} />
                <Tooltip formatter={(value: unknown) => `${value}%`} itemStyle={TOOLTIP_ITEM_STYLE} />
                <Line
                  type="monotone"
                  dataKey="completionRatePct"
                  name="Completion rate"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )
        ) : !hasConversionYoYData ? (
          <ChartEmptyState message="No treatments on record" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={conversionYoY.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
              <YAxis unit="%" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={40} />
              <Tooltip formatter={(value: unknown) => `${value}%`} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {conversionYoY.years.map((year, i) => (
                <Bar key={year} dataKey={year} name={year} fill={YEAR_SERIES_COLORS[i % YEAR_SERIES_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={20} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}

function ConversionStat({ label, value, highlight, muted }: { label: string; value: number; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-2xl font-bold tracking-tight mt-1 ${highlight ? 'text-primary' : muted ? 'text-text-secondary' : ''}`}>
        {value}
      </p>
    </div>
  )
}
