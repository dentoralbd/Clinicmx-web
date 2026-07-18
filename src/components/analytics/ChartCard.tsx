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
  children: ReactNode
}

export function ChartCard({ icon, title, caption, children }: ChartCardProps) {
  return (
    <div className="bg-card rounded-xl shadow-elevation-low border border-gray-200/80 p-6">
      <div className="border-b border-gray-100 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary/10 text-primary rounded-lg p-1.5">{icon}</span>
          <h3 className="text-lg font-semibold">{title}</h3>
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
