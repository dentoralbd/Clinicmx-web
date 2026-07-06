import { useState } from 'react'
import type { DentitionType } from '@/lib/ageTier'
import { ArchDentalChart } from '@/components/ArchDentalChart'

interface ToothSelectorProps {
  selectedTeeth: number[]
  onChange: (teeth: number[]) => void
  dentitionType?: DentitionType
}

export function ToothSelector({ selectedTeeth, onChange, dentitionType = 'permanent' }: ToothSelectorProps) {
  const [open, setOpen] = useState(false)

  function toggleTooth(num: number) {
    if (selectedTeeth.includes(num)) {
      onChange(selectedTeeth.filter((n) => n !== num))
    } else {
      onChange([...selectedTeeth, num].sort((a, b) => a - b))
    }
  }

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
        <div className="absolute left-0 z-20 mt-2 p-2 sm:p-3 bg-white rounded-xl border border-gray-200 shadow-lg w-[280px] max-w-[calc(100vw-2.5rem)] max-h-[70vh] overflow-y-auto">
          <div className="flex justify-between mb-1">
            <button type="button" onClick={() => setOpen(false)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
              Close
            </button>
          </div>
          <ArchDentalChart
            compact
            dentitionType={dentitionType}
            getToothClass={(num) =>
              selectedTeeth.includes(num)
                ? 'fill-primary/20 stroke-primary'
                : 'fill-gray-50 stroke-gray-300 hover:stroke-primary/50'
            }
            onToothClick={toggleTooth}
          />
        </div>
      )}
    </div>
  )
}
