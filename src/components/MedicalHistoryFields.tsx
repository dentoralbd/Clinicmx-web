import { Fragment } from 'react'
import { MEDICAL_HISTORY_LABELS } from '@/lib/medicalHistory'

interface MedicalHistoryFieldsProps {
  checked: string[]
  other: string
  drugHistoryNote: string
  onChange: (next: { checked: string[]; other: string; drugHistoryNote: string }) => void
}

export function MedicalHistoryFields({ checked, other, drugHistoryNote, onChange }: MedicalHistoryFieldsProps) {
  function toggleLabel(label: string) {
    const nextChecked = checked.includes(label) ? checked.filter((l) => l !== label) : [...checked, label]
    onChange({
      checked: nextChecked,
      other,
      drugHistoryNote: label === 'Drug History' && !nextChecked.includes('Drug History') ? '' : drugHistoryNote,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        {MEDICAL_HISTORY_LABELS.map((label) => {
          const isChecked = checked.includes(label)
          const checkboxLabel = (
            <label className="flex items-start gap-2 text-sm leading-snug cursor-pointer">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleLabel(label)}
                className="mt-0.5 w-4 h-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
              />
              {label}
            </label>
          )

          if (label !== 'Drug History') {
            return <Fragment key={label}>{checkboxLabel}</Fragment>
          }

          return (
            <Fragment key={label}>
              {checkboxLabel}
              {isChecked && (
                <input
                  type="text"
                  value={drugHistoryNote}
                  onChange={(e) => onChange({ checked, other, drugHistoryNote: e.target.value })}
                  placeholder="Drug name(s) & dosage"
                  autoFocus
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </Fragment>
          )
        })}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Other</label>
        <input
          type="text"
          value={other}
          onChange={(e) => onChange({ checked, other: e.target.value, drugHistoryNote })}
          placeholder="Any other condition not listed above..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </div>
  )
}
