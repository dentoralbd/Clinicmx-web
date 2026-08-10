import { useQuery } from '@tanstack/react-query'
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
 * catalog category. Renders the current value as a standalone option if it
 * doesn't match any catalog item (old free-text data) so existing rows never
 * silently blank out — mirrors the DrugPicker "missing category" bug class
 * documented in CLAUDE.md.
 */
export function TreatmentTypeSelect({ value, onChange, required, className, id }: TreatmentTypeSelectProps) {
  const { data: items = [] } = useQuery({ queryKey: ['treatmentCatalogItems'], queryFn: listTreatmentCatalogItems })

  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const categoryName = item.category?.name ?? 'Uncategorized'
    if (!groups.has(categoryName)) groups.set(categoryName, [])
    groups.get(categoryName)?.push(item)
  }

  const isLegacyValue = value && !items.some((item) => item.name === value)

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value, items.find((item) => item.name === e.target.value))}
      required={required}
      className={className}
    >
      <option value="">Select type</option>
      {isLegacyValue && <option value={value}>{value}</option>}
      {Array.from(groups.entries()).map(([categoryName, categoryItems]) => (
        <optgroup key={categoryName} label={categoryName}>
          {categoryItems.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
