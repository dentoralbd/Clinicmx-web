import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, Lightbulb, X, Pencil, FlaskConical, CheckCircle, Stethoscope, Pill, Printer, Users, UserPlus, Sparkles, ChevronDown, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { createPatient, matchesPatientSearch } from '@/lib/patients'
import { PrescriptionPrint } from '@/components/PrescriptionPrint'
import { MEMORY_KEYS, rememberItem } from '@/lib/prescriptionMemory'
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
import { MedicalHistoryFields } from '@/components/MedicalHistoryFields'
import { getMedicalHistoryChecks, buildMedicalHistoryString } from '@/lib/medicalHistory'
import { mapEntryToOperation } from '@/lib/treatmentPlan'
import { type ClinicalEntry, collectSuggestedTeeth, createEmptyEntry, entriesToText, textToEntries } from '@/lib/clinicalEntries'
import { MultiEntryClinicalField } from '@/components/MultiEntryClinicalField'
import { getAgeTierFromDOB, deriveDateOfBirthFromAge, AGE_TIER_LABELS, type AgeTier } from '@/lib/ageTier'
import { WEIGHT_DOSING_FORMULAS } from '@/lib/weightDosingFormulas'
import { calculateWeightDose, formatWeightDoseSuggestion } from '@/lib/weightDosing'
import { isLiquidDosageForm, isSpoonableDosageForm, parseLiquidConcentration, calculateVolumeDose, formatVolumeDoseSuggestion } from '@/lib/liquidVolumeDosing'
import { routeToBengali, frequencyToBengali, durationToBengali, instructionsToBengali, dosageToBengali } from '@/lib/medicationBengali'
import { canDelete } from '@/lib/appSession'
import { logDeletion } from '@/lib/deleteHistory'
import { logEdit } from '@/lib/editHistory'

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
  const navigate = useNavigate()
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [medicationTemplates, setMedicationTemplates] = useState<any[]>([])
  const [investigationTemplates, setInvestigationTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set())
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
    chief_complaint_entries: [createEmptyEntry()] as ClinicalEntry[],
    on_examination_entries: [createEmptyEntry()] as ClinicalEntry[],
    diagnosis_entries: [createEmptyEntry()] as ClinicalEntry[],
    treatment_plan_entries: [createEmptyEntry()] as ClinicalEntry[],
    notes: '',
    prescribed_date: format(new Date(), 'yyyy-MM-dd'),
    medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
    investigations: [{ name: '', description: '', urgency: 'Routine' }],
  })

  const [medicalHistoryForm, setMedicalHistoryForm] = useState<{ checked: string[]; other: string }>({ checked: [], other: '' })

  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('existing')
  const [newPatientData, setNewPatientData] = useState({
    first_name: '', last_name: '', phone: '', date_of_birth: '', age: '', gender: 'Male',
  })

  // Weight for this visit — kept separate from formData so it can never interact with
  // the patient_id select's onChange/selectPatientHistory wiring below.
  const [prescriptionWeight, setPrescriptionWeight] = useState('')
  const [aiPanelOpenIndex, setAiPanelOpenIndex] = useState<number | null>(null)

  useEffect(() => {
    if (patientMode !== 'existing') return
    const selected = patients.find((p) => p.id === formData.patient_id)
    setPrescriptionWeight(selected?.weight != null ? String(selected.weight) : '')
  }, [formData.patient_id, patientMode, patients])

  function selectPatientHistory(patientId: string) {
    const selected = patients.find((p) => p.id === patientId)
    const { items, other } = getMedicalHistoryChecks(selected?.medical_history)
    setMedicalHistoryForm({ checked: items.filter((item) => item.checked).map((item) => item.label), other })
  }

  const [patientSearch, setPatientSearch] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState<any[] | null>(null)

  function handlePatientSearch() {
    const query = patientSearch.trim()
    if (!query) {
      setPatientSearchResults(null)
      return
    }
    const matches = patients.filter((patient) =>
      matchesPatientSearch(
        { name: `${patient.first_name || ''} ${patient.last_name || ''}`, code: patient.patient_code, phone: patient.phone },
        query
      )
    )
    setPatientSearchResults(matches)
  }

  function handlePatientSearchSelect(patient: any) {
    setFormData((prev: any) => ({ ...prev, patient_id: patient.id }))
    selectPatientHistory(patient.id)
    setPatientSearchResults(null)
    setPatientSearch('')
  }

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
        .select(`*, patients (first_name, last_name, patient_code, phone)`)
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
      let patientId = formData.patient_id

      if (patientMode === 'new') {
        if (!newPatientData.first_name || !newPatientData.last_name || !newPatientData.phone) {
          alert('Please fill in all required patient fields')
          return
        }
        const parsedAge = Number.parseInt(newPatientData.age, 10)
        const hasValidAge = !Number.isNaN(parsedAge) && parsedAge >= 0
        const dateOfBirth =
          newPatientData.date_of_birth || (hasValidAge ? deriveDateOfBirthFromAge(parsedAge) : '')
        if (!dateOfBirth) {
          alert('Please provide Date of Birth or Age for the new patient')
          return
        }
        const newPatient = await createPatient({
          first_name: newPatientData.first_name,
          last_name: newPatientData.last_name,
          phone: newPatientData.phone,
          date_of_birth: dateOfBirth,
          gender: newPatientData.gender,
        })
        patientId = newPatient.id
      }

      if (!patientId) {
        alert('Please select or create a patient')
        return
      }

      const payload: any = {
        patient_id: patientId,
        chief_complaint: entriesToText(formData.chief_complaint_entries),
        chief_complaint_entries: formData.chief_complaint_entries,
        on_examination: entriesToText(formData.on_examination_entries),
        on_examination_entries: formData.on_examination_entries,
        diagnosis: entriesToText(formData.diagnosis_entries),
        diagnosis_entries: formData.diagnosis_entries,
        treatment_plan: entriesToText(formData.treatment_plan_entries),
        treatment_plan_entries: formData.treatment_plan_entries,
        notes: formData.notes,
        prescribed_date: formData.prescribed_date,
        medications: formData.medications.filter((m) => m.name.trim()),
        investigations: formData.investigations.filter((i) => i.name.trim()),
        weight_at_prescription: prescriptionWeight ? Number.parseFloat(prescriptionWeight) : null,
      }

      await supabase
        .from('patients')
        .update({ medical_history: buildMedicalHistoryString(medicalHistoryForm.checked, medicalHistoryForm.other) })
        .eq('id', patientId)

      let prescriptionId = editingId
      if (editingId) {
        const previous = prescriptions.find((p) => p.id === editingId)
        if (previous) {
          const patientName = `${previous.patients?.first_name ?? ''} ${previous.patients?.last_name ?? ''}`.trim()
          await logEdit({
            entityType: 'prescription',
            entityId: editingId,
            entityLabel: previous.diagnosis || 'Prescription',
            patientId: previous.patient_id,
            patientName: patientName || null,
            previousPayload: previous,
          })
        }
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
        for (const entry of formData.chief_complaint_entries) {
          if (entry.text.trim()) rememberItem(MEMORY_KEYS.COMPLAINTS, entry.text)
        }
        for (const entry of formData.on_examination_entries) {
          if (entry.text.trim()) rememberItem(MEMORY_KEYS.EXAMINATIONS, entry.text)
        }
        for (const med of formData.medications) {
          if (med.name.trim()) rememberItem(MEMORY_KEYS.MEDICATIONS, med.name)
        }
        for (const inv of formData.investigations) {
          if (inv.name.trim()) rememberItem(MEMORY_KEYS.INVESTIGATIONS, inv.name)
        }
      }

      if (prescriptionId) {
        const { data: existingTreatmentRows } = await supabase
          .from('treatments')
          .select('id, prescription_entry_id, is_invoiced')
          .eq('prescription_id', prescriptionId)

        const currentEntries = formData.treatment_plan_entries.filter((entry) => entry.text.trim())
        const currentEntryIds = new Set(currentEntries.map((entry) => entry.id))

        const rowsByEntryId = new Map<string, Array<{ id: string; prescription_entry_id: string | null; is_invoiced: boolean }>>()
        for (const row of existingTreatmentRows || []) {
          const key = row.prescription_entry_id || ''
          if (!rowsByEntryId.has(key)) rowsByEntryId.set(key, [])
          rowsByEntryId.get(key)!.push(row)
        }

        const idsToDelete: string[] = []

        for (const entry of currentEntries) {
          const rowsForEntry = rowsByEntryId.get(entry.id) || []
          const reusableRows = rowsForEntry.filter((row) => !row.is_invoiced)
          const teethList = entry.teeth.length > 0 ? entry.teeth : [null]

          for (let i = 0; i < teethList.length; i++) {
            const operation = mapEntryToOperation(entry, teethList[i])
            const reuseRow = reusableRows[i]
            if (reuseRow) {
              await supabase.from('treatments').update(operation).eq('id', reuseRow.id)
            } else {
              await supabase.from('treatments').insert([{
                patient_id: patientId,
                prescription_id: prescriptionId,
                prescription_entry_id: entry.id,
                status: 'Planned',
                notes: 'Added from prescription treatment plan',
                ...operation,
              }])
            }
          }
          idsToDelete.push(...reusableRows.slice(teethList.length).map((row) => row.id))
        }

        // Entries removed entirely from the form: drop their non-invoiced rows too.
        for (const [entryId, rows] of rowsByEntryId.entries()) {
          if (entryId && !currentEntryIds.has(entryId)) {
            idsToDelete.push(...rows.filter((row) => !row.is_invoiced).map((row) => row.id))
          }
        }

        if (idsToDelete.length > 0 && canDelete()) {
          const { data: treatmentsToDelete } = await supabase
            .from('treatments')
            .select('*')
            .in('id', idsToDelete)
          for (const treatment of treatmentsToDelete || []) {
            await logDeletion({
              entityType: 'treatment',
              entityId: treatment.id,
              entityLabel: treatment.treatment_type,
              patientId: treatment.patient_id,
              patientName: null,
              payload: treatment,
            })
          }
          await supabase.from('treatments').delete().in('id', idsToDelete)
        }
      }

      setShowForm(false)
      resetForm()
      loadPrescriptions()
      loadTemplates()
      loadPatients()
    } catch (error) {
      console.error('Error saving prescription:', error)
      alert('Failed to save prescription')
    }
  }

  function startEdit(prescription: any) {
    setEditingId(prescription.id)
    setFormData({
      patient_id: prescription.patient_id || '',
      chief_complaint_entries: Array.isArray(prescription.chief_complaint_entries) && prescription.chief_complaint_entries.length > 0
        ? prescription.chief_complaint_entries
        : textToEntries(prescription.chief_complaint),
      on_examination_entries: Array.isArray(prescription.on_examination_entries) && prescription.on_examination_entries.length > 0
        ? prescription.on_examination_entries
        : textToEntries(prescription.on_examination),
      diagnosis_entries: Array.isArray(prescription.diagnosis_entries) && prescription.diagnosis_entries.length > 0
        ? prescription.diagnosis_entries
        : textToEntries(prescription.diagnosis),
      treatment_plan_entries: Array.isArray(prescription.treatment_plan_entries) && prescription.treatment_plan_entries.length > 0
        ? prescription.treatment_plan_entries
        : textToEntries(prescription.treatment_plan),
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
    setPatientMode('existing')
    selectPatientHistory(prescription.patient_id || '')
    setPrescriptionWeight(prescription.weight_at_prescription != null ? String(prescription.weight_at_prescription) : '')
    setShowForm(true)
  }

  async function handleDelete(prescription: any) {
    if (!canDelete()) return
    if (!confirm('Are you sure you want to delete this prescription?')) return
    try {
      const patientName = `${prescription.patients?.first_name ?? ''} ${prescription.patients?.last_name ?? ''}`.trim()
      await logDeletion({
        entityType: 'prescription',
        entityId: prescription.id,
        entityLabel: prescription.diagnosis || 'Prescription',
        patientId: prescription.patient_id,
        patientName: patientName || null,
        payload: prescription,
      })
      await supabase.from('prescriptions').delete().eq('id', prescription.id)
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
      chief_complaint_entries: [createEmptyEntry()],
      on_examination_entries: [createEmptyEntry()],
      diagnosis_entries: [createEmptyEntry()],
      treatment_plan_entries: [createEmptyEntry()],
      notes: '',
      prescribed_date: format(new Date(), 'yyyy-MM-dd'),
      medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
      investigations: [{ name: '', description: '', urgency: 'Routine' }],
    })
    setMedicalHistoryForm({ checked: [], other: '' })
    setPatientMode('existing')
    setNewPatientData({ first_name: '', last_name: '', phone: '', date_of_birth: '', age: '', gender: 'Male' })
    setPrescriptionWeight('')
    setAiPanelOpenIndex(null)
    setPatientSearch('')
    setPatientSearchResults(null)
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
        route: template.route || '',
      }
    } else {
      newMeds.push({
        name: template.name,
        dosage: template.dosage || '',
        frequency: template.frequency || '',
        duration: template.duration || '',
        instructions: template.instructions || '',
        route: template.route || '',
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
        urgency: template.urgency || 'Routine',
      }
    } else {
      newInvs.push({
        name: template.name,
        description: template.description || '',
        urgency: template.urgency || 'Routine',
      })
    }
    setFormData({ ...formData, investigations: newInvs })
    setShowInvTemplates(false)
  }

  function applyMedicationSectionTemplate(template: SectionTemplate<MedicationTemplateItem[]>) {
    setFormData({
      ...formData,
      medications: template.value.length > 0
        ? template.value.map((item) => ({ ...item, route: item.route ?? '' }))
        : [{ name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
    })
    setShowMedTemplates(false)
  }

  function applyInvestigationSectionTemplate(template: SectionTemplate<InvestigationTemplateItem[]>) {
    setFormData({
      ...formData,
      investigations: template.value.length > 0
        ? template.value.map((item) => ({ ...item, urgency: item.urgency ?? 'Routine' }))
        : [{ name: '', description: '', urgency: 'Routine' }],
    })
    setShowInvTemplates(false)
  }

  async function handleSaveComplaintTemplate(text: string) {
    setComplaintTemplates(await saveComplaintTemplate(text))
    setShowComplaintTemplates(true)
  }

  async function handleSaveExaminationTemplate(text: string) {
    setExaminationTemplates(await saveExaminationTemplate(text))
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
      route: med.route || '',
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
      urgency: inv.urgency || 'Routine',
    }
    if (emptyIndex >= 0) {
      newInvs[emptyIndex] = item
    } else {
      newInvs.push(item)
    }
    setFormData({ ...formData, investigations: newInvs })
  }

  const filteredPrescriptions = prescriptions.filter((p) => {
    const term = searchTerm.toLowerCase()
    const patientName = `${p.patients?.first_name} ${p.patients?.last_name}`.toLowerCase()
    return (
      patientName.includes(term) ||
      p.diagnosis?.toLowerCase().includes(term) ||
      p.patients?.patient_code?.toLowerCase().includes(term) ||
      p.patients?.phone?.toLowerCase().includes(term)
    )
  })

  // Prescriptions are already sorted newest-first, so groups come out ordered by
  // each patient's most recent prescription and stay newest-first within a group.
  const groupedPrescriptions: Array<{ patientId: string; patient: any; prescriptions: any[] }> = []
  {
    const byPatient = new Map<string, { patientId: string; patient: any; prescriptions: any[] }>()
    for (const p of filteredPrescriptions) {
      let group = byPatient.get(p.patient_id)
      if (!group) {
        group = { patientId: p.patient_id, patient: p.patients, prescriptions: [] }
        byPatient.set(p.patient_id, group)
        groupedPrescriptions.push(group)
      }
      group.prescriptions.push(p)
    }
  }

  function togglePatientExpanded(patientId: string) {
    setExpandedPatients((prev) => {
      const next = new Set(prev)
      if (next.has(patientId)) {
        next.delete(patientId)
      } else {
        next.add(patientId)
      }
      return next
    })
  }

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
          {groupedPrescriptions.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">No prescriptions found</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {groupedPrescriptions.map((group) => {
                const isExpanded = searchTerm.trim() !== '' || expandedPatients.has(group.patientId)
                const latest = group.prescriptions[0]
                return (
                  <div key={group.patientId}>
                    <div
                      className="flex items-center gap-3 px-4 sm:px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => togglePatientExpanded(group.patientId)}
                    >
                      <ChevronDown
                        className={`w-4 h-4 text-text-secondary flex-shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">
                            {group.patient?.first_name} {group.patient?.last_name}
                          </span>
                          {group.patient?.patient_code && (
                            <span className="text-xs text-text-secondary bg-gray-100 px-2 py-0.5 rounded">
                              {group.patient.patient_code}
                            </span>
                          )}
                          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {group.prescriptions.length} prescription{group.prescriptions.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-xs text-text-secondary mt-0.5">
                          Last: {safeFormat(latest.prescribed_date, 'MMM d, yyyy')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/patients/${group.patientId}`)
                        }}
                        className="p-2 text-text-secondary hover:text-primary hover:bg-gray-100 rounded-lg flex-shrink-0"
                        title="View profile"
                      >
                        <User className="w-4 h-4" />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="overflow-x-auto bg-gray-50/60 border-t border-gray-100">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="pl-11 pr-6 py-2 text-left text-xs font-medium text-text-secondary uppercase">Date</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-text-secondary uppercase">Diagnosis</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-text-secondary uppercase">Medications</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-text-secondary uppercase">Investigations</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-text-secondary uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {group.prescriptions.map((prescription) => (
                              <tr key={prescription.id} className="hover:bg-gray-100/60">
                                <td className="pl-11 pr-6 py-3 text-sm">
                                  {safeFormat(prescription.prescribed_date, 'MMM d, yyyy')}
                                </td>
                                <td className="px-6 py-3 text-sm">{prescription.diagnosis || 'N/A'}</td>
                                <td className="px-6 py-3 text-sm">
                                  {Array.isArray(prescription.medications) && prescription.medications.length > 0
                                    ? `${prescription.medications.length} medication(s)`
                                    : 'None'}
                                </td>
                                <td className="px-6 py-3 text-sm">
                                  {Array.isArray(prescription.investigations) && prescription.investigations.length > 0
                                    ? `${prescription.investigations.length} test(s)`
                                    : 'None'}
                                </td>
                                <td className="px-6 py-3 text-sm">
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
                                    {canDelete() && (
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(prescription)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
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
                {!editingId && (
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setPatientMode('existing')}
                      className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition ${
                        patientMode === 'existing'
                          ? 'bg-primary text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      Existing Patient
                    </button>
                    <button
                      type="button"
                      onClick={() => setPatientMode('new')}
                      className={`flex-1 py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition ${
                        patientMode === 'new'
                          ? 'bg-primary text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      <UserPlus className="w-4 h-4" />
                      New Patient
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {patientMode === 'existing' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Search by name / phone</label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handlePatientSearch()
                            }
                          }}
                          placeholder="Patient name or phone number"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        />
                        <Button type="button" variant="outline" onClick={handlePatientSearch}>
                          <Search className="w-4 h-4 mr-1" />
                          Search
                        </Button>
                      </div>
                      {patientSearchResults && (
                        patientSearchResults.length === 0 ? (
                          <p className="mb-2 text-sm text-gray-600">No matching patient found.</p>
                        ) : (
                          <div className="mb-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto bg-white">
                            {patientSearchResults.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handlePatientSearchSelect(p)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                              >
                                <span className="font-medium text-sm">{p.first_name} {p.last_name}</span>
                                <span className="text-xs text-gray-500 ml-2">
                                  {p.patient_code ? `${p.patient_code} • ` : ''}{p.phone || 'No phone'}
                                </span>
                              </button>
                            ))}
                          </div>
                        )
                      )}
                      <label className="block text-sm font-medium text-gray-700 mb-1">Patient *</label>
                      <select
                        required
                        value={formData.patient_id}
                        onChange={(e) => {
                          setFormData({ ...formData, patient_id: e.target.value })
                          selectPatientHistory(e.target.value)
                        }}
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
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                        <input
                          type="text"
                          required
                          value={newPatientData.first_name}
                          onChange={(e) => setNewPatientData({ ...newPatientData, first_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                        <input
                          type="text"
                          required
                          value={newPatientData.last_name}
                          onChange={(e) => setNewPatientData({ ...newPatientData, last_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          placeholder="Doe"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                        <input
                          type="tel"
                          required
                          value={newPatientData.phone}
                          onChange={(e) => setNewPatientData({ ...newPatientData, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          placeholder="+1234567890"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                        <input
                          type="date"
                          value={newPatientData.date_of_birth}
                          onChange={(e) => setNewPatientData({ ...newPatientData, date_of_birth: e.target.value })}
                          required={!newPatientData.age}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                        <input
                          type="number"
                          min={0}
                          max={130}
                          value={newPatientData.age}
                          onChange={(e) => setNewPatientData({ ...newPatientData, age: e.target.value })}
                          required={!newPatientData.date_of_birth}
                          placeholder="Enter age if DOB is unknown"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                        <select
                          value={newPatientData.gender}
                          onChange={(e) => setNewPatientData({ ...newPatientData, gender: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <p className="md:col-span-2 text-sm text-gray-500">Provide either Date of Birth or Age.</p>
                    </>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={formData.prescribed_date}
                      onChange={(e) => setFormData({ ...formData, prescribed_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg) for this visit</label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={prescriptionWeight}
                      onChange={(e) => setPrescriptionWeight(e.target.value)}
                      placeholder="Defaults from patient profile"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* ── Medical History ── */}
              {(formData.patient_id || patientMode === 'new') && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Medical History</div>
                  <MedicalHistoryFields
                    checked={medicalHistoryForm.checked}
                    other={medicalHistoryForm.other}
                    onChange={setMedicalHistoryForm}
                  />
                </div>
              )}

              {/* ── Chief Complaint ── */}
              <MultiEntryClinicalField
                label="Chief Complaint"
                entries={formData.chief_complaint_entries}
                onChange={(entries) => setFormData({ ...formData, chief_complaint_entries: entries })}
                placeholder="e.g., Toothache, Bleeding gums, Sensitivity to cold..."
                memoryKey={MEMORY_KEYS.COMPLAINTS}
                pickerMode="quadrant"
                templates={{
                  list: complaintTemplates,
                  show: showComplaintTemplates,
                  onToggleShow: () => setShowComplaintTemplates(!showComplaintTemplates),
                  onSaveEntry: handleSaveComplaintTemplate,
                  accent: 'amber',
                  emptyHint: 'Save a complaint once, then reuse it from here.',
                }}
              />

              {/* ── On Examination ── */}
              <MultiEntryClinicalField
                label="On Examination"
                entries={formData.on_examination_entries}
                onChange={(entries) => setFormData({ ...formData, on_examination_entries: entries })}
                placeholder="e.g., Deep caries in 36, Periapical pathology on OPG, Pocket depth 5mm..."
                memoryKey={MEMORY_KEYS.EXAMINATIONS}
                templates={{
                  list: examinationTemplates,
                  show: showExamTemplates,
                  onToggleShow: () => setShowExamTemplates(!showExamTemplates),
                  onSaveEntry: handleSaveExaminationTemplate,
                  accent: 'sky',
                  emptyHint: 'Save examination notes once, then reuse them from here.',
                }}
              />

              {/* ── Diagnosis ── */}
              <MultiEntryClinicalField
                label="Clinical Diagnosis"
                entries={formData.diagnosis_entries}
                onChange={(entries) => setFormData({ ...formData, diagnosis_entries: entries })}
                placeholder="Enter diagnosis"
                helperText="e.g., Dental caries (K02.1), Periapical abscess (K04.7)"
                suggestedTeeth={collectSuggestedTeeth([formData.on_examination_entries])}
              />

              {/* ── Treatment Plan ── */}
              <MultiEntryClinicalField
                label="Treatment Plan"
                entries={formData.treatment_plan_entries}
                onChange={(entries) => setFormData({ ...formData, treatment_plan_entries: entries })}
                placeholder="e.g., RCT + Cap"
                helperText="Each entry is added to this patient's Operations tab as its own treatment record, individually selectable for invoicing."
                suggestedTeeth={collectSuggestedTeeth([formData.on_examination_entries, formData.diagnosis_entries])}
              />

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
                              const selectedPatientDOB =
                                patientMode === 'new'
                                  ? newPatientData.date_of_birth ||
                                    (newPatientData.age ? deriveDateOfBirthFromAge(Number.parseInt(newPatientData.age, 10)) : '')
                                  : patients.find((p) => p.id === formData.patient_id)?.date_of_birth
                              const defaultTier = getAgeTierFromDOB(selectedPatientDOB)
                              newMeds[index] = {
                                ...newMeds[index],
                                name: drug.name,
                                dosage: dosageToBengali(drug.ageDosing[defaultTier]),
                                frequency: frequencyToBengali(drug.frequency, drug.category),
                                duration: durationToBengali(drug.duration),
                                instructions: instructionsToBengali(drug.instructions),
                                route: routeToBengali(drug.route),
                                ageDosing: drug.ageDosing,
                                generic: drug.generic,
                                dosageForm: drug.dosageForm,
                                selectedAgeTier: defaultTier,
                                dosageSource: 'manual',
                              } as any
                              setFormData({ ...formData, medications: newMeds })
                              setAiPanelOpenIndex((current) => (current === index ? null : current))
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
                      {(med as any).ageDosing && (() => {
                        const ageDosing = (med as any).ageDosing as { infant: string; child: string; adult: string }
                        const generic = (med as any).generic as string | undefined
                        const dosageSource = (med as any).dosageSource as string | undefined
                        const selectedTier = ((med as any).selectedAgeTier ?? 'adult') as AgeTier
                        const selectedPatientDOB =
                          patientMode === 'new'
                            ? newPatientData.date_of_birth ||
                              (newPatientData.age ? deriveDateOfBirthFromAge(Number.parseInt(newPatientData.age, 10)) : '')
                            : patients.find((p) => p.id === formData.patient_id)?.date_of_birth
                        const aiTier = getAgeTierFromDOB(selectedPatientDOB)
                        const weightKg = prescriptionWeight ? Number.parseFloat(prescriptionWeight) : 0
                        const formula = generic && aiTier !== 'adult' ? WEIGHT_DOSING_FORMULAS[generic]?.[aiTier] : undefined
                        const estimate = formula && weightKg > 0 ? calculateWeightDose(formula, weightKg) : null
                        const dosageForm = (med as any).dosageForm as string | undefined
                        const concentration = dosageForm && isLiquidDosageForm(dosageForm) ? parseLiquidConcentration(dosageForm) : null
                        const volume = estimate && concentration ? calculateVolumeDose(estimate, concentration.mgPerMl) : null
                        const volumeText = volume && dosageForm ? formatVolumeDoseSuggestion(volume, estimate?.dosesPerDay, isSpoonableDosageForm(dosageForm)) : null

                        return (
                          <div className="mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-gray-500">Dosing for:</span>
                              <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
                                {(['infant', 'child', 'adult'] as const).map((tier) => (
                                  <button
                                    key={tier}
                                    type="button"
                                    onClick={() => {
                                      const newMeds = [...formData.medications]
                                      newMeds[index] = {
                                        ...newMeds[index],
                                        selectedAgeTier: tier,
                                        dosage: dosageToBengali(ageDosing[tier]),
                                        dosageSource: 'manual',
                                      } as any
                                      setFormData({ ...formData, medications: newMeds })
                                      setAiPanelOpenIndex((current) => (current === index ? null : current))
                                    }}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                      selectedTier === tier && dosageSource !== 'ai-estimate'
                                        ? 'bg-primary text-white'
                                        : 'text-gray-600 hover:bg-gray-200'
                                    }`}
                                  >
                                    {AGE_TIER_LABELS[tier]}
                                  </button>
                                ))}
                                {!!estimate && (
                                  <button
                                    type="button"
                                    onClick={() => setAiPanelOpenIndex((current) => (current === index ? null : index))}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1 ${
                                      dosageSource === 'ai-estimate'
                                        ? 'bg-gradient-to-r from-primary to-highlight text-white shadow-md shadow-primary/30 scale-[1.03]'
                                        : 'text-primary bg-white hover:bg-gradient-to-r hover:from-primary/10 hover:to-highlight/10 border border-primary/20 hover:shadow-sm'
                                    }`}
                                  >
                                    <Sparkles className={`w-3 h-3 ${dosageSource === 'ai-estimate' ? 'animate-pulse' : ''}`} /> AI
                                  </button>
                                )}
                              </div>
                            </div>

                            {aiPanelOpenIndex === index && estimate && (
                              <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-gray-700">
                                <div className="font-medium text-gray-800 mb-1">
                                  ✨ Estimated from weight ({weightKg}kg, {AGE_TIER_LABELS[aiTier]} tier)
                                </div>
                                <div>{formatWeightDoseSuggestion(estimate)}</div>
                                {volumeText && <div className="font-medium text-primary">{volumeText}</div>}
                                <div className="mt-1 text-gray-500">Based on: "{estimate.sourceText}"</div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newMeds = [...formData.medications]
                                      newMeds[index] = {
                                        ...newMeds[index],
                                        selectedAgeTier: aiTier,
                                        dosage: volumeText
                                          ? `${formatWeightDoseSuggestion(estimate)}; ${volumeText}`
                                          : formatWeightDoseSuggestion(estimate),
                                        dosageSource: 'ai-estimate',
                                      } as any
                                      setFormData({ ...formData, medications: newMeds })
                                      setAiPanelOpenIndex(null)
                                    }}
                                    className="px-3 py-1 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90"
                                  >
                                    Use this dosage
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAiPanelOpenIndex(null)}
                                    className="px-3 py-1 rounded-md border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-100"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                                <div className="mt-1 text-amber-700">⚠️ Estimate — verify before prescribing.</div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
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
            patient_id: printingPrescription.patient_id,
            prescribed_date: printingPrescription.prescribed_date || new Date().toISOString(),
            chief_complaint: printingPrescription.chief_complaint || '',
            chief_complaint_entries: printingPrescription.chief_complaint_entries,
            on_examination: printingPrescription.on_examination || '',
            on_examination_entries: printingPrescription.on_examination_entries,
            diagnosis: printingPrescription.diagnosis || '',
            diagnosis_entries: printingPrescription.diagnosis_entries,
            treatment_plan: printingPrescription.treatment_plan || '',
            treatment_plan_entries: printingPrescription.treatment_plan_entries,
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
