import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { History, X } from 'lucide-react'
import { getMemory, rememberItem, removeMemoryItem } from '@/lib/prescriptionMemory'
import { PRESETS_BY_MEMORY_KEY } from '@/lib/clinicalTextPresets'

// ─────────────────────────────────────────────────────────────────────────
// Shared suggestion-list state: what to offer, and how to remember/forget.
// Lifted out of the old standalone ClinicalSuggestInput so both wrappers
// below can attach a dropdown directly to the real field instead of
// stacking a second search box above it.
// ─────────────────────────────────────────────────────────────────────────

function useSuggestions(memoryKey: string, presets: string[] | undefined, bootstrap?: () => Promise<void>) {
  const [memoryItems, setMemoryItems] = useState<string[]>(() => getMemory(memoryKey))

  const refresh = () => setMemoryItems(getMemory(memoryKey))

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryKey])

  useEffect(() => {
    if (!bootstrap || memoryItems.length > 0) return
    let cancelled = false
    ;(async () => {
      await bootstrap()
      if (!cancelled) refresh()
    })()
    return () => {
      cancelled = true
    }
    // Only run once on mount / when memory is confirmed empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const effectivePresets = presets ?? PRESETS_BY_MEMORY_KEY[memoryKey] ?? []

  // Combined list, memory first (most-recent-first, already deduped by
  // rememberItem), then presets — deduped case-insensitively against memory.
  const sourceList = useMemo(() => {
    const seen = new Set<string>()
    const combined: Array<{ text: string; fromMemory: boolean }> = []
    for (const item of memoryItems) {
      const key = item.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      combined.push({ text: item, fromMemory: true })
    }
    for (const item of effectivePresets) {
      const key = item.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      combined.push({ text: item, fromMemory: false })
    }
    return combined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryItems, effectivePresets])

  function remove(item: string) {
    removeMemoryItem(memoryKey, item)
    refresh()
  }

  return { memoryItems, sourceList, remove }
}

function filterSuggestions(sourceList: Array<{ text: string; fromMemory: boolean }>, query: string) {
  const trimmed = query.trim().toLowerCase()
  const list = trimmed ? sourceList.filter((item) => item.text.toLowerCase().includes(trimmed)) : sourceList
  return list.slice(0, 8)
}

// ─────────────────────────────────────────────────────────────────────────
// Dropdown panel — attaches directly under (or above, if short on room)
// the field it belongs to. Only rendered when there's something to show.
// ─────────────────────────────────────────────────────────────────────────

interface SuggestionDropdownProps {
  items: Array<{ text: string; fromMemory: boolean }>
  highlightedIndex: number
  openUpward: boolean
  onPick: (text: string) => void
  onRemove: (text: string) => void
  sectionLabel?: string
}

function SuggestionDropdown({ items, highlightedIndex, openUpward, onPick, onRemove, sectionLabel }: SuggestionDropdownProps) {
  if (items.length === 0) return null
  return (
    <div
      aria-label={sectionLabel}
      className={`absolute left-0 right-0 z-50 rounded-xl border border-gray-200 bg-white shadow-xl ${
        openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
        {items.map((item, index) => (
          <div
            key={`${item.text}-${index}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item.text)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm cursor-pointer transition-colors ${
              index === highlightedIndex
                ? 'border-primary bg-primary/5'
                : 'border-transparent hover:bg-gray-50'
            }`}
          >
            <span className="flex-1 line-clamp-2 break-words leading-snug text-gray-800" title={item.text}>
              {item.text}
            </span>
            {item.fromMemory && (
              <button
                type="button"
                title="Remove from history"
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onRemove(item.text)
                }}
                className="flex-shrink-0 text-gray-300 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Measures whether there's enough room below the anchor to open downward;
// flips upward when a field sits low in a long scrolling modal (the main
// mobile fix — otherwise the dropdown opens under the keyboard).
function useOpenUpward(anchorRef: React.RefObject<HTMLElement>, isOpen: boolean) {
  const [openUpward, setOpenUpward] = useState(false)
  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setOpenUpward(window.innerHeight - rect.bottom < 320)
  }, [isOpen, anchorRef])
  return openUpward
}

// ─────────────────────────────────────────────────────────────────────────
// Public wrappers — drop-in replacements for <textarea> / <input> that
// attach the suggestion dropdown directly to the field. All existing call
// sites (memoryKey, sectionLabel, presets, bootstrap, plus every native
// prop) keep working unchanged.
// ─────────────────────────────────────────────────────────────────────────

interface SuggestWrapperCommonProps {
  memoryKey: string
  sectionLabel?: string
  presets?: string[]
  bootstrap?: () => Promise<void>
}

type SuggestTextareaProps = SuggestWrapperCommonProps &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'onSelect' | 'value'> & {
    value: string
    onChange: (event: { target: { value: string } }) => void
  }

/**
 * Drop-in replacement for a plain <textarea>. The textarea itself is the
 * search box: the dropdown filters by the *current line* (text between the
 * last newline before the caret and the caret), and picking a suggestion
 * replaces just that line — other lines are left alone, so a multi-line
 * Notes field can still accumulate several remembered lines one at a time.
 *
 * Enter only applies a suggestion when a row has been explicitly arrowed
 * onto (highlightedIndex >= 0); otherwise Enter behaves like a normal
 * textarea and inserts a newline.
 */
export function SuggestTextarea({
  memoryKey,
  sectionLabel,
  presets,
  bootstrap,
  value,
  onChange,
  placeholder,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: SuggestTextareaProps) {
  const { sourceList, remove } = useSuggestions(memoryKey, presets, bootstrap)
  const anchorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [caretPos, setCaretPos] = useState(0)
  const openUpward = useOpenUpward(anchorRef, isOpen)

  function currentLineBounds(text: string, caret: number) {
    const lineStart = text.lastIndexOf('\n', caret - 1) + 1
    let lineEnd = text.indexOf('\n', caret)
    if (lineEnd === -1) lineEnd = text.length
    return { lineStart, lineEnd }
  }

  const query = useMemo(() => {
    const { lineStart, lineEnd } = currentLineBounds(value ?? '', caretPos)
    return (value ?? '').slice(lineStart, lineEnd)
  }, [value, caretPos])

  const filtered = useMemo(() => filterSuggestions(sourceList, query), [sourceList, query])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [query, isOpen])

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function trackCaret(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    setCaretPos(event.currentTarget.selectionStart ?? 0)
  }

  function applySuggestion(text: string) {
    const current = value ?? ''
    const { lineStart, lineEnd } = currentLineBounds(current, caretPos)
    const next = current.slice(0, lineStart) + text + current.slice(lineEnd)
    onChange({ target: { value: next } })
    rememberItem(memoryKey, text)
    setIsOpen(false)
    setHighlightedIndex(-1)
    const newCaret = lineStart + text.length
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(newCaret, newCaret)
      setCaretPos(newCaret)
    })
  }

  function handleFocus(event: React.FocusEvent<HTMLTextAreaElement>) {
    trackCaret(event)
    if (!value?.trim() && sourceList.length > 0) setIsOpen(true)
    onFocus?.(event)
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(event)
    trackCaret(event)
    setIsOpen(true)
  }

  function handleBlur(event: React.FocusEvent<HTMLTextAreaElement>) {
    for (const line of (value ?? '').split('\n')) {
      if (line.trim()) rememberItem(memoryKey, line.trim())
    }
    setIsOpen(false)
    onBlur?.(event)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    trackCaret(event)
    if (isOpen && filtered.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev + 1) % filtered.length)
        onKeyDown?.(event)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
        onKeyDown?.(event)
        return
      }
      if (event.key === 'Enter' && highlightedIndex >= 0) {
        event.preventDefault()
        applySuggestion(filtered[highlightedIndex].text)
        onKeyDown?.(event)
        return
      }
      if (event.key === 'Escape') {
        setIsOpen(false)
        onKeyDown?.(event)
        return
      }
    }
    onKeyDown?.(event)
  }

  return (
    <div className="relative" ref={anchorRef}>
      <div className="relative">
        <textarea
          {...rest}
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onSelect={trackCaret}
          onClick={trackCaret}
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

type SuggestTextInputProps = SuggestWrapperCommonProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: string
    onChange: (event: { target: { value: string } }) => void
  }

/**
 * Drop-in replacement for a plain single-line <input>. Picking a suggestion
 * replaces the field's value outright.
 */
export function SuggestTextInput({
  memoryKey,
  sectionLabel,
  presets,
  bootstrap,
  value,
  onChange,
  placeholder,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: SuggestTextInputProps) {
  const { sourceList, remove } = useSuggestions(memoryKey, presets, bootstrap)
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
    onChange({ target: { value: text } })
    rememberItem(memoryKey, text)
    setIsOpen(false)
    setHighlightedIndex(-1)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function handleFocus(event: React.FocusEvent<HTMLInputElement>) {
    if (!value?.trim() && sourceList.length > 0) setIsOpen(true)
    onFocus?.(event)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event)
    setIsOpen(true)
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (value?.trim()) rememberItem(memoryKey, value.trim())
    setIsOpen(false)
    onBlur?.(event)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (isOpen && filtered.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev + 1) % filtered.length)
        onKeyDown?.(event)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
        onKeyDown?.(event)
        return
      }
      if (event.key === 'Enter' && highlightedIndex >= 0) {
        event.preventDefault()
        applySuggestion(filtered[highlightedIndex].text)
        onKeyDown?.(event)
        return
      }
      if (event.key === 'Escape') {
        setIsOpen(false)
        onKeyDown?.(event)
        return
      }
    }
    onKeyDown?.(event)
  }

  return (
    <div className="relative" ref={anchorRef}>
      <div className="relative">
        <input
          {...rest}
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {sourceList.length > 0 && (
          <button
            type="button"
            title="Show suggestions"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setIsOpen((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-primary"
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

// Exported for MultiEntryClinicalField, which attaches the dropdown to
// per-entry textareas itself (picking replaces the whole entry, not a line).
export { useSuggestions, filterSuggestions, SuggestionDropdown, useOpenUpward }
