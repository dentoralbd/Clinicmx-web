import { useState, useEffect } from 'react'
import { Plus, Search, Trash2, Lightbulb, X, Pencil, FlaskConical, CheckCircle, Stethoscope, Pill, Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { PrescriptionPrint } from '@/components/PrescriptionPrint'
import { MEMORY_KEYS, rememberItem, getMemory } from '@/lib/prescriptionMemory'
import { loadDoctorProfile as loadSavedDoctorProfile } from '@/lib/doctorProfile'
import {
  getComplaintTemplates,
  getExaminationTemplates,
  getFilledInvestigationItems,
  getFilledMedicationItems,
  getInvestigationSectionTemplates,
  getMedicationSectionTemplates,
  saveComplaintTemplate,
  saveExaminationTemplate,
  saveInvestigationSectionTemplate,
  saveMedicationSectionTemplate,
  type SectionTemplate,
  type MedicationTemplateItem,
  type InvestigationTemplateItem,
} from '@/lib/prescriptionSectionTemplates'
import { format } from 'date-fns'
import { safeFormat } from '@/lib/utils'
import { DrugPicker } from '@/components/DrugPicker'

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

// ─── TREATMENT PLAN → OPERATIONS MAPPING ─────────────
const TREATMENT_TYPE_KEYWORDS: Array<[string, string[]]> = [
  ['Root Canal', ['rct', 'root canal']],
  ['Crown', ['crown', 'cap']],
  ['Bridge', ['bridge']],
  ['Extraction', ['extraction', 'ext']],
  ['Implant', ['implant']],
  ['Cleaning', ['cleaning', 'scaling']],
  ['Whitening', ['whitening', 'bleaching']],
  ['Braces', ['braces', 'ortho']],
  ['Dentures', ['denture']],
  ['Veneer', ['veneer']],
  ['Consultation', ['consultation', 'consult']],
  ['Filling', ['filling', 'restoration']],
]

function mapTreatmentPlanToOperation(treatmentPlan: string) {
  const text = treatmentPlan.toLowerCase()
  const match = TREATMENT_TYPE_KEYWORDS.find(([, keywords]) =>
    keywords.some((kw) => text.includes(kw))
  )
  const treatment_type = match ? match[0] : 'Other'
  const toothMatch = treatmentPlan.match(/-\s*(\d{2})\s*$/)
  const tooth_number = toothMatch ? parseInt(toothMatch[1], 10) : null
  return { treatment_type, tooth_number, description: treatmentPlan }
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
  const [showComplaintTemplates, setShowComplaintTemplates] = useState(false)
  const [showExamTemplates, setShowExamTemplates] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [complaintTemplates, setComplaintTemplates] = useState<Array<SectionTemplate<string>>>([])
  const [examinationTemplates, setExaminationTemplates] = useState<Array<SectionTemplate<string>>>([])
  const [savedMedicationTemplates, setSavedMedicationTemplates] = useState<Array<SectionTemplate<MedicationTemplateItem[]>>>([])
  const [savedInvestigationTemplates, setSavedInvestigationTemplates] = useState<Array<SectionTemplate<InvestigationTemplateItem[]>>>([])

  const [localMeds, setLocalMeds] = useState<any[]>([])
  const [localInvs, setLocalInvs] = useState<any[]>([])

  const [formData, setFormData] = useState({
    patient_id: '',
    chief_complaint: '',
    on_examination: '',
    diagnosis: '',
    treatment_plan: '',
    notes: '',
    prescribed_date: format(new Date(), 'yyyy-MM-dd'),
    medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
    investigations: [{ name: '', description: '', urgency: 'Routine' }],
  })

  const [printingPrescription, setPrintingPrescription] = useState<any | null>(null)
  const [doctorProfile, setDoctorProfile] = useState<any | null>(null)
  const [printingPatient, setPrintingPatient] = useState<any | null>(null)

  useEffect(() => {
    loadPrescriptions()
    loadPatients()
    loadTemplates()
    loadDoctorProfile()
    void refreshSectionTemplates()
  }, [])

  async function refreshSectionTemplates() {
    setComplaintTemplates(await getComplaintTemplates())
    setExaminationTemplates(await getExaminationTemplates())
    setSavedMedicationTemplates(await getMedicationSectionTemplates())
    setSavedInvestigationTemplates(await getInvestigationSectionTemplates())
  }

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

  async function loadDoctorProfile() {
    try {
      const data = await loadSavedDoctorProfile()
      if (data) setDoctorProfile(data)
    } catch {
      // silently ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const payload: any = {
        patient_id: formData.patient_id,
        chief_complaint: formData.chief_complaint,
        on_examination: formData.on_examination,
        diagnosis: formData.diagnosis,
        treatment_plan: formData.treatment_plan,
        notes: formData.notes,
        prescribed_date: formData.prescribed_date,
        medications: formData.medications.filter((m) => m.name.trim()),
        investigations: formData.investigations.filter((i) => i.name.trim()),
      }

      let prescriptionId = editingId
      if (editingId) {
        await supabase.from('prescriptions').update(payload).eq('id', editingId)
      } else {
        const { data: inserted } = await supabase.from('prescriptions').insert([payload]).select().single()
        prescriptionId = inserted?.id || null

        setLocalMeds((items) =>
          formData.medications.reduce((nextItems, med) => mergeRecentItem(nextItems, med), items)
        )
        setLocalInvs((items) =>
          formData.investigations.reduce((nextItems, inv) => mergeRecentItem(nextItems, inv), items)
        )

        // Save to localStorage-based smart memory
        if (formData.chief_complaint.trim()) rememberItem(MEMORY_KEYS.COMPLAINTS, formData.chief_complaint)
        if (formData.on_examination.trim()) rememberItem(MEMORY_KEYS.EXAMINATIONS, formData.on_examination)
        for (const med of formData.medications) {
          if (med.name.trim()) rememberItem(MEMORY_KEYS.MEDICATIONS, med.name)
        }
        for (const inv of formData.investigations) {
          if (inv.name.trim()) rememberItem(MEMORY_KEYS.INVESTIGATIONS, inv.name)
        }
      }

      if (formData.treatment_plan.trim() && prescriptionId) {
        const operation = mapTreatmentPlanToOperation(formData.treatment_plan)
        const { data: existing } = await supabase
          .from('treatments')
          .select('id')
          .eq('prescription_id', prescriptionId)
          .maybeSingle()

        if (existing) {
          await supabase.from('treatments').update(operation).eq('id', existing.id)
        } else {
          await supabase.from('treatments').insert([{
            patient_id: formData.patient_id,
            prescription_id: prescriptionId,
            status: 'Planned',
            notes: 'Added from prescription treatment plan',
            ...operation,
          }])
        }
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
      chief_complaint: prescription.chief_complaint || '',
      on_examination: prescription.on_examination || '',
      diagnosis: prescription.diagnosis || '',
      treatment_plan: prescription.treatment_plan || '',
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
      chief_complaint: '',
      on_examination: '',
      diagnosis: '',
      treatment_plan: '',
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

  function applyMedicationSectionTemplate(template: SectionTemplate<MedicationTemplateItem[]>) {
    setFormData({
      ...formData,
      medications: template.value.length > 0
        ? template.value.map((item) => ({ ...item }))
        : [{ name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
    })
    setShowMedTemplates(false)
  }

  function applyInvestigationSectionTemplate(template: SectionTemplate<InvestigationTemplateItem[]>) {
    setFormData({
      ...formData,
      investigations: template.value.length > 0
        ? template.value.map((item) => ({ ...item }))
        : [{ name: '', description: '', urgency: 'Routine' }],
    })
    setShowInvTemplates(false)
  }

  async function handleSaveComplaintTemplate() {
    if (!formData.chief_complaint.trim()) {
      alert('Enter a chief complaint before saving a template.')
      return
    }
    setComplaintTemplates(await saveComplaintTemplate(formData.chief_complaint))
    setShowComplaintTemplates(true)
  }

  async function handleSaveExaminationTemplate() {
    if (!formData.on_examination.trim()) {
      alert('Enter on-examination notes before saving a template.')
      return
    }
    setExaminationTemplates(await saveExaminationTemplate(formData.on_examination))
    setShowExamTemplates(true)
  }

  async function handleSaveMedicationTemplate() {
    if (getFilledMedicationItems(formData.medications).length === 0) {
      alert('Add at least one medication before saving a template.')
      return
    }
    setSavedMedicationTemplates(await saveMedicationSectionTemplate(formData.medications))
    setShowMedTemplates(true)
  }

  async function handleSaveInvestigationTemplate() {
    if (getFilledInvestigationItems(formData.investigations).length === 0) {
      alert('Add at least one investigation before saving a template.')
      return
    }
    setSavedInvestigationTemplates(await saveInvestigationSectionTemplate(formData.investigations))
    setShowInvTemplates(true)
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
                         onClick={() => {
                           const pat = patients.find((p) => p.id === prescription.patient_id)
                           setPrintingPatient(pat || null)
                           setPrintingPrescription(prescription)
                         }}
                         className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                         title="Print"
                       >
                         <Printer className="w-4 h-4" />
                       </button>
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

              {/* ── Chief Complaint ── */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <label className="block text-sm font-semibold text-gray-700">Chief Complaint</label>
                  <div className="ml-auto flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={handleSaveComplaintTemplate}>
                      Save Template
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowComplaintTemplates(!showComplaintTemplates)}
                    >
                      <Lightbulb className="w-4 h-4 mr-1" />
                      Templates ({complaintTemplates.length})
                    </Button>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={formData.chief_complaint}
                  onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
                  placeholder="e.g., Toothache, Bleeding gums, Sensitivity to cold..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
                />
                {showComplaintTemplates && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-amber-900">Chief Complaint Templates</h4>
                      <button type="button" onClick={() => setShowComplaintTemplates(false)} className="text-amber-500 hover:text-amber-700">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {complaintTemplates.length === 0 ? (
                      <p className="text-sm text-amber-900/80">Save a complaint once, then reuse it from here.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {complaintTemplates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, chief_complaint: template.value })
                              setShowComplaintTemplates(false)
                            }}
                            className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-left text-sm text-amber-900 hover:border-primary hover:text-primary"
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <PrescMemoryChips
                  memoryKey={MEMORY_KEYS.COMPLAINTS}
                  onSelect={(val) => setFormData({ ...formData, chief_complaint: val })}
                />
              </div>

              {/* ── On Examination ── */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <label className="block text-sm font-semibold text-gray-700">On Examination</label>
                  <div className="ml-auto flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={handleSaveExaminationTemplate}>
                      Save Template
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowExamTemplates(!showExamTemplates)}
                    >
                      <Lightbulb className="w-4 h-4 mr-1" />
                      Templates ({examinationTemplates.length})
                    </Button>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={formData.on_examination}
                  onChange={(e) => setFormData({ ...formData, on_examination: e.target.value })}
                  placeholder="e.g., Deep caries in 36, Periapical pathology on OPG, Pocket depth 5mm..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
                />
                {showExamTemplates && (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-sky-900">On Examination Templates</h4>
                      <button type="button" onClick={() => setShowExamTemplates(false)} className="text-sky-500 hover:text-sky-700">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {examinationTemplates.length === 0 ? (
                      <p className="text-sm text-sky-900/80">Save examination notes once, then reuse them from here.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {examinationTemplates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, on_examination: template.value })
                              setShowExamTemplates(false)
                            }}
                            className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-left text-sm text-sky-900 hover:border-primary hover:text-primary"
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <PrescMemoryChips
                  memoryKey={MEMORY_KEYS.EXAMINATIONS}
                  onSelect={(val) => setFormData({ ...formData, on_examination: val })}
                />
              </div>

              {/* ── Diagnosis ── */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Clinical Diagnosis</label>
                <textarea
                  rows={2}
                  value={formData.diagnosis}
                  onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                  placeholder="Enter diagnosis"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">e.g., Dental caries (K02.1), Periapical abscess (K04.7)</p>
              </div>

              {/* ── Treatment Plan ── */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Treatment Plan</label>
                <textarea
                  rows={2}
                  value={formData.treatment_plan}
                  onChange={(e) => setFormData({ ...formData, treatment_plan: e.target.value })}
                  placeholder="e.g., RCT + Cap - 47"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Also added to this patient's Operations tab as a treatment record.</p>
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
                      onClick={handleSaveMedicationTemplate}
                    >
                      Save Template
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowMedTemplates(!showMedTemplates)}
                    >
                      <Lightbulb className="w-4 h-4 mr-1" />
                      Templates ({savedMedicationTemplates.length})
                    </Button>
                  </div>
                </div>

                {showMedTemplates && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm text-blue-800">📋 Medication Templates</h4>
                      <button type="button" onClick={() => setShowMedTemplates(false)} className="text-blue-400 hover:text-blue-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {savedMedicationTemplates.length > 0 && (
                      <div className="mb-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Saved prescription templates</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {savedMedicationTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => applyMedicationSectionTemplate(template)}
                              className="text-left p-2.5 bg-white rounded-lg border border-blue-200 hover:border-primary hover:bg-primary/5 transition-colors"
                            >
                              <div className="font-medium text-sm text-gray-800">{template.label}</div>
                              <div className="text-xs text-gray-500">
                                {template.value.length} medication{template.value.length === 1 ? '' : 's'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {medicationTemplates.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Quick-add common medications</div>
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
                    {savedMedicationTemplates.length === 0 && medicationTemplates.length === 0 && (
                      <p className="text-sm text-blue-900/80">Save a medication set once, then reuse it from here.</p>
                    )}
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
                          <DrugPicker
                            value={med.name}
                            onChange={(value) => {
                              const newMeds = [...formData.medications]
                              newMeds[index] = { ...newMeds[index], name: value }
                              setFormData({ ...formData, medications: newMeds })
                            }}
                            onDrugSelect={(drug) => {
                              const newMeds = [...formData.medications]
                              newMeds[index] = {
                                ...newMeds[index],
                                name: drug.name,
                                dosage: drug.dosage,
                                frequency: drug.frequency,
                                duration: drug.duration,
                                instructions: drug.instructions,
                                route: drug.route,
                              }
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
                      onClick={handleSaveInvestigationTemplate}
                    >
                      Save Template
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowInvTemplates(!showInvTemplates)}
                    >
                      <Lightbulb className="w-4 h-4 mr-1" />
                      Templates ({savedInvestigationTemplates.length})
                    </Button>
                  </div>
                </div>

                {showInvTemplates && (
                  <div className="mb-4 p-4 bg-teal-50 rounded-xl border border-teal-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm text-teal-800">📋 Investigation Templates</h4>
                      <button type="button" onClick={() => setShowInvTemplates(false)} className="text-teal-400 hover:text-teal-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {savedInvestigationTemplates.length > 0 && (
                      <div className="mb-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700">Saved prescription templates</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {savedInvestigationTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => applyInvestigationSectionTemplate(template)}
                              className="text-left p-2.5 bg-white rounded-lg border border-teal-200 hover:border-teal-500 hover:bg-teal-50/50 transition-colors"
                            >
                              <div className="font-medium text-sm text-gray-800">{template.label}</div>
                              <div className="text-xs text-gray-500">
                                {template.value.length} investigation{template.value.length === 1 ? '' : 's'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {investigationTemplates.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700">Quick-add common investigations</div>
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
                    {savedInvestigationTemplates.length === 0 && investigationTemplates.length === 0 && (
                      <p className="text-sm text-teal-900/80">Save an investigation set once, then reuse it from here.</p>
                    )}
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

      {printingPrescription && (
        <PrescriptionPrint
          prescription={{
            id: printingPrescription.id,
            prescribed_date: printingPrescription.prescribed_date || new Date().toISOString(),
            chief_complaint: printingPrescription.chief_complaint || '',
            on_examination: printingPrescription.on_examination || '',
            diagnosis: printingPrescription.diagnosis || '',
            treatment_plan: printingPrescription.treatment_plan || '',
            medications: Array.isArray(printingPrescription.medications) ? printingPrescription.medications : [],
            investigations: Array.isArray(printingPrescription.investigations) ? printingPrescription.investigations : [],
            notes: printingPrescription.notes || '',
          }}
          patient={{
            first_name: printingPatient?.first_name || printingPrescription.patients?.first_name || '',
            last_name: printingPatient?.last_name || printingPrescription.patients?.last_name || '',
            date_of_birth: printingPatient?.date_of_birth,
            gender: printingPatient?.gender,
            phone: printingPatient?.phone,
            patient_code: printingPatient?.patient_code,
            medical_history: printingPatient?.medical_history,
          }}
          doctor={doctorProfile || { full_name: '', degrees: '', designation: '', workplace: '' }}
          onClose={() => { setPrintingPrescription(null); setPrintingPatient(null) }}
        />
      )}
    </div>
  )
}

// Helper: shows recently-used chips from localStorage memory
function PrescMemoryChips({ memoryKey, onSelect }: { memoryKey: string; onSelect: (val: string) => void }) {
  const [items, setItems] = useState<string[]>([])
  useEffect(() => {
    setItems(getMemory(memoryKey).slice(0, 8))
  }, [memoryKey])
  if (items.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onSelect(item)}
          className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full border border-gray-200 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
        >
          {item.length > 40 ? item.slice(0, 40) + '…' : item}
        </button>
      ))}
    </div>
  )
}
