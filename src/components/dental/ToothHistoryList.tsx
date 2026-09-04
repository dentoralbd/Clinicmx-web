import React, { useState } from 'react'
import { DentalChartHistoryEntry, ToothCondition } from '@/types/dentalChart'
import { getFDIToothName } from '@/lib/fdiChart'
import { cn } from '@/lib/utils'
import { Clock, ChevronDown, ChevronUp, Eye, Sparkles } from 'lucide-react'

export interface ToothHistoryListProps {
  historyEntries: DentalChartHistoryEntry[]
  selectedToothFilter: number | null
  onSelectDate: (date: string | null) => void
  onSelectToothFilter: (toothNum: number | null) => void
}

const CONDITION_COLORS: Record<
  ToothCondition,
  { label: string; bg: string; text: string; dot: string }
> = {
  healthy: { label: 'Healthy', bg: 'bg-slate-100', text: 'text-slate-700', dot: '#94A3B8' },
  decayed: { label: 'Caries / Cavity', bg: 'bg-rose-100', text: 'text-rose-700', dot: '#E11D48' },
  filled: { label: 'Restored / Filled', bg: 'bg-indigo-100', text: 'text-indigo-700', dot: '#6366F1' },
  missing: { label: 'Missing', bg: 'bg-slate-200', text: 'text-slate-700', dot: '#475569' },
  root_canal: { label: 'Root Canal (RCT)', bg: 'bg-pink-100', text: 'text-pink-700', dot: '#F43F5E' },
  crown: { label: 'Crown', bg: 'bg-amber-100', text: 'text-amber-800', dot: '#F59E0B' },
  bridge: { label: 'Bridge', bg: 'bg-emerald-100', text: 'text-emerald-800', dot: '#10B981' },
  implant: { label: 'Dental Implant', bg: 'bg-teal-100', text: 'text-teal-800', dot: '#0F766E' },
  extracted: { label: 'Extracted', bg: 'bg-slate-200', text: 'text-slate-800', dot: '#334155' },
  impacted: { label: 'Impacted', bg: 'bg-orange-100', text: 'text-orange-800', dot: '#F97316' },
}

export const ToothHistoryList: React.FC<ToothHistoryListProps> = ({
  historyEntries,
  selectedToothFilter,
  onSelectDate,
  onSelectToothFilter,
}) => {
  const [isExpanded, setIsExpanded] = useState(true)

  const filteredEntries = selectedToothFilter
    ? historyEntries.filter((e) => e.toothNumber === selectedToothFilter)
    : historyEntries

  // Sort descending (newest first for log view)
  const sortedEntries = [...filteredEntries].sort((a, b) =>
    (b.procedureDate || b.createdAt).localeCompare(a.procedureDate || a.createdAt)
  )

  if (historyEntries.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3.5 bg-slate-50/70 hover:bg-slate-100/70 transition-colors border-b border-slate-200/70 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Tooth Procedure & Changes Log</span>
              {selectedToothFilter && (
                <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Tooth #{selectedToothFilter} only
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500">
              {filteredEntries.length} chronological entry
              {filteredEntries.length === 1 ? '' : 'ies'} recorded across visits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded Feed */}
      {isExpanded && (
        <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
          {sortedEntries.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 font-medium">
              No historical records found for Tooth #{selectedToothFilter}.
            </div>
          ) : (
            sortedEntries.map((item) => {
              const conf = CONDITION_COLORS[item.condition] || CONDITION_COLORS.healthy
              const dateStr = item.procedureDate || item.createdAt.split('T')[0]

              return (
                <div
                  key={item.id}
                  className="p-3 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {dateStr}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectToothFilter(item.toothNumber)}
                        className="font-bold text-slate-900 hover:text-sky-600 transition-colors"
                        title="Filter history to this tooth"
                      >
                        #{item.toothNumber} — {getFDIToothName(item.toothNumber)}
                      </button>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                          conf.bg,
                          conf.text
                        )}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: conf.dot }}
                        />
                        {conf.label}
                      </span>
                      {item.treatmentId && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          Treatment Plan Sync
                        </span>
                      )}
                    </div>

                    {/* Details: Notes */}
                    <div className="text-slate-600 pl-1 text-[11px] flex flex-wrap items-center gap-2">
                      {item.notes && (
                        <span className="italic text-slate-500">"{item.notes}"</span>
                      )}
                      {item.doctorName && (
                        <span className="text-slate-400 font-sans">
                          • {item.doctorName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions: Jump to Snapshot */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => onSelectDate(dateStr)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300 transition-colors shadow-2xs"
                    >
                      <Eye className="w-3 h-3 text-sky-600" />
                      View Snapshot
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
