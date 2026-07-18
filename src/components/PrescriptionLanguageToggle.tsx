import type { PrescriptionLanguage } from '@/lib/medicationBengali'

interface PrescriptionLanguageToggleProps {
  value: PrescriptionLanguage
  onChange: (language: PrescriptionLanguage) => void
}

// Controls which language freshly-picked drug defaults (dosage/frequency/duration/
// instructions/route) are written into the form as. Doesn't retranslate rows already
// in the medications list — matches the existing entry-time-only translation model.
export function PrescriptionLanguageToggle({ value, onChange }: PrescriptionLanguageToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
      {(['bn', 'en'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === lang ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          {lang === 'bn' ? 'বাংলা' : 'English'}
        </button>
      ))}
    </div>
  )
}
