import type { ReactNode } from 'react'

// Shared chart palette — validated for CVD separation and >=3:1 contrast on the
// white card surface (teal↔violet ΔE 55.9, teal↔orange ΔE 43.0). Colors follow
// the entity: teal = primary measure, violet = secondary series, orange = dues.
export const CHART_COLORS = {
  primary: '#0D9488',
  secondary: '#4a3aa7',
  outstanding: '#eb6834',
  grid: '#e5e7eb',
  axis: '#5A7184',
} as const

/** Previous-year vs current-year bars in a year-over-year comparison chart (navy vs orange, matching the reference design). */
export const YOY_COLORS = { previous: '#1e3a5f', current: CHART_COLORS.outstanding } as const

/** `years` is ≤2 entries, ascending. Labels each series "Previous Year (Y)"/"Current Year (Y)", or just the year when only one year of data exists. */
export function yoySeriesLabel(years: string[], index: number): string {
  const year = years[index]
  if (years.length < 2) return year
  return index === 0 ? `Previous Year (${year})` : `Current Year (${year})`
}

export function yoySeriesColor(years: string[], index: number): string {
  if (years.length < 2) return YOY_COLORS.current
  return index === 0 ? YOY_COLORS.previous : YOY_COLORS.current
}

/** "Previous Year (2025) vs Current Year (2026)", or just the single year when only one year of data exists. */
export function yoyCaption(years: string[]): string {
  if (years.length < 2) return years[0] || ''
  return `Previous Year (${years[0]}) vs Current Year (${years[1]})`
}

/** Keeps tooltip values in ink color instead of recharts' default per-series coloring. */
export const TOOLTIP_ITEM_STYLE = { color: '#1B2733' } as const

const compactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Compact BDT for axis ticks, e.g. ৳12K. Full amounts stay in tooltips via formatBDT. */
export function formatBDTCompact(value: number): string {
  return `৳${compactFormatter.format(value || 0)}`
}

interface ChartCardProps {
  icon: ReactNode
  title: string
  caption?: string
  headerRight?: ReactNode
  children: ReactNode
}

export function ChartCard({ icon, title, caption, headerRight, children }: ChartCardProps) {
  return (
    <div className="bg-card rounded-xl shadow-elevation-low border border-gray-200/80 p-6">
      <div className="border-b border-gray-100 pb-4 mb-4">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary rounded-lg p-1.5">{icon}</span>
            <h3 className="text-lg font-semibold">{title}</h3>
          </div>
          {headerRight}
        </div>
        {caption && <p className="text-xs text-text-secondary mt-2">{caption}</p>}
      </div>
      {children}
    </div>
  )
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[280px] text-sm text-text-secondary">{message}</div>
  )
}

/** Small per-card 2-way switch (e.g. Monthly/Yearly), styled lighter than the page-level range filter so it reads as local to the card. */
export function ModeToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5 shrink-0">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === option.value ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
