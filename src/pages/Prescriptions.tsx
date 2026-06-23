import { useState, useEffect } from 'react'
import { Plus, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

interface Prescription {
  id: string
  patient_id: string
  medications: any
  diagnosis: string | null
  notes: string | null
  prescribed_date: string
  created_at: string
  patients: {
    first_name: string
    last_name: string
  }
}

export function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    loadPrescriptions()
  }, [])

  async function loadPrescriptions() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('prescriptions')
        .select(`
          *,
          patients (first_name, last_name)
        `)
        .order('prescribed_date', { ascending: false })

      if (error) throw error
      setPrescriptions(data || [])
    } catch (error) {
      console.error('Error loading prescriptions:', error)
    } finally {
      setLoading(false)
    }
  }

  async function deletePrescription(id: string) {
    if (!confirm('Delete this prescription?')) return

    try {
      const { error } = await supabase.from('prescriptions').delete().eq('id', id)
      if (error) throw error
      setPrescriptions(prescriptions.filter((p) => p.id !== id))
    } catch (error) {
      console.error('Error deleting prescription:', error)
      alert('Failed to delete prescription')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prescriptions</h1>
          <p className="text-text-secondary mt-1">Create and manage prescriptions</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Prescription
        </Button>
      </div>

      {loading ? (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-8 text-center text-text-secondary">
          Loading prescriptions...
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-8 text-center text-text-secondary">
          No prescriptions yet. Click "New Prescription" to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {prescriptions.map((prescription) => (
            <PrescriptionCard
              key={prescription.id}
              prescription={prescription}
              onDelete={() => deletePrescription(prescription.id)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <PrescriptionModal
          onClose={() => setShowModal(false)}
          onSave={() => { loadPrescriptions(); setShowModal(false) }}
        />
      )}
    </div>
  )
}

function PrescriptionCard({ prescription, onDelete }: { prescription: Prescription; onDelete: () => void }) {
  const medications = Array.isArray(prescription.medications) ? prescription.medications : []

  return (
    <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium">
              {prescription.patients.first_name} {prescription.patients.last_name}
            </p>
            <p className="text-sm text-text-secondary">
              {format(new Date(prescription.prescribed_date), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
      </div>

      {prescription.diagnosis && (
        <div className="mb-3">
          <p className="text-sm font-medium text-text-secondary">Diagnosis</p>
          <p className="text-sm">{prescription.diagnosis}</p>
        </div>
      )}

      <div className="mb-3">
        <p className="text-sm font-medium text-text-secondary mb-2">Medications</p>
        <div className="space-y-2">
          {medications.length === 0 ? (
            <p className="text-sm text-text-secondary">No medications</p>
          ) : (
            medications.map((med: any, idx: number) => (
              <div key={idx} className="text-sm bg-gray-50 p-2 rounded">
                <p className="font-medium">{med.name}</p>
                <p className="text-text-secondary text-xs">
                  {med.dosage} - {med.frequency} for {med.duration}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {prescription.notes && (
        <div className="mb-3">
          <p className="text-sm font-medium text-text-secondary">Notes</p>
          <p className="text-sm">{prescription.notes}</p>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onDelete} className="w-full mt-2">
        Delete
      </Button>
    </div>
  )
}

function PrescriptionModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [patients, setPatients] = useState<any[]>([])
  const [formData, setFormData] = useState({
    patient_id: '',
    diagnosis: '',
    notes: '',
    prescribed_date: format(new Date(), 'yyyy-MM-dd'),
  })
  const [medications, setMedications] = useState([{
    name: '',
    dosage: '',
    frequency: '',
    duration: '',
    instructions: '',
  }])
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

  function addMedication() {
    setMedications([...medications, {
      name: '',
      dosage: '',
      frequency: '',
      duration: '',
      instructions: '',
    }])
  }

  function removeMedication(index: number) {
    setMedications(medications.filter((_, i) => i !== index))
  }

  function updateMedication(index: number, field: string, value: string) {
    const updated = [...medications]
    updated[index] = { ...updated[index], [field]: value }
    setMedications(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase.from('prescriptions').insert({
        patient_id: formData.patient_id,
        medications: medications.filter(m => m.name),
        diagnosis: formData.diagnosis || null,
        notes: formData.notes || null,
        prescribed_date: formData.prescribed_date,
      })

      if (error) throw error
      onSave()
    } catch (error) {
      console.error('Error creating prescription:', error)
      alert('Failed to create prescription')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">New Prescription</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={formData.prescribed_date}
                onChange={(e) => setFormData({ ...formData, prescribed_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Diagnosis</label>
            <input
              type="text"
              value={formData.diagnosis}
              onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Medications</label>
              <Button type="button" size="sm" onClick={addMedication}>
                <Plus className="w-4 h-4 mr-1" />
                Add Medication
              </Button>
            </div>
            <div className="space-y-3">
              {medications.map((med, idx) => (
                <div key={idx} className="p-3 border border-gray-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      placeholder="Medication name *"
                      value={med.name}
                      onChange={(e) => updateMedication(idx, 'name', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {medications.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMedication(idx)}
                        className="ml-2 text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Dosage"
                      value={med.dosage}
                      onChange={(e) => updateMedication(idx, 'dosage', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Frequency"
                      value={med.frequency}
                      onChange={(e) => updateMedication(idx, 'frequency', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Duration"
                      value={med.duration}
                      onChange={(e) => updateMedication(idx, 'duration', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Instructions"
                    value={med.instructions}
                    onChange={(e) => updateMedication(idx, 'instructions', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              ))}
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
              {saving ? 'Creating...' : 'Create Prescription'}
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
