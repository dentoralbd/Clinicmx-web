import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Pencil, Plus, Stethoscope, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  createCatalogCategory,
  createCustomMedication,
  createTreatmentCatalogItem,
  deleteCatalogCategory,
  deleteCustomMedication,
  deleteTreatmentCatalogItem,
  listCatalogCategories,
  listCustomMedications,
  listTreatmentCatalogItems,
  updateCatalogCategory,
  updateCustomMedication,
  updateTreatmentCatalogItem,
  type CatalogCategory,
  type CatalogDomain,
  type CustomMedication,
  type TreatmentCatalogItem,
} from '@/lib/catalog'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

// === Category manager (shared between both domains) ===========================

function CategoryManager({ domain, title }: { domain: CatalogDomain; title: string }) {
  const queryClient = useQueryClient()
  const queryKey = ['catalogCategories', domain]
  const { data: categories = [], isPending } = useQuery({ queryKey, queryFn: () => listCatalogCategories(domain) })

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')

  function refresh() {
    queryClient.invalidateQueries({ queryKey })
  }

  const createMutation = useMutation({
    mutationFn: () => createCatalogCategory(domain, newName, categories.length),
    onSuccess: () => {
      setNewName('')
      refresh()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCatalogCategory(id, { name }),
    onSuccess: () => {
      setEditingId(null)
      refresh()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCatalogCategory(id),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <div>
      <h4 className="font-semibold text-sm mb-1">{title} Categories</h4>
      {error && (
        <p className="text-xs text-error mb-2 flex items-center justify-between gap-2">
          {error}
          <button type="button" onClick={() => setError('')} className="text-error/70 hover:text-error">
            <X className="w-3.5 h-3.5" />
          </button>
        </p>
      )}
      {isPending ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {categories.map((c: CatalogCategory) =>
            editingId === c.id ? (
              <div key={c.id} className="flex items-center gap-1 border border-primary/30 rounded-lg px-2 py-1">
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editingName.trim()) renameMutation.mutate({ id: c.id, name: editingName.trim() })
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="text-sm px-1 py-0.5 border border-gray-300 rounded w-32 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  disabled={!editingName.trim() || renameMutation.isPending}
                  onClick={() => renameMutation.mutate({ id: c.id, name: editingName.trim() })}
                  className="text-primary text-xs font-medium px-1 disabled:opacity-50"
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                key={c.id}
                className="flex items-center gap-1.5 bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5 text-sm"
              >
                <span>{c.name}</span>
                <button
                  type="button"
                  title="Rename"
                  onClick={() => {
                    setEditingId(c.id)
                    setEditingName(c.name)
                  }}
                  className="text-gray-400 hover:text-primary"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  title="Delete"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`Delete category "${c.name}"?`)) deleteMutation.mutate(c.id)
                  }}
                  className="text-gray-400 hover:text-error"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) createMutation.mutate()
          }}
          placeholder="New category name…"
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!newName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add
        </Button>
      </div>
    </div>
  )
}

// === Procedures / treatments section ===========================================

function ProcedureForm({
  categories,
  editing,
  onSave,
  onCancel,
  isBusy,
}: {
  categories: CatalogCategory[]
  editing: TreatmentCatalogItem | null
  onSave: (input: { category_id: string; name: string; default_fee: number | null }) => void
  onCancel: () => void
  isBusy: boolean
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? categories[0]?.id ?? '')
  const [fee, setFee] = useState(editing?.default_fee != null ? String(editing.default_fee) : '')

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="grid sm:grid-cols-3 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Procedure name"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary sm:col-span-1"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="Default fee (optional)"
          inputMode="decimal"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!name.trim() || !categoryId || isBusy}
          onClick={() =>
            onSave({
              category_id: categoryId,
              name: name.trim(),
              default_fee: fee.trim() ? Number(fee) : null,
            })
          }
        >
          {editing ? 'Save Changes' : 'Add Procedure'}
        </Button>
        {editing && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

function ProceduresSection() {
  const queryClient = useQueryClient()
  const { data: categories = [] } = useQuery({ queryKey: ['catalogCategories', 'treatment'], queryFn: () => listCatalogCategories('treatment') })
  const { data: items = [], isPending } = useQuery({ queryKey: ['treatmentCatalogItems'], queryFn: listTreatmentCatalogItems })

  const [editing, setEditing] = useState<TreatmentCatalogItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['treatmentCatalogItems'] })
  }

  const createMutation = useMutation({
    mutationFn: createTreatmentCatalogItem,
    onSuccess: () => {
      setShowForm(false)
      refresh()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateTreatmentCatalogItem>[2] }) =>
      updateTreatmentCatalogItem(id, editing as TreatmentCatalogItem, patch),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (item: TreatmentCatalogItem) => deleteTreatmentCatalogItem(item),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Procedures &amp; Treatments</h3>
          <p className="text-sm text-text-secondary">
            Categories and procedures shown in the Treatment Type dropdown across the app.
          </p>
        </div>
      </div>

      <CategoryManager domain="treatment" title="Procedure" />

      {error && <p className="text-sm text-error">{error}</p>}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm">Procedures</h4>
          {!showForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(true)} disabled={categories.length === 0}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Procedure
            </Button>
          )}
        </div>
        {categories.length === 0 && <p className="text-xs text-gray-400 mb-2">Add a category above first.</p>}
        {showForm && (
          <div className="mb-3">
            <ProcedureForm
              categories={categories}
              editing={null}
              isBusy={createMutation.isPending}
              onCancel={() => setShowForm(false)}
              onSave={(input) => createMutation.mutate(input)}
            />
          </div>
        )}

        {isPending ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">No procedures yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) =>
              editing?.id === item.id ? (
                <ProcedureForm
                  key={item.id}
                  categories={categories}
                  editing={item}
                  isBusy={updateMutation.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(input) => updateMutation.mutate({ id: item.id, patch: input })}
                />
              ) : (
                <div key={item.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-medium text-sm">{item.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{item.category?.name}</span>
                    {item.default_fee != null && (
                      <span className="text-xs text-gray-500 ml-2">৳{item.default_fee}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" title="Edit" onClick={() => setEditing(item)} className="text-gray-400 hover:text-primary">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Delete procedure "${item.name}"?`)) deleteMutation.mutate(item)
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
    </div>
  )
}

// === Medications section =======================================================

function MedicationForm({
  categories,
  editing,
  onSave,
  onCancel,
  isBusy,
}: {
  categories: CatalogCategory[]
  editing: CustomMedication | null
  onSave: (input: Parameters<typeof createCustomMedication>[0]) => void
  onCancel: () => void
  isBusy: boolean
}) {
  const [brand, setBrand] = useState(editing?.brand ?? '')
  const [generic, setGeneric] = useState(editing?.generic ?? '')
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? categories[0]?.id ?? '')
  const [dosageForm, setDosageForm] = useState(editing?.dosage_form ?? '')
  const [dosage, setDosage] = useState(editing?.default_dosage ?? '')
  const [frequency, setFrequency] = useState(editing?.default_frequency ?? '')
  const [duration, setDuration] = useState(editing?.default_duration ?? '')
  const [instructions, setInstructions] = useState(editing?.default_instructions ?? '')
  const [route, setRoute] = useState(editing?.default_route ?? '')

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="grid sm:grid-cols-3 gap-2">
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand name" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <input value={generic} onChange={(e) => setGeneric(e.target.value)} placeholder="Generic name" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <input value={dosageForm} onChange={(e) => setDosageForm(e.target.value)} placeholder="Dosage form (e.g. 500mg Tab)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="Default dosage" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="Default frequency" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Default duration" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Route (e.g. Oral)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Default instructions" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!brand.trim() || !generic.trim() || !categoryId || isBusy}
          onClick={() =>
            onSave({
              category_id: categoryId,
              brand: brand.trim(),
              generic: generic.trim(),
              dosage_form: dosageForm.trim() || null,
              default_dosage: dosage.trim() || null,
              default_frequency: frequency.trim() || null,
              default_duration: duration.trim() || null,
              default_instructions: instructions.trim() || null,
              default_route: route.trim() || null,
            })
          }
        >
          {editing ? 'Save Changes' : 'Add Medication'}
        </Button>
        {editing && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

function MedicationsSection() {
  const queryClient = useQueryClient()
  const { data: categories = [] } = useQuery({ queryKey: ['catalogCategories', 'medication'], queryFn: () => listCatalogCategories('medication') })
  const { data: items = [], isPending } = useQuery({ queryKey: ['customMedications'], queryFn: listCustomMedications })

  const [editing, setEditing] = useState<CustomMedication | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['customMedications'] })
  }

  const createMutation = useMutation({
    mutationFn: createCustomMedication,
    onSuccess: () => {
      setShowForm(false)
      refresh()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateCustomMedication>[2] }) =>
      updateCustomMedication(id, editing as CustomMedication, patch),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (medication: CustomMedication) => deleteCustomMedication(medication),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Medications</h3>
          <p className="text-sm text-text-secondary">
            Clinic-added medications shown in the prescription Drug Picker alongside the built-in BD drug
            directory, plus any new medication categories.
          </p>
        </div>
      </div>

      <CategoryManager domain="medication" title="Medication" />

      {error && <p className="text-sm text-error">{error}</p>}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm">Custom Medications</h4>
          {!showForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(true)} disabled={categories.length === 0}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Medication
            </Button>
          )}
        </div>
        {showForm && (
          <div className="mb-3">
            <MedicationForm categories={categories} editing={null} isBusy={createMutation.isPending} onCancel={() => setShowForm(false)} onSave={(input) => createMutation.mutate(input)} />
          </div>
        )}

        {isPending ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">No custom medications yet — the built-in BD drug directory is still available in the Drug Picker.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) =>
              editing?.id === item.id ? (
                <MedicationForm key={item.id} categories={categories} editing={item} isBusy={updateMutation.isPending} onCancel={() => setEditing(null)} onSave={(input) => updateMutation.mutate({ id: item.id, patch: input })} />
              ) : (
                <div key={item.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-medium text-sm">{item.brand}</span>
                    <span className="text-xs text-gray-500 ml-2">{item.generic} · {item.category?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" title="Edit" onClick={() => setEditing(item)} className="text-gray-400 hover:text-primary">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Delete medication "${item.brand}"?`)) deleteMutation.mutate(item)
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
    </div>
  )
}

// === Page =======================================================================

export function Catalog() {
  return (
    <div className="space-y-6 page-fade-in pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-primary/10 shadow-elevation-low">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 bg-primary/10 rounded-2xl text-primary">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary">Catalog</h1>
          </div>
          <p className="text-sm text-text-secondary">
            Manage categories and add procedures or medications so they're available across the app going forward.
          </p>
        </div>
      </div>

      <ProceduresSection />
      <MedicationsSection />
    </div>
  )
}
