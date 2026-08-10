import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stethoscope, Pencil, Plus, Trash2, X, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  createLetterheadDoctor,
  deleteLetterheadDoctor,
  listLetterheadDoctors,
  updateLetterheadDoctor,
  type LetterheadDoctor,
} from '@/lib/prescriptionLetterheadDoctors'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

const emptyForm = { full_name: '', degrees: '', designation: '', bmdc_reg: '' }

function DoctorForm({
  editing,
  onSave,
  onCancel,
  isBusy,
}: {
  editing: LetterheadDoctor | null
  onSave: (input: typeof emptyForm) => void
  onCancel: () => void
  isBusy: boolean
}) {
  const [form, setForm] = useState(
    editing
      ? { full_name: editing.full_name, degrees: editing.degrees, designation: editing.designation, bmdc_reg: editing.bmdc_reg }
      : emptyForm
  )

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder="Full name (e.g. Dr. Trisna Saha)"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          value={form.designation}
          onChange={(e) => setForm({ ...form, designation: e.target.value })}
          placeholder="Designation (e.g. Oral & Dental Surgeon)"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <textarea
        value={form.degrees}
        onChange={(e) => setForm({ ...form, degrees: e.target.value })}
        placeholder={'Degrees, one per line (e.g. BDS (DU)\nDDS (...)\nPGT (...))'}
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
      />
      <input
        value={form.bmdc_reg}
        onChange={(e) => setForm({ ...form, bmdc_reg: e.target.value })}
        placeholder="BMDC registration number"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={!form.full_name.trim() || isBusy} onClick={() => onSave(form)}>
          {editing ? 'Save Changes' : 'Add Doctor'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function PrescriptionDoctorsTab() {
  const queryClient = useQueryClient()
  const { data: doctors = [], isPending } = useQuery({ queryKey: ['letterheadDoctors', 'all'], queryFn: listLetterheadDoctors })

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<LetterheadDoctor | null>(null)
  const [error, setError] = useState('')

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['letterheadDoctors'] })
  }

  const createMutation = useMutation({
    mutationFn: (input: typeof emptyForm) =>
      createLetterheadDoctor({ ...input, display_order: doctors.length, is_active: true }),
    onSuccess: () => {
      setShowForm(false)
      refresh()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<LetterheadDoctor> }) => updateLetterheadDoctor(id, patch),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLetterheadDoctor(id),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  })

  function move(doctor: LetterheadDoctor, direction: -1 | 1) {
    const sorted = [...doctors].sort((a, b) => a.display_order - b.display_order)
    const index = sorted.findIndex((d) => d.id === doctor.id)
    const swapWith = sorted[index + direction]
    if (!swapWith) return
    updateMutation.mutate({ id: doctor.id, patch: { display_order: swapWith.display_order } })
    updateMutation.mutate({ id: swapWith.id, patch: { display_order: doctor.display_order } })
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Prescription Doctors</h3>
          <p className="text-sm text-text-secondary">
            Doctors shown on the printed prescription letterhead (left-to-right in this order). Inactive
            doctors stay saved but drop off the letterhead.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-error flex items-center justify-between gap-2">
          {error}
          <button type="button" onClick={() => setError('')} className="text-error/70 hover:text-error">
            <X className="w-3.5 h-3.5" />
          </button>
        </p>
      )}

      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Doctors</h4>
        {!showForm && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Doctor
          </Button>
        )}
      </div>

      {showForm && (
        <DoctorForm editing={null} isBusy={createMutation.isPending} onCancel={() => setShowForm(false)} onSave={(input) => createMutation.mutate(input)} />
      )}

      {isPending ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : doctors.length === 0 ? (
        <p className="text-sm text-gray-400">No doctors yet.</p>
      ) : (
        <div className="space-y-2">
          {[...doctors]
            .sort((a, b) => a.display_order - b.display_order)
            .map((doctor) =>
              editing?.id === doctor.id ? (
                <DoctorForm
                  key={doctor.id}
                  editing={doctor}
                  isBusy={updateMutation.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(input) => updateMutation.mutate({ id: doctor.id, patch: input })}
                />
              ) : (
                <div key={doctor.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-medium text-sm">{doctor.full_name}</span>
                    <span className="text-xs text-gray-500 ml-2">{doctor.designation}</span>
                    {!doctor.is_active && <span className="text-xs text-amber-600 ml-2">(inactive — hidden from letterhead)</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" title="Move up" onClick={() => move(doctor, -1)} className="text-gray-400 hover:text-primary">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" title="Move down" onClick={() => move(doctor, 1)} className="text-gray-400 hover:text-primary">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <label className="flex items-center gap-1 text-xs text-gray-500 ml-1">
                      <input
                        type="checkbox"
                        checked={doctor.is_active}
                        onChange={(e) => updateMutation.mutate({ id: doctor.id, patch: { is_active: e.target.checked } })}
                      />
                      Active
                    </label>
                    <button type="button" title="Edit" onClick={() => setEditing(doctor)} className="text-gray-400 hover:text-primary ml-1">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Delete ${doctor.full_name} from the prescription letterhead?`)) deleteMutation.mutate(doctor.id)
                      }}
                      className="text-gray-400 hover:text-error"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            )}
        </div>
      )}
    </div>
  )
}
