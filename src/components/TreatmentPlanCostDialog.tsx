import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { ClinicalEntry } from '@/lib/clinicalEntries'

interface TreatmentPlanCostDialogProps {
  entries: ClinicalEntry[]
  initialCosts: Record<string, string>
  onConfirm: (costs: Record<string, string>) => void
  onCancel: () => void
}

// Shown when saving a prescription that has treatment plan entries. Each entry
// becomes a Planned treatment row (one per tooth); a cost entered here is saved
// on those rows so it shows everywhere (Operations, Add Visit, invoicing).
// "Add costs later" is the explicit confirmation that costs stay unset for now.
export function TreatmentPlanCostDialog({
  entries,
  initialCosts,
  onConfirm,
  onCancel,
}: TreatmentPlanCostDialogProps) {
  const [costs, setCosts] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {}
    for (const entry of entries) {
      seeded[entry.id] = initialCosts[entry.id] ?? ''
    }
    return seeded
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm(costs)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3 sm:p-4 overflow-y-auto">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-full sm:max-w-lg w-full my-4 sm:my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-3 sm:p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Treatment Plan Costs</h3>
          <p className="text-sm text-text-secondary">
            Set the cost for each planned treatment (per tooth), or add/update it later from the
            patient&apos;s Treatment Plan or at Add Visit.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-sm font-medium">{entry.text.trim()}</span>
                {entry.teeth.map((tooth) => (
                  <span
                    key={tooth}
                    className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full bg-gray-100 text-gray-600 border border-gray-200"
                  >
                    T{tooth}
                  </span>
                ))}
              </div>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Cost (BDT) — optional"
                value={costs[entry.id] ?? ''}
                onChange={(e) => setCosts((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ))}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button type="submit" className="w-full sm:flex-1">Save with costs</Button>
            <Button type="button" variant="outline" onClick={() => onConfirm({})} className="w-full sm:flex-1">
              Add costs later
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
