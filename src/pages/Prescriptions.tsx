import { useState, useEffect } from 'react'
import { Plus, Search, Trash2, Lightbulb, X, Pencil, FlaskConical, CheckCircle, Stethoscope, Pill } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { safeFormat } from '@/lib/utils'

// ─── RECENT ITEM HELPERS ──────────────────────────────
function mergeRecentItem(items: any[], item: any) {
  const exists = items.some(
    (i: any) => i.name?.toLowerCase() === item.name?.toLowerCase()
  )
  if (!exists && item.name?.trim()) {
    return [item, ...items].slice(0, 30)
  }
  return items
}
// ─────────────────────────────────────────────────────

export function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [medicationTemplates, setMedicationTemplates] = useState<any[]>([])
  const [investigationTemplates, setInvestigationTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showMedTemplates, setShowMedTemplates] = useState(false)
  const [showInvTemplates, setShowInvTemplates] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [localMeds, setLocalMeds] = useState<any[]>([])
  const [localInvs, setLocalInvs] = useState<any[]>([])

  const [formData, setFormData] = useState({
    patient_id: '',
    diagnosis: '',
    notes: '',
    prescribed_date: format(new Date(), 'yyyy-MM-dd'),
    medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
    investigations: [{ name: '', description: '', urgency: 'Routine' }],
  })

  useEffect(() => {
    loadPrescriptions()
    loadPatients()
    loadTemplates()
  }, [])

  async function loadPrescriptions() {
    try {
      setLoading(true)
      const { data } = await supabase
        .from('prescriptions')
        .select(`*, patients (first_name, last_name)`)
        .order('prescribed_date', { ascending: false })
      setPrescriptions(data || [])
    } catch (error) {
      console.error('Error loading prescriptions:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('*')
      .order('first_name')
    setPatients(data || [])
  }

  async function loadTemplates() {
    const { data: medTemplates } = await supabase
      .from('medication_templates')
      .select('*')
      .order('usage_count', { ascending: false })

    const { data: invTemplates } = await supabase
      .from('investigation_templates')
      .select('*')
      .order('usage_count', { ascending: false })

    setMedicationTemplates(medTemplates || [])
    setInvestigationTemplates(invTemplates || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const payload = {
        patient_id: formData.patient_id,
        diagnosis: formData.diagnosis,
        notes: formData.notes,
        prescribed_date: formData.prescribed_date,
        medications: formData.medications.filter((m) => m.name.trim()),
        investigations: formData.investigations.filter((i) => i.name.trim()),
      }

      if (editingId) {
        await supabase.from('prescriptions').update(payload).eq('id', editingId)
      } else {
        await supabase.from('prescriptions').insert([payload])

        setLocalMeds((items) =>
          formData.medications.reduce((nextItems, med) => mergeRecentItem(nextItems, med), items)
        )
        setLocalInvs((items) =>
          formData.investigations.reduce((nextItems, inv) => mergeRecentItem(nextItems, inv), items)
        )
      }

      setShowForm(false)
      resetForm()
      loadPrescriptions()
      loadTemplates()
    } catch (error) {
      console.error('Error saving prescription:', error)
      alert('Failed to save prescription')
    }
  }

  function startEdit(prescription: any) {
    setEditingId(prescription.id)
    setFormData({
      patient_id: prescription.patient_id || '',
      diagnosis: prescription.diagnosis || '',
      notes: prescription.notes || '',
      prescribed_date: prescription.prescribed_date
        ? format(new Date(prescription.prescribed_date), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd'),
      medications:
        Array.isArray(prescription.medications) && prescription.medications.length > 0
          ? prescription.medications
          : [{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }],
      investigations:
        Array.isArray(prescription.investigations) && prescription.investigations.length > 0
          ? prescription.investigations
          : [{ name: '', description: '' }],
    })
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this prescription?')) return
    try {
      await supabase.from('prescriptions').delete().eq('id', id)
      loadPrescriptions()
    } catch (error) {
      console.error('Error deleting prescription:', error)
      alert('Failed to delete prescription')
    }
  }

  function resetForm() {
    setEditingId(null)
    setFormData({
      patient_id: '',
      diagnosis: '',
      notes: '',
      prescribed_date: format(new Date(), 'yyyy-MM-dd'),
      medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
      investigations: [{ name: '', description: '', urgency: 'Routine' }],
    })
  }

  function addMedication() {
    setFormData({
      ...formData,
      medications: [...formData.medications, { name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
    })
  }

  function removeMedication(index: number) {
    const newMeds = formData.medications.filter((_, i) => i !== index)
    setFormData({ ...formData, medications: newMeds })
  }

  function addInvestigation() {
    setFormData({
      ...formData,
      investigations: [...formData.investigations, { name: '', description: '', urgency: 'Routine' }],
    })
  }

  function removeInvestigation(index: number) {
    const newInvs = formData.investigations.filter((_, i) => i !== index)
    setFormData({ ...formData, investigations: newInvs })
  }

  function addMedicationFromTemplate(template: any) {
    const newMeds = [...formData.medications]
    const emptyIndex = newMeds.findIndex((m) => !m.name)
    if (emptyIndex >= 0) {
      newMeds[emptyIndex] = {
        name: template.name,
        dosage: template.dosage || '',
        frequency: template.frequency || '',
        duration: template.duration || '',
        instructions: template.instructions || '',
      }
    } else {
      newMeds.push({
        name: template.name,
        dosage: template.dosage || '',
        frequency: template.frequency || '',
        duration: template.duration || '',
        instructions: template.instructions || '',
      })
    }
    setFormData({ ...formData, medications: newMeds })
    setShowMedTemplates(false)
  }

  function addInvestigationFromTemplate(template: any) {
    const newInvs = [...formData.investigations]
    const emptyIndex = newInvs.findIndex((i) => !i.name)
    if (emptyIndex >= 0) {
      newInvs[emptyIndex] = {
        name: template.name,
        description: template.description || '',
      }
    } else {
      newInvs.push({
        name: template.name,
        description: template.description || '',
      })
    }
    setFormData({ ...formData, investigations: newInvs })
    setShowInvTemplates(false)
  }

  function applyLocalMedication(med: any) {
    const newMeds = [...formData.medications]
    const emptyIndex = newMeds.findIndex((m) => !m.name.trim())
    const item = {
      name: med.name || '',
      dosage: med.dosage || '',
      frequency: med.frequency || '',
      duration: med.duration || '',
      instructions: med.instructions || '',
    }
    if (emptyIndex >= 0) {
      newMeds[emptyIndex] = item
    } else {
      newMeds.push(item)
    }
    setFormData({ ...formData, medications: newMeds })
  }

  function applyLocalInvestigation(inv: any) {
    const newInvs = [...formData.investigations]
    const emptyIndex = newInvs.findIndex((i) => !i.name.trim())
    const item = {
      name: inv.name || '',
      description: inv.description || '',
    }
    if (emptyIndex >= 0) {
      newInvs[emptyIndex] = item
    } else {
      newInvs.push(item)
    }
    setFormData({ ...formData, investigations: newInvs })
  }

  const filteredPrescriptions = prescriptions.filter((p) => {
    const patientName = `${p.patients?.first_name} ${p.patients?.last_name}`.toLowerCase()
    return (
      patientName.includes(searchTerm.toLowerCase()) ||
      p.diagnosis?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Prescriptions</h1>
          <p className="text-text-secondary">Manage patient prescriptions and investigations</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          New Prescription
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
        <input
          type="text"
          placeholder="Search prescriptions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Diagnosis</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Medications</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Investigations</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPrescriptions.map((prescription) => (
                  <tr key={prescription.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium">
                        {prescription.patients?.first_name} {prescription.patients?.last_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {safeFormat(prescription.prescribed_date, 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm">{prescription.diagnosis || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm">
                      {Array.isArray(prescription.medications) && prescription.medications.length > 0
                        ? `${prescription.medications.length} medication(s)`
                        : 'None'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {Array.isArray(prescription.investigations) && prescription.investigations.length > 0
                        ? `${prescription.investigations.length} test(s)`
                        : 'None'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(prescription)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(prescription.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden">
            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-primary via-[#1b4e70] to-slate-900 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {editingId ? 'Update Prescription' : 'New Prescription'}
                  </h2>
                  <p className="text-blue-200 text-xs">Dental Prescription Form</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm() }}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* ── Patient & Date ── */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Patient &amp; Date</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Patient *</label>
                    <select
                      required
                      value={formData.patient_id}
                      onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">Select patient</option>
                      {patients.map((patient) => (
                        <option key={patient.id} value={patient.id}>
                          {patient.first_name} {patient.last_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={formData.prescribed_date}
                      onChange={(e) => setFormData({ ...formData, prescribed_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* ── Diagnosis ── */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Clinical Diagnosis / Chief Complaint</label>
                <textarea
                  rows={2}
                  value={formData.diagnosis}
                  onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                  placeholder="Enter diagnosis"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">e.g., Dental caries (K02.1), Periapical abscess (K04.7)</p>
              </div>

              {/* ── Medications ── */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 rounded-full bg-primary"></div>
                  <Pill className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-gray-800">Rx — Medications</span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowMedTemplates(!showMedTemplates)}
                    >
                      <Lightbulb className="w-4 h-4 mr-1" />
                      Templates ({medicationTemplates.length})
                    </Button>
                  </div>
                </div>

                {showMedTemplates && medicationTemplates.length > 0 && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm text-blue-800">📋 Medication Templates</h4>
                      <button type="button" onClick={() => setShowMedTemplates(false)} className="text-blue-400 hover:text-blue-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {medicationTemplates.slice(0, 10).map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => addMedicationFromTemplate(template)}
                          className="text-left p-2.5 bg-white rounded-lg border border-blue-200 hover:border-primary hover:bg-primary/5 transition-colors"
                        >
                          <div className="font-medium text-sm text-gray-800">{template.name}</div>
                          <div className="text-xs text-gray-500">
                            {template.dosage} • {template.frequency} • {template.duration}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {formData.medications.map((med, index) => (
                    <div key={index} className="relative rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                      {/* Number badge */}
                      <div className="absolute -left-3 top-4 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow">
                        {index + 1}
                      </div>
                      {/* Remove button */}
                      {formData.medications.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMedication(index)}
                          className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {/* Row 1: Drug Name | Dosage | Route */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Drug Name</label>
                          <input
                            type="text"
                            placeholder="e.g., Amoxicillin 500mg"
                            value={med.name}
                            onChange={(e) => {
                              const newMeds = [...formData.medications]
                              newMeds[index] = { ...newMeds[index], name: e.target.value }
                              setFormData({ ...formData, medications: newMeds })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Dosage</label>
                          <input
                            type="text"
                            placeholder="e.g., 500mg"
                            value={med.dosage}
                            onChange={(e) => {
                              const newMeds = [...formData.medications]
                              newMeds[index] = { ...newMeds[index], dosage: e.target.value }
                              setFormData({ ...formData, medications: newMeds })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Route</label>
                          <input
                            type="text"
                            placeholder="Oral / Topical / IV"
                            value={(med as any).route || ''}
                            onChange={(e) => {
                              const newMeds = [...formData.medications]
                              newMeds[index] = { ...newMeds[index], route: e.target.value }
                              setFormData({ ...formData, medications: newMeds })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                      {/* Row 2: Frequency | Duration | Instructions */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label>
                          <input
                            type="text"
                            placeholder="e.g., 3x daily"
                            value={med.frequency}
                            onChange={(e) => {
                              const newMeds = [...formData.medications]
                              newMeds[index] = { ...newMeds[index], frequency: e.target.value }
                              setFormData({ ...formData, medications: newMeds })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
                          <input
                            type="text"
                            placeholder="e.g., 5 days"
                            value={med.duration}
                            onChange={(e) => {
                              const newMeds = [...formData.medications]
                              newMeds[index] = { ...newMeds[index], duration: e.target.value }
                              setFormData({ ...formData, medications: newMeds })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Special Instructions</label>
                          <input
                            type="text"
                            placeholder="e.g., after meals"
                            value={med.instructions}
                            onChange={(e) => {
                              const newMeds = [...formData.medications]
                              newMeds[index] = { ...newMeds[index], instructions: e.target.value }
                              setFormData({ ...formData, medications: newMeds })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addMedication}
                  className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add another medication
                </button>

                {localMeds.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-text-secondary mb-2">
                      Quick-add recent medications:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {localMeds.map((med, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => applyLocalMedication(med)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
                          title={`${med.dosage} • ${med.frequency} • ${med.duration}`}
                        >
                          {med.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Investigations ── */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 rounded-full bg-teal-500"></div>
                  <FlaskConical className="w-4 h-4 text-teal-600" />
                  <span className="font-semibold text-gray-800">🔬 Investigations / Referrals</span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowInvTemplates(!showInvTemplates)}
                    >
                      <Lightbulb className="w-4 h-4 mr-1" />
                      Templates ({investigationTemplates.length})
                    </Button>
                  </div>
                </div>

                {showInvTemplates && investigationTemplates.length > 0 && (
                  <div className="mb-4 p-4 bg-teal-50 rounded-xl border border-teal-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm text-teal-800">📋 Investigation Templates</h4>
                      <button type="button" onClick={() => setShowInvTemplates(false)} className="text-teal-400 hover:text-teal-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {investigationTemplates.slice(0, 12).map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => addInvestigationFromTemplate(template)}
                          className="text-left p-2.5 bg-white rounded-lg border border-teal-200 hover:border-teal-500 hover:bg-teal-50/50 transition-colors"
                        >
                          <div className="font-medium text-sm text-gray-800">{template.name}</div>
                          {template.description && (
                            <div className="text-xs text-gray-500 truncate">{template.description}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {formData.investigations.map((inv, index) => (
                    <div key={index} className="relative rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                      {/* Number badge */}
                      <div className="absolute -left-3 top-4 w-6 h-6 rounded-full bg-teal-500 text-white text-xs font-bold flex items-center justify-center shadow">
                        {index + 1}
                      </div>
                      {/* Remove button */}
                      {formData.investigations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInvestigation(index)}
                          className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {/* Row 1: Name | Urgency */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Investigation Name</label>
                          <input
                            type="text"
                            placeholder="e.g., OPG X-Ray, CBC, Blood Glucose"
                            value={inv.name}
                            onChange={(e) => {
                              const newInvs = [...formData.investigations]
                              newInvs[index] = { ...newInvs[index], name: e.target.value }
                              setFormData({ ...formData, investigations: newInvs })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Urgency</label>
                          <select
                            value={(inv as any).urgency || 'Routine'}
                            onChange={(e) => {
                              const newInvs = [...formData.investigations]
                              newInvs[index] = { ...newInvs[index], urgency: e.target.value }
                              setFormData({ ...formData, investigations: newInvs })
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="Routine">Routine</option>
                            <option value="Urgent">Urgent</option>
                            <option value="STAT">STAT</option>
                          </select>
                        </div>
                      </div>
                      {/* Row 2: Clinical Notes */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Clinical Notes / Instructions</label>
                        <textarea
                          rows={1}
                          placeholder="Additional notes (optional)"
                          value={inv.description}
                          onChange={(e) => {
                            const newInvs = [...formData.investigations]
                            newInvs[index] = { ...newInvs[index], description: e.target.value }
                            setFormData({ ...formData, investigations: newInvs })
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addInvestigation}
                  className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-500 hover:border-teal-500 hover:text-teal-600 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add another investigation
                </button>

                {localInvs.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-text-secondary mb-2">
                      Quick-add recent investigations:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {localInvs.map((inv, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => applyLocalInvestigation(inv)}
                          className="px-3 py-1.5 bg-teal-50 text-teal-700 text-sm rounded-full border border-teal-200 hover:bg-teal-100 transition-colors"
                          title={inv.description || ''}
                        >
                          {inv.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Notes ── */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">📝 Clinician's Notes &amp; Follow-up Instructions</label>
                <textarea
                  rows={4}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Follow-up in X days, avoid hot food, refer to specialist if symptoms persist..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {/* ── Footer ── */}
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowForm(false); resetForm() }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {editingId ? 'Update Prescription' : 'Issue Prescription'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
