import { useState } from 'react'
import type { DentitionType } from '@/lib/ageTier'
import { AnatomicArch } from '@/components/dental/AnatomicArch'
import { getFDIToothName } from '@/lib/fdiChart'

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
          <AnatomicArch
            compact
            dentitionType={dentitionType}
            onToothClick={toggleTooth}
            isSelected={(num) => selectedTeeth.includes(num)}
            getToothTitle={(num) => `#${num} — ${getFDIToothName(num)}`}
            renderToothBody={(def, num) => (
              <g
                className={
                  selectedTeeth.includes(num)
                    ? 'fill-primary/25 stroke-primary'
                    : 'fill-white stroke-gray-300 group-hover:stroke-primary/60'
                }
                strokeWidth={1.2}
                strokeLinejoin="round"
              >
                {def.secondaryRootPath && <path d={def.secondaryRootPath} className="fill-gray-100" />}
                <path d={def.rootPath} />
                <path d={def.cervicalCurve} className="fill-none stroke-gray-300" strokeWidth={0.8} />
                <path d={def.crownPath} />
              </g>
            )}
          />
        </div>
      )}
    </div>
  )
}
