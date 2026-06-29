import { MEDICAL_HISTORY_LABELS } from '@/lib/medicalHistory'

interface MedicalHistoryFieldsProps {
  checked: string[]
  other: string
  onChange: (next: { checked: string[]; other: string }) => void
}

export function MedicalHistoryFields({ checked, other, onChange }: MedicalHistoryFieldsProps) {
  function toggleLabel(label: string) {
    onChange({
      checked: checked.includes(label) ? checked.filter((l) => l !== label) : [...checked, label],
      other,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {MEDICAL_HISTORY_LABELS.map((label) => (
          <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={checked.includes(label)}
              onChange={() => toggleLabel(label)}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            {label}
          </label>
        ))}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Other</label>
        <input
          type="text"
          value={other}
          onChange={(e) => onChange({ checked, other: e.target.value })}
          placeholder="Any other condition not listed above..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </div>
  )
}
