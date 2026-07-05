import { useEffect, useMemo, useRef, useState } from 'react'
import { Pill } from 'lucide-react'
import { DENTAL_DRUGS, type AgeDosing, type BDDrug, searchDrugs } from '@/lib/dentalDrugDatabase'

const FORM_ABBREVIATIONS: Record<string, string> = {
  Tab: 'Tab.',
  Cap: 'Cap.',
  Injection: 'Inj.',
  Ointment: 'Oint.',
  Solution: 'Sol.',
  Spray: 'Spray',
  Mouthwash: 'Mouthwash',
  'Mouthwash/Gargle': 'Gargle',
  Gel: 'Gel',
  'Oral suspension': 'Susp.',
  'Oral Paste': 'Paste',
  Suspension: 'Susp.',
  'Pediatric Drop': 'Drop',
}

function formatDrugName(drug: BDDrug): string {
  const match = drug.dosageForm.match(/^([\d.,]+\s*(?:mg|gm|ml|%|IU\/ml|IU)[^\s]*)\s*(.*)$/i)
  if (!match) {
    return `${drug.brand} ${drug.dosageForm}`.trim()
  }

  const strength = match[1].trim()
  const formWord = match[2].trim()
  const formLabel = FORM_ABBREVIATIONS[formWord] ?? formWord
  const strengthNum = strength.match(/[\d.]+/)?.[0]
  const brand = strengthNum ? drug.brand.replace(new RegExp(`[\\s-]*${strengthNum}%?$`), '').trim() : drug.brand

  return `${formLabel} ${brand} ${strength}`.replace(/\s+/g, ' ').trim()
}

interface DrugPickerProps {
  value: string
  onChange: (value: string) => void
  onDrugSelect: (drug: {
    name: string
    dosage: string
    frequency: string
    duration: string
    instructions: string
    route: string
    ageDosing: AgeDosing
    generic: string
    dosageForm: string
    drugKey: string
    category: BDDrug['category']
  }) => void
  className?: string
}

const CATEGORY_META: Record<
  BDDrug['category'],
  { bg: string; text: string }
> = {
  Antibiotic: { bg: '#E1F5EE', text: '#0F6E56' },
  Analgesic: { bg: '#FAECE7', text: '#993C1D' },
  'Anti-inflammatory': { bg: '#FAECE7', text: '#993C1D' },
  'Local anesthetic': { bg: '#EEEDFE', text: '#3C3489' },
  Antifungal: { bg: '#FAEEDA', text: '#854F0B' },
  Antiviral: { bg: '#E8F0FE', text: '#1A4DA1' },
  Antiseptic: { bg: '#EAF3DE', text: '#3B6D11' },
  Anxiolytic: { bg: '#FBEAF0', text: '#993556' },
  Steroid: { bg: '#E6F1FB', text: '#185FA5' },
  Antifibrinolytic: { bg: '#FDECEC', text: '#A12B2B' },
  'Anti-ulcerant': { bg: '#E9F7F1', text: '#1F7A5C' },
}

const CATEGORY_ORDER: BDDrug['category'][] = [
  'Antibiotic',
  'Analgesic',
  'Anti-inflammatory',
  'Local anesthetic',
  'Antifungal',
  'Antiviral',
  'Antiseptic',
  'Anxiolytic',
  'Steroid',
  'Antifibrinolytic',
  'Anti-ulcerant',
]

interface IndexedDrug {
  drug: BDDrug
  index: number
}

export function DrugPicker({ value, onChange, onDrugSelect, className }: DrugPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const defaultDrugList = useMemo(() => {
    return [...DENTAL_DRUGS].sort((a, b) => {
      const categoryCompare = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
      if (categoryCompare !== 0) return categoryCompare

      const genericCompare = a.generic.localeCompare(b.generic)
      if (genericCompare !== 0) return genericCompare

      return a.brand.localeCompare(b.brand)
    })
  }, [])

  const visibleDrugs = useMemo(() => {
    const trimmed = value.trim()
    if (!trimmed) {
      return defaultDrugList
    }

    const results = searchDrugs(trimmed)
    if (results.length > 0) {
      return results
    }

    // The field's value can be an already-selected drug's formatted display name
    // (e.g. "Tab. Rofuclav 250mg/125mg"), which won't substring-match the raw
    // brand/generic data. Fall back to the full directory instead of showing
    // a false "no drugs found" when that's the case.
    const isFormattedSelection = defaultDrugList.some((drug) => formatDrugName(drug) === trimmed)
    return isFormattedSelection ? defaultDrugList : results
  }, [value, defaultDrugList])

  const groupedDrugs = useMemo(() => {
    const indexed: IndexedDrug[] = visibleDrugs.map((drug, index) => ({ drug, index }))

    const groups = new Map<BDDrug['category'], Map<string, IndexedDrug[]>>()

    for (const item of indexed) {
      if (!groups.has(item.drug.category)) {
        groups.set(item.drug.category, new Map())
      }
      const categoryGroup = groups.get(item.drug.category)
      if (!categoryGroup) continue

      if (!categoryGroup.has(item.drug.generic)) {
        categoryGroup.set(item.drug.generic, [])
      }

      categoryGroup.get(item.drug.generic)?.push(item)
    }

    return groups
  }, [visibleDrugs])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [value, isOpen])

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

  const applyDrug = (drug: BDDrug) => {
    const name = formatDrugName(drug)

    onChange(name)
    onDrugSelect({
      name,
      dosage: drug.defaultDosage,
      frequency: drug.defaultFrequency,
      duration: drug.defaultDuration,
      instructions: drug.defaultInstructions,
      route: drug.defaultRoute,
      ageDosing: drug.ageDosing,
      generic: drug.generic,
      dosageForm: drug.dosageForm,
      drugKey: `${drug.brand}-${drug.company}-${drug.pack}`,
      category: drug.category,
    })
    setIsOpen(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown') {
        setIsOpen(true)
        event.preventDefault()
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (visibleDrugs.length === 0) return
      setHighlightedIndex((prev) => (prev + 1) % visibleDrugs.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (visibleDrugs.length === 0) return
      setHighlightedIndex((prev) => (prev - 1 + visibleDrugs.length) % visibleDrugs.length)
      return
    }

    if (event.key === 'Enter') {
      if (visibleDrugs.length === 0) return
      event.preventDefault()
      applyDrug(visibleDrugs[highlightedIndex])
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        type="text"
        placeholder="e.g., Amoxicillin 500mg"
        value={value}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
        }}
        onKeyDown={handleKeyDown}
        className={className}
      />

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Pill className="h-4 w-4 text-primary" />
              BD Drug Directory
            </div>
            <div className="text-xs text-gray-500">Bangladesh dental drug database · ≥10 brands per generic</div>
            <div className="mt-1 text-xs font-medium text-gray-600">{visibleDrugs.length} drugs found</div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {visibleDrugs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                No drugs found — type brand or generic name
              </div>
            ) : (
              CATEGORY_ORDER.map((category) => {
                const categoryGroup = groupedDrugs.get(category)
                if (!categoryGroup) return null

                return (
                  <div key={category} className="mb-3 last:mb-0">
                    <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</div>

                    {Array.from(categoryGroup.entries()).map(([generic, genericRows]) => (
                      <div key={`${category}-${generic}`} className="mb-2 last:mb-0">
                        <div className="px-1 text-[11px] font-medium text-gray-500">{generic}</div>
                        <div className="space-y-1">
                          {genericRows.map(({ drug, index }) => {
                            const isHighlighted = index === highlightedIndex
                            const color = CATEGORY_META[drug.category]
                            return (
                              <button
                                key={`${drug.brand}-${drug.company}-${drug.pack}`}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => applyDrug(drug)}
                                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                                  isHighlighted
                                    ? 'border-primary bg-primary/5'
                                    : 'border-gray-200 bg-white hover:border-primary/40 hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">{drug.brand}</span>
                                  <span
                                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                    style={{ backgroundColor: color.bg, color: color.text }}
                                  >
                                    {drug.category}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-600">
                                  {drug.generic} · {drug.dosageForm}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {drug.company} · {drug.priceLabel}
                                </div>
                                <div className="truncate text-[11px] text-gray-500">{drug.dentalUse}</div>
                                <div className="truncate text-[11px] text-gray-400">
                                  Adult: {drug.ageDosing.adult} · Child: {drug.ageDosing.child} · Infant: {drug.ageDosing.infant}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
