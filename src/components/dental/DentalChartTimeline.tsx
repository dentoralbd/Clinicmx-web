import React from 'react'
import { DentalChartHistoryEntry } from '@/types/dentalChart'
import { cn } from '@/lib/utils'
import { History, ChevronLeft, ChevronRight, RotateCcw, Filter, X } from 'lucide-react'

export interface DentalChartTimelineProps {
  historyEntries: DentalChartHistoryEntry[]
  selectedDate: string | null // null means Live / Present
  onSelectDate: (date: string | null) => void
  selectedToothFilter: number | null
  onClearToothFilter: () => void
}

export const DentalChartTimeline: React.FC<DentalChartTimelineProps> = ({
  historyEntries,
  selectedDate,
  onSelectDate,
  selectedToothFilter,
  onClearToothFilter,
}) => {
  // Extract distinct procedure dates sorted chronologically ascending
  const distinctDates = Array.from(
    new Set(
      historyEntries
        .map((e) => e.procedureDate || e.createdAt.split('T')[0])
        .filter(Boolean)
    )
  ).sort()

  if (distinctDates.length === 0) {
    return null
  }

  // All timeline milestone points: [...distinctDates, 'LIVE']
  const currentIndex =
    selectedDate === null
      ? distinctDates.length // At Live
      : distinctDates.indexOf(selectedDate)

  const handlePrev = () => {
    if (currentIndex > 0) {
      onSelectDate(distinctDates[currentIndex - 1])
    }
  }

  const handleNext = () => {
    if (currentIndex < distinctDates.length - 1) {
      onSelectDate(distinctDates[currentIndex + 1])
    } else if (currentIndex === distinctDates.length - 1) {
      onSelectDate(null) // Return to live
    }
  }

  const formatDateLabel = (d: string) => {
    try {
      const date = new Date(d)
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return d
    }
  }

  return (
    <div className="bg-slate-50/80 rounded-2xl border border-slate-200/90 p-3 sm:p-4 space-y-3 shadow-xs">
      {/* Top Header & Milestone Scrubber Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
            <History className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 tracking-tight">Timeline & History Scrubber</span>
              {selectedDate !== null ? (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                  Snapshot: {formatDateLabel(selectedDate)}
                </span>
              ) : (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                  ● Live Current
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stepper buttons */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {selectedToothFilter && (
            <div className="flex items-center gap-1 bg-sky-100 text-sky-800 px-2 py-1 rounded-lg text-xs font-semibold mr-1">
              <Filter className="w-3 h-3 text-sky-600" />
              <span>Tooth #{selectedToothFilter}</span>
              <button
                type="button"
                onClick={onClearToothFilter}
                className="hover:text-sky-950 p-0.5 rounded"
                title="Clear tooth filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={currentIndex <= 0}
            onClick={handlePrev}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors shadow-2xs"
            title="Previous Milestone"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={selectedDate === null}
            onClick={handleNext}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors shadow-2xs"
            title="Next Milestone"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {selectedDate !== null && (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs ml-1"
            >
              <RotateCcw className="w-3 h-3" />
              Return to Live
            </button>
          )}
        </div>
      </div>

      {/* Visual Timeline Track */}
      <div className="relative pt-2 pb-1">
        {/* Connecting line */}
        <div className="absolute top-5 left-3 right-3 h-0.5 bg-slate-200 rounded-full" />

        {/* Milestone Steps */}
        <div className="relative flex items-center justify-between gap-1 overflow-x-auto pb-1">
          {distinctDates.map((date, idx) => {
            const isSelected = selectedDate === date
            const countOnDate = historyEntries.filter(
              (e) => (e.procedureDate || e.createdAt.split('T')[0]) === date
            ).length

            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelectDate(date)}
                className="group flex flex-col items-center flex-1 min-w-[70px] focus:outline-none"
              >
                <div
                  className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10 text-[10px] font-bold',
                    isSelected
                      ? 'bg-amber-500 border-amber-600 text-white shadow-sm scale-110'
                      : 'bg-white border-slate-300 text-slate-600 group-hover:border-sky-500 group-hover:text-sky-600 shadow-2xs'
                  )}
                  title={`${countOnDate} tooth record(s) on ${date}`}
                >
                  {idx + 1}
                </div>
                <span
                  className={cn(
                    'text-[10px] mt-1.5 font-mono whitespace-nowrap transition-colors',
                    isSelected ? 'font-bold text-amber-900' : 'text-slate-500 group-hover:text-slate-900'
                  )}
                >
                  {formatDateLabel(date)}
                </span>
                <span className="text-[9px] text-slate-400 font-sans">
                  {countOnDate} change{countOnDate > 1 ? 's' : ''}
                </span>
              </button>
            )
          })}

          {/* Live Node */}
          <button
            type="button"
            onClick={() => onSelectDate(null)}
            className="group flex flex-col items-center flex-1 min-w-[70px] focus:outline-none"
          >
            <div
              className={cn(
                'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10 text-[10px] font-bold',
                selectedDate === null
                  ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm scale-110'
                  : 'bg-white border-slate-300 text-slate-600 group-hover:border-emerald-500 shadow-2xs'
              )}
            >
              ●
            </div>
            <span
              className={cn(
                'text-[10px] mt-1.5 font-bold whitespace-nowrap transition-colors',
                selectedDate === null ? 'text-emerald-700' : 'text-slate-500 group-hover:text-slate-900'
              )}
            >
              Live State
            </span>
            <span className="text-[9px] text-slate-400 font-sans">Present</span>
          </button>
        </div>
      </div>
    </div>
  )
}
