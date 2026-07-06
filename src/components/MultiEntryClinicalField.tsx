import { useState, useEffect } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ToothSelector } from '@/components/ToothSelector'
import { QuadrantSelector } from '@/components/QuadrantSelector'
import { type ClinicalEntry, createEmptyEntry } from '@/lib/clinicalEntries'
import { getMemory } from '@/lib/prescriptionMemory'
import type { SectionTemplate } from '@/lib/prescriptionSectionTemplates'
import type { DentitionType } from '@/lib/ageTier'

interface TemplatesConfig {
  list: Array<SectionTemplate<string>>
  show: boolean
  onToggleShow: () => void
  onSaveEntry: (text: string) => void
  accent: 'amber' | 'sky'
  emptyHint: string
}

interface MultiEntryClinicalFieldProps {
  label: string
  entries: ClinicalEntry[]
  onChange: (entries: ClinicalEntry[]) => void
  placeholder?: string
  helperText?: string
  templates?: TemplatesConfig
  memoryKey?: string
  // Teeth already mentioned in earlier sections (e.g. On Examination), offered
  // as one-tap chips on each entry so the same tooth needn't be re-picked.
  suggestedTeeth?: number[]
  // 'quadrant' picks a dental quadrant instead of an individual tooth — used for
  // Chief Complaint, which is usually described by area rather than an exact tooth.
  pickerMode?: 'tooth' | 'quadrant'
  // Age-based dentition (from getDentitionTypeFromDOB) so the tooth picker shows
  // primary/mixed/permanent teeth consistently with the patient's dental chart.
  dentitionType?: DentitionType
}

export function MultiEntryClinicalField({
  label,
  entries,
  onChange,
  placeholder,
  helperText,
  templates,
  memoryKey,
  suggestedTeeth,
  pickerMode = 'tooth',
  dentitionType,
}: MultiEntryClinicalFieldProps) {
  function updateEntry(id: string, patch: Partial<ClinicalEntry>) {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }

  function removeEntry(id: string) {
    const next = entries.filter((entry) => entry.id !== id)
    onChange(next.length > 0 ? next : [createEmptyEntry()])
  }

  function addEntry() {
    onChange([...entries, createEmptyEntry()])
  }

  function addEntryWithText(text: string) {
    onChange([...entries.filter((entry) => entry.text.trim()), { ...createEmptyEntry(), text }])
  }

  function applyTemplate(value: string) {
    addEntryWithText(value)
    templates?.onToggleShow()
  }

  const accent =
    templates?.accent === 'sky'
      ? { border: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-900', hover: 'hover:text-sky-700' }
      : { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-900', hover: 'hover:text-amber-700' }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label className="block text-sm font-semibold text-gray-700">{label}</label>
        {templates && (
          <div className="ml-auto flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={templates.onToggleShow}>
              <Lightbulb className="w-4 h-4 mr-1" />
              Templates ({templates.list.length})
            </Button>
          </div>
        )}
      </div>

      {templates?.show && (
        <div className={`mb-3 rounded-xl border ${accent.border} ${accent.bg} p-4 shadow-sm`}>
          <div className="mb-3 flex items-center justify-between">
            <h4 className={`font-semibold text-sm ${accent.text}`}>{label} Templates</h4>
            <button type="button" onClick={templates.onToggleShow} className={`text-gray-400 ${accent.hover}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
          {templates.list.length === 0 ? (
            <p className={`text-sm ${accent.text} opacity-80`}>{templates.emptyHint}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {templates.list.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template.value)}
                  className={`rounded-full border ${accent.border} bg-white px-3 py-1.5 text-left text-sm ${accent.text} hover:border-primary hover:text-primary`}
                >
                  {template.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry, idx) => (
          <div key={entry.id} className="rounded-lg border border-gray-200 p-2.5">
            <textarea
              rows={2}
              value={entry.text}
              onChange={(e) => updateEntry(entry.id, { text: e.target.value })}
              placeholder={idx === 0 ? placeholder : 'Add another...'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
            />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {pickerMode === 'quadrant' ? (
                <QuadrantSelector
                  selectedQuadrants={entry.quadrants ?? []}
                  onChange={(quadrants) => updateEntry(entry.id, { quadrants })}
                />
              ) : (
                <ToothSelector selectedTeeth={entry.teeth} onChange={(teeth) => updateEntry(entry.id, { teeth })} dentitionType={dentitionType} />
              )}
              {suggestedTeeth &&
                suggestedTeeth
                  .filter((num) => !entry.teeth.includes(num))
                  .map((num) => (
                    <button
                      key={num}
                      type="button"
                      title="Suggested from earlier in this prescription — click to add"
                      onClick={() =>
                        updateEntry(entry.id, { teeth: [...entry.teeth, num].sort((a, b) => a - b) })
                      }
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-full border border-dashed border-primary/40 text-primary/70 hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      + {num}
                    </button>
                  ))}
              {templates && (
                <button
                  type="button"
                  onClick={() => entry.text.trim() && templates.onSaveEntry(entry.text)}
                  disabled={!entry.text.trim()}
                  className="text-xs text-gray-500 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save as template
                </button>
              )}
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="ml-auto text-xs text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addEntry} className="mt-2 text-xs font-medium text-primary hover:text-primary-hover">
        + Add another
      </button>

      {helperText && <p className="text-xs text-gray-400 mt-1">{helperText}</p>}

      {memoryKey && <MemoryChips memoryKey={memoryKey} onSelect={addEntryWithText} />}
    </div>
  )
}

function MemoryChips({ memoryKey, onSelect }: { memoryKey: string; onSelect: (val: string) => void }) {
  const [items, setItems] = useState<string[]>([])
  useEffect(() => {
    setItems(getMemory(memoryKey).slice(0, 8))
  }, [memoryKey])
  if (items.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onSelect(item)}
          className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full border border-gray-200 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
        >
          {item.length > 40 ? item.slice(0, 40) + '…' : item}
        </button>
      ))}
    </div>
  )
}
