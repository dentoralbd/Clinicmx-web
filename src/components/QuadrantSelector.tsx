import { useState } from 'react'
import { QUADRANTS } from '@/lib/clinicalEntries'

// Render order mirrors ToothSelector's spatial layout: patient's right shown on
// screen-left. Top row = maxilla (UR, UL), bottom row = mandible (LR, LL).
const GRID_ORDER = [1, 2, 4, 3]

interface QuadrantSelectorProps {
  selectedQuadrants: number[]
  onChange: (quadrants: number[]) => void
}

export function QuadrantSelector({ selectedQuadrants, onChange }: QuadrantSelectorProps) {
  const [open, setOpen] = useState(false)

  function toggleQuadrant(code: number) {
    if (selectedQuadrants.includes(code)) {
      onChange(selectedQuadrants.filter((c) => c !== code))
    } else {
      onChange([...selectedQuadrants, code].sort((a, b) => a - b))
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors"
      >
        🦷 {selectedQuadrants.length > 0 ? selectedQuadrants.map((c) => QUADRANTS.find((q) => q.code === c)?.abbr).join(', ') : 'Quadrant'}
      </button>

      {selectedQuadrants.length > 0 && (
        <div className="inline-flex flex-wrap gap-1 ml-1.5 align-middle">
          {selectedQuadrants.map((code) => {
            const q = QUADRANTS.find((x) => x.code === code)
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded-full bg-primary/10 text-primary border border-primary/20"
              >
                {q?.abbr}
                <button
                  type="button"
                  onClick={() => toggleQuadrant(code)}
                  className="hover:text-primary/70"
                  aria-label={`Remove ${q?.label}`}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-2 p-3 bg-white rounded-xl border border-gray-200 shadow-lg w-max">
          <div className="flex justify-between mb-2">
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 w-40">
            {GRID_ORDER.map((code) => {
              const q = QUADRANTS.find((x) => x.code === code)!
              return (
                <button
                  key={q.code}
                  type="button"
                  onClick={() => toggleQuadrant(q.code)}
                  className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    selectedQuadrants.includes(q.code)
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'border-gray-200 text-gray-600 hover:border-primary/50'
                  }`}
                >
                  {q.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
