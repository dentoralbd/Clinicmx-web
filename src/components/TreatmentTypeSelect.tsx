import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Search } from 'lucide-react'
import { listTreatmentCatalogItems, type TreatmentCatalogItem } from '@/lib/catalog'

interface TreatmentTypeSelectProps {
  value: string
  /** `item` is the matched catalog row (e.g. for reading `default_fee`), undefined for the blank option or a legacy value not in the catalog. */
  onChange: (value: string, item?: TreatmentCatalogItem) => void
  required?: boolean
  className?: string
  id?: string
}

/**
 * Drop-in replacement for the plain treatment-type <select>, grouped by
 * catalog category. A native <select> renders as a bare full-screen radio
 * list on mobile with no search — this is a custom dropdown (same
 * interaction pattern as DrugPicker) with a search box and category
 * headers, for a usable list once the Catalog has more than a handful of
 * procedures. Renders the current value as a standalone option if it
 * doesn't match any catalog item (old free-text data) so existing rows
 * never silently blank out — mirrors the DrugPicker "missing category" bug
 * class documented in CLAUDE.md.
 */
export function TreatmentTypeSelect({ value, onChange, required, className, id }: TreatmentTypeSelectProps) {
  const { data: items = [] } = useQuery({ queryKey: ['treatmentCatalogItems'], queryFn: listTreatmentCatalogItems })

  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isOpen) {
      setSearch('')
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [isOpen])

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const isLegacyValue = value && !items.some((item) => item.name === value)

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) => item.name.toLowerCase().includes(q) || (item.category?.name ?? '').toLowerCase().includes(q)
    )
  }, [items, search])

  const groups = useMemo(() => {
    const map = new Map<string, TreatmentCatalogItem[]>()
    for (const item of visibleItems) {
      const categoryName = item.category?.name ?? 'Uncategorized'
      if (!map.has(categoryName)) map.set(categoryName, [])
      map.get(categoryName)?.push(item)
    }
    return map
  }, [visibleItems])

  function pick(item: TreatmentCatalogItem) {
    onChange(item.name, item)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      {/* Native, visually-hidden input so `required` still blocks form submit
          on an empty value with the browser's usual validation UI. */}
      <input
        type="text"
        tabIndex={-1}
        value={value}
        required={required}
        readOnly
        aria-hidden="true"
        onFocus={() => {
          setIsOpen(true)
          requestAnimationFrame(() => searchRef.current?.focus())
        }}
        className="sr-only absolute"
      />
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`${className ?? ''} flex items-center justify-between gap-2 text-left`}
      >
        <span className={value ? '' : 'text-gray-400'}>{value || 'Select type'}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="relative border-b border-gray-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsOpen(false)
              }}
              placeholder="Search procedures..."
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {isLegacyValue && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="mb-1 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-left text-sm text-gray-600"
              >
                {value} <span className="text-xs text-gray-400">(current — not in Catalog)</span>
              </button>
            )}

            {visibleItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-gray-400">No procedures found</div>
            ) : (
              Array.from(groups.entries()).map(([categoryName, categoryItems]) => (
                <div key={categoryName} className="mb-2 last:mb-0">
                  <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{categoryName}</div>
                  {categoryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pick(item)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        item.name === value ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-50 text-gray-800'
                      }`}
                    >
                      {item.name}
                      {item.default_fee != null && <span className="ml-2 text-xs text-gray-400">৳{item.default_fee}</span>}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
