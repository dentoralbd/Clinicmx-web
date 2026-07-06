import { useState } from 'react'
import type { DentitionType } from '@/lib/ageTier'

// FDI permanent quadrants (display order: distal → mesial), matching the layout
// used by the Patient Profile dental chart for visual consistency.
const Q1 = [18, 17, 16, 15, 14, 13, 12, 11] // upper right
const Q2 = [21, 22, 23, 24, 25, 26, 27, 28] // upper left
const Q3 = [31, 32, 33, 34, 35, 36, 37, 38] // lower left
const Q4 = [48, 47, 46, 45, 44, 43, 42, 41] // lower right

// FDI primary quadrants, same order as the dental chart.
const Q5 = [55, 54, 53, 52, 51] // upper right primary
const Q6 = [61, 62, 63, 64, 65] // upper left primary
const Q7 = [71, 72, 73, 74, 75] // lower left primary
const Q8 = [85, 84, 83, 82, 81] // lower right primary

interface MiniToothProps {
  number: number
  selected: boolean
  onClick: () => void
}

function MiniTooth({ number, selected, onClick }: MiniToothProps) {
  return (
    <div
      className="flex flex-col items-center cursor-pointer group"
      onClick={onClick}
      title={`Tooth ${number}`}
    >
      <svg
        viewBox="0 0 32 48"
        className={`w-4 h-6 sm:w-5 sm:h-[30px] transition-colors ${
          selected
            ? 'fill-primary/20 stroke-primary'
            : 'fill-gray-50 stroke-gray-300 group-hover:stroke-primary/50'
        }`}
      >
        <path
          d="M16 2 C10 2, 6 6, 6 12 C6 18, 8 24, 10 32 C11 36, 12 42, 16 46 C20 42, 21 36, 22 32 C24 24, 26 18, 26 12 C26 6, 22 2, 16 2 Z"
          strokeWidth="2"
        />
      </svg>
      <span className={`text-[9px] font-medium mt-0.5 ${selected ? 'text-primary' : 'text-gray-500'}`}>
        {number}
      </span>
    </div>
  )
}

interface ToothSelectorProps {
  selectedTeeth: number[]
  onChange: (teeth: number[]) => void
  dentitionType?: DentitionType
}

export function ToothSelector({ selectedTeeth, onChange, dentitionType = 'permanent' }: ToothSelectorProps) {
  const [open, setOpen] = useState(false)

  const showPermanent = dentitionType === 'permanent' || dentitionType === 'mixed'
  const showPrimary = dentitionType === 'deciduous' || dentitionType === 'mixed'

  function toggleTooth(num: number) {
    if (selectedTeeth.includes(num)) {
      onChange(selectedTeeth.filter((n) => n !== num))
    } else {
      onChange([...selectedTeeth, num].sort((a, b) => a - b))
    }
  }

  const renderQuadrantRow = (left: number[], right: number[], label?: string) => (
    <div>
      {label && <p className="text-[9px] text-gray-400 text-center mb-0.5">{label}</p>}
      <div className="flex justify-center items-center gap-px sm:gap-0.5">
        <div className="flex gap-px sm:gap-0.5">
          {left.map((num) => (
            <MiniTooth key={num} number={num} selected={selectedTeeth.includes(num)} onClick={() => toggleTooth(num)} />
          ))}
        </div>
        <div className="w-px h-8 bg-gray-300 mx-0.5 sm:mx-1" />
        <div className="flex gap-px sm:gap-0.5">
          {right.map((num) => (
            <MiniTooth key={num} number={num} selected={selectedTeeth.includes(num)} onClick={() => toggleTooth(num)} />
          ))}
        </div>
      </div>
    </div>
  )

  const rowLabel = (kind: 'Permanent' | 'Primary') => (dentitionType === 'mixed' ? kind : undefined)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors"
      >
        🦷 {selectedTeeth.length > 0 ? selectedTeeth.join(', ') : 'Tooth'}
      </button>

      {selectedTeeth.length > 0 && (
        <div className="inline-flex flex-wrap gap-1 ml-1.5 align-middle">
          {selectedTeeth.map((num) => (
            <span
              key={num}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded-full bg-primary/10 text-primary border border-primary/20"
            >
              {num}
              <button
                type="button"
                onClick={() => toggleTooth(num)}
                className="hover:text-primary/70"
                aria-label={`Remove tooth ${num}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 z-20 mt-2 p-2 sm:p-3 bg-white rounded-xl border border-gray-200 shadow-lg w-max max-w-[calc(100vw-2.5rem)] overflow-x-auto">
          <div className="flex justify-between mb-2">
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
              Close
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mb-1">Maxilla</p>
          <div className="space-y-1">
            {showPermanent && renderQuadrantRow(Q1, Q2, rowLabel('Permanent'))}
            {showPrimary && renderQuadrantRow(Q5, Q6, rowLabel('Primary'))}
          </div>
          <div className="border-t border-dashed border-gray-200 my-2" />
          <p className="text-[10px] text-gray-400 text-center mb-1">Mandible</p>
          <div className="space-y-1">
            {showPrimary && renderQuadrantRow(Q8, Q7, rowLabel('Primary'))}
            {showPermanent && renderQuadrantRow(Q4, Q3, rowLabel('Permanent'))}
          </div>
        </div>
      )}
    </div>
  )
}
