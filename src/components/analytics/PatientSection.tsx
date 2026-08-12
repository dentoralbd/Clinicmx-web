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
import { UserPlus, TrendingUp, Repeat } from 'lucide-react'
import type { NewPatientsPoint, ReturningVsNewPoint, YoYPoint } from '@/lib/analytics'
import { ChartCard, ChartEmptyState, ModeToggle, CHART_COLORS, YEAR_SERIES_COLORS, TOOLTIP_ITEM_STYLE } from './ChartCard'

interface PatientSectionProps {
  newPerMonth: NewPatientsPoint[]
  returningVsNew: ReturningVsNewPoint[]
  newPatientsYoY: { data: YoYPoint[]; years: string[] }
  totalPatientsSeenYoY: { data: YoYPoint[]; years: string[] }
}

const MODE_OPTIONS = [
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'yearly' as const, label: 'Yearly' },
]

export function PatientSection({ newPerMonth, returningVsNew, newPatientsYoY, totalPatientsSeenYoY }: PatientSectionProps) {
  const [newPatientsMode, setNewPatientsMode] = useState<'monthly' | 'yearly'>('monthly')
  const [returningVsNewMode, setReturningVsNewMode] = useState<'monthly' | 'yearly'>('monthly')

  const hasNewData = newPerMonth.some((m) => m.count > 0)
  const hasNewYoYData = newPatientsYoY.years.some((y) => newPatientsYoY.data.some((d) => Number(d[y]) > 0))
  const hasGrowthData = newPerMonth.some((m) => m.cumulative > 0)
  const hasVisitData = returningVsNew.some((m) => m.newPatients > 0 || m.returning > 0)
  const hasTotalSeenYoYData = totalPatientsSeenYoY.years.some((y) => totalPatientsSeenYoY.data.some((d) => Number(d[y]) > 0))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          icon={<UserPlus className="w-4 h-4" />}
          title="New Patients per Month"
          caption={
            newPatientsMode === 'yearly'
              ? 'Patients registered each calendar month, compared year over year.'
              : 'Patients registered each month.'
          }
          headerRight={<ModeToggle value={newPatientsMode} options={MODE_OPTIONS} onChange={setNewPatientsMode} />}
        >
          {newPatientsMode === 'monthly' ? (
            !hasNewData ? (
              <ChartEmptyState message="No new patients in this period" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={newPerMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                  <Bar dataKey="count" name="New patients" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )
          ) : !hasNewYoYData ? (
            <ChartEmptyState message="No new patients on record" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={newPatientsYoY.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={36} />
                <Tooltip itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                {newPatientsYoY.years.map((year, i) => (
                  <Bar key={year} dataKey={year} name={year} fill={YEAR_SERIES_COLORS[i % YEAR_SERIES_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={20} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          icon={<TrendingUp className="w-4 h-4" />}
          title="Patient Growth"
          caption="Total registered patients over time (cumulative)."
        >
          {!hasGrowthData ? (
            <ChartEmptyState message="No patients yet" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={newPerMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={36} />
                <Tooltip itemStyle={TOOLTIP_ITEM_STYLE} />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  name="Total patients"
                  stroke={CHART_COLORS.secondary}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard
        icon={<Repeat className="w-4 h-4" />}
        title="Returning vs New Patients"
        caption={
          returningVsNewMode === 'yearly'
            ? 'Total patients seen each month (new + returning combined) — switch to Monthly for the new-vs-returning split.'
            : 'By appointments (Cancelled excluded): a patient is New in the month of their first-ever appointment, Returning in any later month they visit.'
        }
        headerRight={<ModeToggle value={returningVsNewMode} options={MODE_OPTIONS} onChange={setReturningVsNewMode} />}
      >
        {returningVsNewMode === 'monthly' ? (
          !hasVisitData ? (
            <ChartEmptyState message="No appointments in this period" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={returningVsNew} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={36} />
                <Tooltip itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="newPatients" name="New" stackId="visits" fill={CHART_COLORS.primary} stroke="#fff" strokeWidth={1} maxBarSize={28} />
                <Bar dataKey="returning" name="Returning" stackId="visits" fill={CHART_COLORS.secondary} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )
        ) : !hasTotalSeenYoYData ? (
          <ChartEmptyState message="No appointments on record" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={totalPatientsSeenYoY.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="0" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={36} />
              <Tooltip itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {totalPatientsSeenYoY.years.map((year, i) => (
                <Bar key={year} dataKey={year} name={year} fill={YEAR_SERIES_COLORS[i % YEAR_SERIES_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={20} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
