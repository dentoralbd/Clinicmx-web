import { useState, useEffect } from 'react'
import { Plus, Search, Activity } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { canDelete } from '@/lib/appSession'
import { logDeletion } from '@/lib/deleteHistory'
import { logEdit } from '@/lib/editHistory'

interface Treatment {
  id: string
  patient_id: string
  tooth_number: number | null
  treatment_type: string
  description: string | null
  status: string
  cost: number
  notes: string | null
  created_at: string
  patients: {
    first_name: string
    last_name: string
  }
}

export function Treatments() {
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadTreatments()
  }, [])

  async function loadTreatments() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('treatments')
        .select(`
          *,
          patients (first_name, last_name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTreatments(data || [])
    } catch (error) {
      console.error('Error loading treatments:', error)
    } finally {
      setLoading(false)
    }
  }

  async function deleteTreatment(treatment: Treatment) {
    if (!canDelete()) return
    if (!confirm('Delete this treatment?')) return

    try {
      const patientName = `${treatment.patients?.first_name ?? ''} ${treatment.patients?.last_name ?? ''}`.trim()
      await logDeletion({
        entityType: 'treatment',
        entityId: treatment.id,
        entityLabel: treatment.treatment_type,
        patientId: treatment.patient_id,
        patientName: patientName || null,
        payload: treatment,
      })
      const { error } = await supabase.from('treatments').delete().eq('id', treatment.id)
      if (error) throw error
      setTreatments(treatments.filter((t) => t.id !== treatment.id))
    } catch (error) {
      console.error('Error deleting treatment:', error)
      alert('Failed to delete treatment')
    }
  }

  async function updateTreatmentStatus(id: string, newStatus: string) {
    try {
      const previous = treatments.find((t) => t.id === id)
      if (previous) {
        const patientName = `${previous.patients?.first_name ?? ''} ${previous.patients?.last_name ?? ''}`.trim()
        await logEdit({
          entityType: 'treatment',
          entityId: id,
          entityLabel: previous.treatment_type,
          patientId: previous.patient_id,
          patientName: patientName || null,
          previousPayload: previous,
        })
      }
      const { error } = await supabase
        .from('treatments')
        .update({ status: newStatus })
        .eq('id', id)
      if (error) throw error
      setTreatments(prev =>
        prev.map(t => t.id === id ? { ...t, status: newStatus } : t)
      )
    } catch (error) {
      console.error('Error updating treatment status:', error)
      alert('Failed to update treatment')
    }
  }

  const filteredTreatments = treatments.filter(
    (t) =>
      (t.patients?.first_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.patients?.last_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.treatment_type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Treatments</h1>
          <p className="text-text-secondary mt-1">Manage treatment plans and procedures</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Treatment
        </Button>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <input
              type="text"
              placeholder="Search treatments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <span className="spinner" />
          </div>
        ) : filteredTreatments.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            <Activity className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p>{searchQuery ? 'No treatments found' : 'No treatments yet. Click "New Treatment" to get started.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTreatments.map((treatment) => (
              <TreatmentRow
                key={treatment.id}
                treatment={treatment}
                onDelete={() => deleteTreatment(treatment)}
                onStatusChange={(status) => updateTreatmentStatus(treatment.id, status)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <TreatmentModal
          onClose={() => setShowModal(false)}
          onSave={() => { loadTreatments(); setShowModal(false) }}
        />
      )}
    </div>
  )
}

const STATUS_TRANSITIONS: Record<string, string> = {
  Planned: 'In Progress',
  'In Progress': 'Completed',
}

function TreatmentRow({ treatment, onDelete, onStatusChange }: {
  treatment: Treatment
  onDelete: () => void
  onStatusChange: (status: string) => void
}) {
  const statusColors: Record<string, string> = {
    Planned: 'bg-blue-100 text-blue-700',
    'In Progress': 'bg-yellow-100 text-yellow-700',
    Completed: 'bg-green-100 text-green-700',
    Cancelled: 'bg-red-100 text-red-700',
  }

  const nextStatus = STATUS_TRANSITIONS[treatment.status]

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">
              {treatment.patients?.first_name} {treatment.patients?.last_name}
            </p>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[treatment.status] || 'bg-gray-100'}`}>
              {treatment.status}
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {treatment.treatment_type}
            {treatment.tooth_number && ` - Tooth #${treatment.tooth_number}`}
          </p>
          {treatment.description && (
            <p className="text-sm text-text-secondary mt-1">{treatment.description}</p>
          )}
          <p className="text-sm font-medium text-primary mt-2">${(Number(treatment.cost) || 0).toFixed(2)}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {nextStatus && (
            <button
              onClick={() => onStatusChange(nextStatus)}
              className="px-2 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
              title={`Advance to ${nextStatus}`}
            >
              → {nextStatus}
            </button>
          )}
          {canDelete() && (
            <Button variant="outline" size="sm" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function TreatmentModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [patients, setPatients] = useState<any[]>([])
  const [formData, setFormData] = useState({
    patient_id: '',
    tooth_number: '',
    treatment_type: '',
    description: '',
    status: 'Planned',
    cost: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPatients()
  }, [])

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .order('last_name')
    setPatients(data || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase.from('treatments').insert([{
        patient_id: formData.patient_id,
        tooth_number: formData.tooth_number ? parseInt(formData.tooth_number) : null,
        treatment_type: formData.treatment_type,
        description: formData.description || null,
        status: formData.status,
        cost: parseFloat(formData.cost) || 0,
        notes: formData.notes || null,
      }])

      if (error) throw error
      onSave()
    } catch (error) {
      console.error('Error creating treatment:', error)
      alert('Failed to create treatment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">New Treatment</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Patient *</label>
            <select
              required
              value={formData.patient_id}
              onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Treatment Type *</label>
              <select
                required
                value={formData.treatment_type}
                onChange={(e) => setFormData({ ...formData, treatment_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select...</option>
                <option>Filling</option>
                <option>Root Canal</option>
                <option>Crown</option>
                <option>Bridge</option>
                <option>Extraction</option>
                <option>Implant</option>
                <option>Cleaning</option>
                <option>Whitening</option>
                <option>Braces</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tooth Number</label>
              <input
                type="number"
                min="1"
                max="32"
                value={formData.tooth_number}
                onChange={(e) => setFormData({ ...formData, tooth_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option>Planned</option>
                <option>In Progress</option>
                <option>Completed</option>
                <option>Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cost *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <><span className="spinner spinner-sm mr-2" />Creating...</> : 'Create Treatment'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
