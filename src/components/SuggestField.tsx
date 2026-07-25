import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, X, History } from 'lucide-react'
import { getMemory, rememberItem, removeMemoryItem } from '@/lib/prescriptionMemory'
import { PRESETS_BY_MEMORY_KEY } from '@/lib/clinicalTextPresets'

interface ClinicalSuggestInputProps {
  // localStorage key from MEMORY_KEYS this field's history is stored/shared under.
  memoryKey: string
  // Shown as a small subtitle on each suggestion row, e.g. "Visit Notes".
  sectionLabel: string
  placeholder?: string
  // Seeded starter options shown alongside remembered history. Defaults to
  // the built-in list for this memoryKey (PRESETS_BY_MEMORY_KEY) if omitted.
  presets?: string[]
  onAdd: (text: string) => void
  // Runs once on mount only when memory for this key is currently empty —
  // used to seed history from existing DB rows on first use of a field.
  bootstrap?: () => Promise<void>
}

/**
 * Shukhi-style type-to-filter suggestion picker: a search box that filters
 * previously-entered text (remembered via prescriptionMemory.ts) and preset
 * options in a dropdown, with a "+" to commit free text and a collapsible
 * "Recent Written History" list for deleting bad entries. Structure mirrors
 * src/components/DrugPicker.tsx (outside-click close, arrow-key navigation,
 * onMouseDown preventDefault on rows to keep focus).
 *
 * This component only decides what to suggest/remember — where the picked
 * text goes is entirely up to the caller's onAdd. See SuggestTextarea /
 * SuggestTextInput below for the common "append above an existing field"
 * wiring used at most call sites.
 */
export function ClinicalSuggestInput({
  memoryKey,
  sectionLabel,
  placeholder,
  presets,
  onAdd,
  bootstrap,
}: ClinicalSuggestInputProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [memoryItems, setMemoryItems] = useState<string[]>(() => getMemory(memoryKey))

  const refreshMemory = () => setMemoryItems(getMemory(memoryKey))

  useEffect(() => {
    refreshMemory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryKey])

  useEffect(() => {
    if (!bootstrap || memoryItems.length > 0) return
    let cancelled = false
    ;(async () => {
      await bootstrap()
      if (!cancelled) refreshMemory()
    })()
    return () => {
      cancelled = true
    }
    // Only run once on mount / when memory is confirmed empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const effectivePresets = presets ?? PRESETS_BY_MEMORY_KEY[memoryKey] ?? []

  const sourceList = useMemo(() => {
    const seen = new Set<string>()
    const combined: string[] = []
    for (const item of [...memoryItems, ...effectivePresets]) {
      const key = item.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      combined.push(item)
    }
    return combined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryItems, effectivePresets])

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    const list = trimmed ? sourceList.filter((item) => item.toLowerCase().includes(trimmed)) : sourceList
    return list.slice(0, 8)
  }, [query, sourceList])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [query, isOpen])

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current && !rootRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function commit(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd(trimmed)
    rememberItem(memoryKey, trimmed)
    refreshMemory()
    setQuery('')
    setIsOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (event.key === 'ArrowDown') {
        setIsOpen(true)
        event.preventDefault()
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (filtered.length === 0) return
      setHighlightedIndex((prev) => (prev + 1) % filtered.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (filtered.length === 0) return
      setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (filtered.length > 0) {
        commit(filtered[highlightedIndex])
      } else if (query.trim()) {
        commit(query)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  function handleRemove(item: string) {
    removeMemoryItem(memoryKey, item)
    refreshMemory()
  }

  return (
    <div className="relative" ref={rootRef}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            placeholder={placeholder ?? 'Search or type...'}
            onFocus={() => setIsOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
            }}
            onKeyDown={handleKeyDown}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => commit(query)}
          disabled={!query.trim()}
          title="Add"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="max-h-72 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500">
                No matches — press Enter or tap + to add "{query.trim()}"
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((item, index) => (
                  <button
                    key={`${item}-${index}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commit(item)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      index === highlightedIndex
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 bg-white hover:border-primary/40 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm text-gray-800">{item}</div>
                    <div className="text-[11px] text-gray-400">{sectionLabel}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {memoryItems.length > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
          >
            <History className="h-3 w-3" />
            {showHistory ? 'Hide' : '+'} Recent Written History
          </button>
          {showHistory && (
            <div className="mt-1.5 space-y-1 rounded-lg border border-gray-100 bg-gray-50 p-1.5">
              {memoryItems.slice(0, 10).map((item, idx) => (
                <div
                  key={`${item}-${idx}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white"
                >
                  <button
                    type="button"
                    title={item}
                    onClick={() => commit(item)}
                    className="flex-1 truncate text-left text-xs text-gray-600"
                  >
                    {item.length > 60 ? item.slice(0, 60) + '…' : item}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    title="Remove from history"
                    className="flex-shrink-0 text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SuggestWrapperCommonProps {
  memoryKey: string
  sectionLabel?: string
  presets?: string[]
  bootstrap?: () => Promise<void>
}

type SuggestTextareaProps = SuggestWrapperCommonProps &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    value: string
    onChange: (event: { target: { value: string } }) => void
  }

/**
 * Drop-in replacement for a plain <textarea>: renders the suggestion picker
 * above the textarea, appends picked/typed text as a new line, and passes
 * every other prop straight through so existing call sites (className, rows,
 * value, onChange) don't need to change shape. Also remembers whatever the
 * doctor types directly into the textarea (not just picked suggestions) once
 * they blur, so typed-only text accumulates into history too.
 */
export function SuggestTextarea({
  memoryKey,
  sectionLabel,
  presets,
  bootstrap,
  value,
  onChange,
  placeholder,
  onBlur,
  ...rest
}: SuggestTextareaProps) {
  function append(text: string) {
    const current = value?.trim() ? `${value.trim()}\n${text}` : text
    onChange({ target: { value: current } })
  }

  function handleBlur(event: React.FocusEvent<HTMLTextAreaElement>) {
    if (value?.trim()) rememberItem(memoryKey, value.trim())
    onBlur?.(event)
  }

  return (
    <div>
      <ClinicalSuggestInput
        memoryKey={memoryKey}
        sectionLabel={sectionLabel ?? 'Suggestions'}
        placeholder={placeholder ? `Search or type: ${placeholder}` : 'Search or type...'}
        presets={presets}
        onAdd={append}
        bootstrap={bootstrap}
      />
      <textarea
        {...rest}
        value={value}
        onChange={(event) => onChange(event)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`mt-2 ${rest.className ?? ''}`}
      />
    </div>
  )
}

type SuggestTextInputProps = SuggestWrapperCommonProps &
  React.InputHTMLAttributes<HTMLInputElement> & {
    value: string
    onChange: (event: { target: { value: string } }) => void
  }

/**
 * Drop-in replacement for a plain single-line <input>: picking a suggestion
 * replaces the field's value outright (single-line fields don't accumulate
 * multiple entries the way notes textareas do).
 */
export function SuggestTextInput({
  memoryKey,
  sectionLabel,
  presets,
  bootstrap,
  value,
  onChange,
  placeholder,
  onBlur,
  ...rest
}: SuggestTextInputProps) {
  function apply(text: string) {
    onChange({ target: { value: text } })
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (value?.trim()) rememberItem(memoryKey, value.trim())
    onBlur?.(event)
  }

  return (
    <div>
      <ClinicalSuggestInput
        memoryKey={memoryKey}
        sectionLabel={sectionLabel ?? 'Suggestions'}
        placeholder={placeholder ? `Search or type: ${placeholder}` : 'Search or type...'}
        presets={presets}
        onAdd={apply}
        bootstrap={bootstrap}
      />
      <input
        {...rest}
        type="text"
        value={value}
        onChange={(event) => onChange(event)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`mt-2 ${rest.className ?? ''}`}
      />
    </div>
  )
}
