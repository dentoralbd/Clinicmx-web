import { useEffect, useMemo, useRef, useState } from 'react'
import { Lightbulb, X, History } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ToothSelector } from '@/components/ToothSelector'
import { QuadrantSelector } from '@/components/QuadrantSelector'
import { type ClinicalEntry, createEmptyEntry } from '@/lib/clinicalEntries'
import { useSuggestions, filterSuggestions, SuggestionDropdown, useOpenUpward } from '@/components/SuggestField'
import { rememberItem } from '@/lib/prescriptionMemory'
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
  // Real Catalog procedure names (Treatment Plan only) offered in the same
  // suggestion dropdown as memory history — picking one sets the entry's text
  // to the exact Catalog name, which mapEntryToOperation then matches back to
  // that procedure (treatment_type + default_fee) when the prescription saves.
  catalogPresets?: string[]
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
  catalogPresets,
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
            {memoryKey ? (
              <EntrySuggestTextarea
                memoryKey={memoryKey}
                sectionLabel={label}
                value={entry.text}
                onChange={(text) => updateEntry(entry.id, { text })}
                placeholder={idx === 0 ? placeholder : 'Add another...'}
                presets={catalogPresets}
              />
            ) : (
              <textarea
                rows={2}
                value={entry.text}
                onChange={(e) => updateEntry(entry.id, { text: e.target.value })}
                placeholder={idx === 0 ? placeholder : 'Add another...'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
              />
            )}
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
    </div>
  )
}

// Attaches the shared suggestion dropdown directly to one entry's textarea.
// Unlike SuggestTextarea (used for free-form notes fields, where each line
// is its own suggestion), a clinical entry is one concept — picking a
// suggestion replaces the entry's whole text, and blur remembers it whole.
function EntrySuggestTextarea({
  memoryKey,
  sectionLabel,
  value,
  onChange,
  placeholder,
  presets,
}: {
  memoryKey: string
  sectionLabel: string
  value: string
  onChange: (text: string) => void
  placeholder?: string
  presets?: string[]
}) {
  const { sourceList, remove } = useSuggestions(memoryKey, presets)
  const anchorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const openUpward = useOpenUpward(anchorRef, isOpen)

  const filtered = useMemo(() => filterSuggestions(sourceList, value ?? ''), [sourceList, value])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [value, isOpen])

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function applySuggestion(text: string) {
    onChange(text)
    rememberItem(memoryKey, text)
    setIsOpen(false)
    setHighlightedIndex(-1)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function handleFocus() {
    if (!value?.trim() && sourceList.length > 0) setIsOpen(true)
  }

  function handleBlur() {
    if (value?.trim()) rememberItem(memoryKey, value.trim())
    setIsOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isOpen && filtered.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev + 1) % filtered.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
        return
      }
      if (event.key === 'Enter' && highlightedIndex >= 0) {
        event.preventDefault()
        applySuggestion(filtered[highlightedIndex].text)
        return
      }
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
  }

  return (
    <div className="relative" ref={anchorRef}>
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-7 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
        />
        {sourceList.length > 0 && (
          <button
            type="button"
            title="Show suggestions"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setIsOpen((prev) => !prev)}
            className="absolute right-2 top-2 text-gray-300 hover:text-primary"
          >
            <History className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isOpen && (
        <SuggestionDropdown
          items={filtered}
          highlightedIndex={highlightedIndex}
          openUpward={openUpward}
          onPick={applySuggestion}
          onRemove={remove}
          sectionLabel={sectionLabel}
        />
      )}
    </div>
  )
}
