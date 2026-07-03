import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Calendar as CalendarIcon, FileText, Activity, DollarSign, Pill, Trash2, Lightbulb, Pencil, Upload, Image, X, User, FolderOpen, MessageSquare, FlaskConical, CheckCircle, Stethoscope, Printer, Sparkles, Phone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PatientHeader } from '@/components/PatientHeader'
import { ActivityTimeline, type TimelineItem } from '@/components/ActivityTimeline'
import { AppointmentModal } from '@/components/AppointmentModal'
import { InvoiceModal } from '@/components/InvoiceModal'
import { PaymentEntryModal } from '@/components/PaymentEntryModal'
import { PaymentHistoryPanel } from '@/components/PaymentHistoryPanel'
import { PrescriptionPrint } from '@/components/PrescriptionPrint'
import { buildInvoiceItemPreview, extractTreatmentIdsFromInvoiceItems, formatInvoiceItemLabel, getInvoiceItemLineTotal, getInvoiceItemSubtotal } from '@/lib/billing'
import { supabase } from '@/lib/supabase'
import { MEMORY_KEYS, rememberItem } from '@/lib/prescriptionMemory'
import { loadDoctorProfile as loadSavedDoctorProfile } from '@/lib/doctorProfile'
import { MEDICAL_HISTORY_LABELS, getMedicalHistoryChecks, buildMedicalHistoryString } from '@/lib/medicalHistory'
import { MedicalHistoryFields } from '@/components/MedicalHistoryFields'
import { mapEntryToOperation } from '@/lib/treatmentPlan'
import { type ClinicalEntry, createEmptyEntry, entriesToText, textToEntries } from '@/lib/clinicalEntries'
import { MultiEntryClinicalField } from '@/components/MultiEntryClinicalField'
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
  type InvestigationTemplateItem,
  type MedicationTemplateItem,
  type SectionTemplate,
} from '@/lib/prescriptionSectionTemplates'
import { format } from 'date-fns'
import { formatBDT } from '@/lib/utils'
import { DrugPicker } from '@/components/DrugPicker'
import { getAgeTierFromDOB, AGE_TIER_LABELS, type AgeTier } from '@/lib/ageTier'
import { WEIGHT_DOSING_FORMULAS } from '@/lib/weightDosingFormulas'
import { calculateWeightDose, formatWeightDoseSuggestion } from '@/lib/weightDosing'
import { isLiquidDosageForm, isSpoonableDosageForm, parseLiquidConcentration, calculateVolumeDose, formatVolumeDoseSuggestion } from '@/lib/liquidVolumeDosing'

type SectionId =
  | 'profile'
  | 'medical'
  | 'clinical'
  | 'appointments'
  | 'prescriptions'
  | 'forms'
  | 'bookings'
  | 'treatment'
  | 'operations'
  | 'visits'
  | 'investigations'
  | 'files'
  | 'communications'
  | 'referrals'
  | 'consultations'
  | 'billing'

type TabId = 'overview' | 'clinical' | 'prescriptions' | 'appointments' | 'files' | 'billing'

const tabOptions: Array<{ id: TabId; label: string; shortLabel: string; icon: any; sections: SectionId[] }> = [
  { id: 'overview', label: 'Overview', shortLabel: 'Home', icon: User, sections: ['profile', 'communications', 'referrals'] },
  { id: 'clinical', label: 'Clinical', shortLabel: 'Clinical', icon: Stethoscope, sections: ['clinical', 'medical', 'visits', 'consultations', 'investigations'] },
  { id: 'prescriptions', label: 'Prescriptions', shortLabel: 'Rx', icon: Pill, sections: ['prescriptions'] },
  { id: 'appointments', label: 'Appointments', shortLabel: 'Appts', icon: CalendarIcon, sections: ['appointments', 'bookings'] },
  { id: 'files', label: 'Files & Forms', shortLabel: 'Files', icon: FolderOpen, sections: ['files', 'forms'] },
  { id: 'billing', label: 'Billing', shortLabel: 'Billing', icon: DollarSign, sections: ['billing', 'operations'] },
]

const sectionToTab = Object.fromEntries(
  tabOptions.flatMap((tab) => tab.sections.map((sectionId) => [sectionId, tab.id]))
) as Record<SectionId, TabId>

const sectionOptions: Array<{
  id: SectionId
  label: string
  description: string
  icon: any
}> = [
  { id: 'profile', label: 'Profile', description: 'Overview, balances, and quick stats', icon: User },
  { id: 'medical', label: 'Medical', description: 'History, notes, and care context', icon: Activity },
  { id: 'clinical', label: 'Clinical', description: 'Dental chart and treatment focus', icon: Activity },
  { id: 'appointments', label: 'Appointments', description: 'Full appointment history', icon: CalendarIcon },
  { id: 'prescriptions', label: 'Prescriptions', description: 'Medication plans and advice', icon: Pill },
  { id: 'forms', label: 'Forms', description: 'Intake documents and stored records', icon: FileText },
  { id: 'bookings', label: 'Bookings', description: 'Upcoming reservations and scheduling', icon: CalendarIcon },
  { id: 'operations', label: 'Operations', description: 'Treatments, progress, and cost', icon: Activity },
  { id: 'visits', label: 'Visits', description: 'Consultation history and findings', icon: FileText },
  { id: 'investigations', label: 'Investigations', description: 'Requested tests and follow-up', icon: Activity },
  { id: 'files', label: 'Files', description: 'Photos, x-rays, and uploads', icon: FolderOpen },
  { id: 'communications', label: 'Communications', description: 'Contact details and follow-up', icon: MessageSquare },
  { id: 'referrals', label: 'Referrals', description: 'External coordination snapshot', icon: FileText },
  { id: 'consultations', label: 'Consultations', description: 'Latest consultation summaries', icon: Activity },
  { id: 'billing', label: 'Billing', description: 'Invoices, payments, and due amounts', icon: DollarSign },
]

const legacySectionMap: Record<string, SectionId> = {
  overview: 'profile',
  'dental-chart': 'clinical',
  treatments: 'operations',
  appointments: 'appointments',
  prescriptions: 'prescriptions',
  visits: 'visits',
  billing: 'billing',
  files: 'files',
}

function formatCurrency(value: number) {
  return formatBDT(value)
}

function formatDateValue(value?: string | null, dateFormat = 'MMM d, yyyy') {
  if (!value) return 'N/A'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'

  return format(date, dateFormat)
}

function getInvoiceDue(invoice: any) {
  return (invoice.total_amount || 0) - (invoice.paid_amount || 0)
}

// ─── SESSION MEMORY HELPERS ───────────────────────────
const LOCAL_MEDS_KEY = 'clinicmx_local_medications'
const LOCAL_INVS_KEY = 'clinicmx_local_investigations'
const inMemoryMeds: any[] = []
const inMemoryInvs: any[] = []

function getLocalItems(key: string): any[] {
  if (key === LOCAL_MEDS_KEY) {
    return [...inMemoryMeds]
  }
  if (key === LOCAL_INVS_KEY) {
    return [...inMemoryInvs]
  }
  return []
}

function saveLocalItem(key: string, item: any) {
  if (!item.name?.trim()) return
  const target = key === LOCAL_MEDS_KEY ? inMemoryMeds : inMemoryInvs
  if (!target) return
  const items = [...target]
  const exists = items.some(
    (i: any) => i.name?.toLowerCase() === item.name?.toLowerCase()
  )
  if (!exists) {
    target.splice(0, target.length, ...[item, ...items].slice(0, 30))
  }
}
// ─────────────────────────────────────────────────────

export function PatientProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [patient, setPatient] = useState<any>(null)
  const [visits, setVisits] = useState<any[]>([])
  const [dentalRecords, setDentalRecords] = useState<any[]>([])
  const [treatments, setTreatments] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAppointmentForm, setShowAppointmentForm] = useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [payingInvoice, setPayingInvoice] = useState<any | null>(null)
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false)
  const [editingPrescriptionId, setEditingPrescriptionId] = useState<string | null>(null)
  const [medicationTemplates, setMedicationTemplates] = useState<any[]>([])
  const [investigationTemplates, setInvestigationTemplates] = useState<any[]>([])
  const [localMeds, setLocalMeds] = useState<any[]>([])
  const [localInvs, setLocalInvs] = useState<any[]>([])
  const [showMedTemplates, setShowMedTemplates] = useState(false)
  const [showInvTemplates, setShowInvTemplates] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fileCategory, setFileCategory] = useState<'profile_photo' | 'clinical_image' | 'xray_image'>('clinical_image')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showTreatmentPlanForm, setShowTreatmentPlanForm] = useState(false)
  const [treatmentPlanForm, setTreatmentPlanForm] = useState({
    treatment_type: '',
    tooth_number: '',
    description: '',
    status: 'Planned',
    cost: '',
    notes: '',
  })

  const [showMedicalHistoryForm, setShowMedicalHistoryForm] = useState(false)
  const [medicalHistoryForm, setMedicalHistoryForm] = useState<{ checked: string[]; other: string }>({ checked: [], other: '' })

  const [visitForm, setVisitForm] = useState({
    chief_complaint: '',
    examination_findings: '',
    diagnosis: '',
    treatment_plan: '',
    notes: '',
  })

  const [prescriptionForm, setPrescriptionForm] = useState({
    chief_complaint_entries: [createEmptyEntry()] as ClinicalEntry[],
    on_examination_entries: [createEmptyEntry()] as ClinicalEntry[],
    diagnosis_entries: [createEmptyEntry()] as ClinicalEntry[],
    treatment_plan_entries: [createEmptyEntry()] as ClinicalEntry[],
    medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }],
    investigations: [{ name: '', description: '' }],
    notes: '',
    weight: '',
  })
  const [aiPanelOpenIndex, setAiPanelOpenIndex] = useState<number | null>(null)

  const [printingPrescription, setPrintingPrescription] = useState<any | null>(null)
  const [doctorProfile, setDoctorProfile] = useState<any | null>(null)

  useEffect(() => {
    if (id) {
      loadPatientData()
      loadTemplates()
    }
    setLocalMeds(getLocalItems(LOCAL_MEDS_KEY))
    setLocalInvs(getLocalItems(LOCAL_INVS_KEY))
    loadDoctorProfile()
  }, [id])

  async function loadPatientData() {
    if (!id) return
    try {
      setLoading(true)
      
      const { data: patientData } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single()

      const { data: visitsData } = await supabase
        .from('patient_visits')
        .select('*')
        .eq('patient_id', id)
        .order('visit_date', { ascending: false })

      const { data: dentalData } = await supabase
        .from('dental_records')
        .select('*')
        .eq('patient_id', id)

      const { data: treatmentsData } = await supabase
        .from('treatments')
        .select('*')
        .eq('patient_id', id)
        .order('created_at', { ascending: false })

      const { data: prescriptionsData } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('patient_id', id)
        .order('prescribed_date', { ascending: false })

      const { data: appointmentsData } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', id)
        .order('date_time', { ascending: false })

      const { data: invoicesData } = await supabase
        .from('invoices')
        .select('*')
        .eq('patient_id', id)
        .order('created_at', { ascending: false })

      const { data: filesData } = await supabase
        .from('patient_files')
        .select('*')
        .eq('patient_id', id)
        .order('created_at', { ascending: false })

      setPatient(patientData)
      setVisits(visitsData || [])
      setDentalRecords(dentalData || [])
      setTreatments(treatmentsData || [])
      setPrescriptions(prescriptionsData || [])
      setAppointments(appointmentsData || [])
      setInvoices(invoicesData || [])
      setFiles(filesData || [])
    } catch (error) {
      console.error('Error loading patient:', error)
    } finally {
      setLoading(false)
    }
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

  async function saveToothCondition(toothNumber: number, condition: string, notes: string) {
    if (!id) return

    try {
      const existing = dentalRecords.find(r => r.tooth_number === toothNumber)
      
      if (existing) {
        await supabase
          .from('dental_records')
          .update({ condition, notes, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('dental_records')
          .insert([{
            patient_id: id,
            tooth_number: toothNumber,
            condition,
            notes,
          }])
      }
      
      loadPatientData()
      setSelectedTooth(null)
    } catch (error) {
      console.error('Error saving tooth:', error)
      alert('Failed to save')
    }
  }

  async function handleTreatmentPlanSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return

    try {
      await supabase.from('treatments').insert([{
        patient_id: id,
        tooth_number: treatmentPlanForm.tooth_number ? parseInt(treatmentPlanForm.tooth_number) : null,
        treatment_type: treatmentPlanForm.treatment_type,
        description: treatmentPlanForm.description || null,
        status: treatmentPlanForm.status,
        cost: parseFloat(treatmentPlanForm.cost) || 0,
        notes: treatmentPlanForm.notes || null,
      }])
      setShowTreatmentPlanForm(false)
      setTreatmentPlanForm({ treatment_type: '', tooth_number: '', description: '', status: 'Planned', cost: '', notes: '' })
      loadPatientData()
    } catch (error) {
      console.error('Error saving treatment plan:', error)
      alert('Failed to save treatment plan')
    }
  }

  async function updateTreatmentStatus(treatmentId: string, newStatus: string) {
    try {
      const { error } = await supabase.from('treatments').update({ status: newStatus }).eq('id', treatmentId)
      if (error) throw error
      setTreatments((prev) => prev.map((t) => (t.id === treatmentId ? { ...t, status: newStatus } : t)))
    } catch (error) {
      console.error('Error updating treatment status:', error)
      alert('Failed to update treatment status')
    }
  }

  function seedMedicalHistoryForm() {
    const { items, other } = getMedicalHistoryChecks(patient?.medical_history)
    setMedicalHistoryForm({ checked: items.filter((item) => item.checked).map((item) => item.label), other })
  }

  function openMedicalHistoryForm() {
    seedMedicalHistoryForm()
    setShowMedicalHistoryForm(true)
  }

  async function handleMedicalHistorySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return

    try {
      const medical_history = buildMedicalHistoryString(medicalHistoryForm.checked, medicalHistoryForm.other)
      await supabase.from('patients').update({ medical_history }).eq('id', id)
      setShowMedicalHistoryForm(false)
      loadPatientData()
    } catch (error) {
      console.error('Error saving medical history:', error)
      alert('Failed to save medical history')
    }
  }

  async function handleVisitSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return

    try {
      await supabase.from('patient_visits').insert([{
        patient_id: id,
        ...visitForm,
      }])
      setShowVisitForm(false)
      setVisitForm({
        chief_complaint: '',
        examination_findings: '',
        diagnosis: '',
        treatment_plan: '',
        notes: '',
      })
      loadPatientData()
    } catch (error) {
      console.error('Error saving visit:', error)
      alert('Failed to save visit')
    }
  }

  async function handlePrescriptionSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return

    try {
      const payload: any = {
        patient_id: id,
        prescribed_date: format(new Date(), 'yyyy-MM-dd'),
        chief_complaint: entriesToText(prescriptionForm.chief_complaint_entries),
        chief_complaint_entries: prescriptionForm.chief_complaint_entries,
        on_examination: entriesToText(prescriptionForm.on_examination_entries),
        on_examination_entries: prescriptionForm.on_examination_entries,
        diagnosis: entriesToText(prescriptionForm.diagnosis_entries),
        diagnosis_entries: prescriptionForm.diagnosis_entries,
        treatment_plan: entriesToText(prescriptionForm.treatment_plan_entries),
        treatment_plan_entries: prescriptionForm.treatment_plan_entries,
        medications: prescriptionForm.medications.filter(m => m.name.trim()),
        investigations: prescriptionForm.investigations.filter(i => i.name.trim()),
        notes: prescriptionForm.notes,
        weight_at_prescription: prescriptionForm.weight ? Number.parseFloat(prescriptionForm.weight) : null,
      }

      await supabase
        .from('patients')
        .update({ medical_history: buildMedicalHistoryString(medicalHistoryForm.checked, medicalHistoryForm.other) })
        .eq('id', id)

      let prescriptionId = editingPrescriptionId
      if (editingPrescriptionId) {
        await supabase.from('prescriptions').update(payload).eq('id', editingPrescriptionId)
      } else {
        const { data: inserted } = await supabase.from('prescriptions').insert([payload]).select().single()
        prescriptionId = inserted?.id || null

        // Save to session memory (legacy in-memory)
        for (const med of prescriptionForm.medications) {
          if (med.name.trim()) saveLocalItem(LOCAL_MEDS_KEY, med)
        }
        for (const inv of prescriptionForm.investigations) {
          if (inv.name.trim()) saveLocalItem(LOCAL_INVS_KEY, inv)
        }
        setLocalMeds(getLocalItems(LOCAL_MEDS_KEY))
        setLocalInvs(getLocalItems(LOCAL_INVS_KEY))

        // Save to localStorage-based smart memory
        for (const entry of prescriptionForm.chief_complaint_entries) {
          if (entry.text.trim()) rememberItem(MEMORY_KEYS.COMPLAINTS, entry.text)
        }
        for (const entry of prescriptionForm.on_examination_entries) {
          if (entry.text.trim()) rememberItem(MEMORY_KEYS.EXAMINATIONS, entry.text)
        }
        for (const med of prescriptionForm.medications) {
          if (med.name.trim()) rememberItem(MEMORY_KEYS.MEDICATIONS, med.name)
        }
        for (const inv of prescriptionForm.investigations) {
          if (inv.name.trim()) rememberItem(MEMORY_KEYS.INVESTIGATIONS, inv.name)
        }

        // Auto-save visit record if CC or OE is provided
        const flatChiefComplaint = entriesToText(prescriptionForm.chief_complaint_entries)
        const flatOnExamination = entriesToText(prescriptionForm.on_examination_entries)
        if (flatChiefComplaint.trim() || flatOnExamination.trim()) {
          try {
            await supabase.from('patient_visits').insert([{
              patient_id: id,
              visit_date: new Date().toISOString(),
              chief_complaint: flatChiefComplaint,
              examination_findings: flatOnExamination,
              diagnosis: entriesToText(prescriptionForm.diagnosis_entries),
            }])
          } catch {
            // non-fatal – visit record is optional
          }
        }
      }

      if (prescriptionId) {
        const { data: existingTreatmentRows } = await supabase
          .from('treatments')
          .select('id, prescription_entry_id, is_invoiced')
          .eq('prescription_id', prescriptionId)

        const currentEntries = prescriptionForm.treatment_plan_entries.filter((entry) => entry.text.trim())
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
                patient_id: id,
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

        if (idsToDelete.length > 0) {
          await supabase.from('treatments').delete().in('id', idsToDelete)
        }
      }

      setShowPrescriptionForm(false)
      setEditingPrescriptionId(null)
      setShowMedTemplates(false)
      setShowInvTemplates(false)
      setPrescriptionForm({
        chief_complaint_entries: [createEmptyEntry()],
        on_examination_entries: [createEmptyEntry()],
        diagnosis_entries: [createEmptyEntry()],
        treatment_plan_entries: [createEmptyEntry()],
        medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }],
        investigations: [{ name: '', description: '' }],
        notes: '',
        weight: '',
      })
      setAiPanelOpenIndex(null)
      loadPatientData()
      loadTemplates()
    } catch (error) {
      console.error('Error saving prescription:', error)
      alert('Failed to save prescription')
    }
  }

  function startNewPrescription() {
    setEditingPrescriptionId(null)
    setPrescriptionForm({
      chief_complaint_entries: [createEmptyEntry()],
      on_examination_entries: [createEmptyEntry()],
      diagnosis_entries: [createEmptyEntry()],
      treatment_plan_entries: [createEmptyEntry()],
      medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' } as any],
      investigations: [{ name: '', description: '', urgency: 'Routine' } as any],
      notes: '',
      weight: patient?.weight != null ? String(patient.weight) : '',
    } as any)
    setAiPanelOpenIndex(null)
    seedMedicalHistoryForm()
    setShowPrescriptionForm(true)
  }

  function startEditPrescription(prescription: any) {
    setEditingPrescriptionId(prescription.id)
    setPrescriptionForm({
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
      medications:
        Array.isArray(prescription.medications) && prescription.medications.length > 0
          ? prescription.medications
          : [{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }],
      investigations:
        Array.isArray(prescription.investigations) && prescription.investigations.length > 0
          ? prescription.investigations
          : [{ name: '', description: '' }],
      notes: prescription.notes || '',
      weight: prescription.weight_at_prescription != null
        ? String(prescription.weight_at_prescription)
        : (patient?.weight != null ? String(patient.weight) : ''),
    })
    setAiPanelOpenIndex(null)
    seedMedicalHistoryForm()
    setShowPrescriptionForm(true)
  }

  async function handleDeletePrescription(prescriptionId: string) {
    if (!confirm('Are you sure you want to delete this prescription?')) return
    try {
      await supabase.from('prescriptions').delete().eq('id', prescriptionId)
      loadPatientData()
    } catch (error) {
      console.error('Error deleting prescription:', error)
      alert('Failed to delete prescription')
    }
  }

  async function handleMarkInvoicePaid(invoiceId: string, totalAmount: number) {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'Paid',
          paid_amount: totalAmount,
        })
        .eq('id', invoiceId)

      if (error) throw error
      loadPatientData()
    } catch (error) {
      console.error('Error updating invoice:', error)
      alert('Failed to update invoice')
    }
  }

  async function handleDeleteInvoice(invoiceId: string) {
    if (!confirm('Delete this invoice?')) return

    try {
      const { error } = await supabase.from('invoices').delete().eq('id', invoiceId)
      if (error) throw error
      loadPatientData()
    } catch (error) {
      console.error('Error deleting invoice:', error)
      alert('Failed to delete invoice')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return

    setUploadingFile(true)
    try {
      const ext = file.name.split('.').pop()
      const storagePath = `${id}/${fileCategory}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(storagePath, file)

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('patient_files').insert([{
        patient_id: id,
        file_category: fileCategory,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
      }])

      if (dbError) throw dbError

      loadPatientData()
    } catch (error: any) {
      console.error('Error uploading file:', error)
      alert(`Failed to upload file: ${error.message || error}`)
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteFile(file: any) {
    if (!confirm(`Delete "${file.file_name}"?`)) return

    try {
      await supabase.storage.from('patient-files').remove([file.storage_path])
      await supabase.from('patient_files').delete().eq('id', file.id)
      loadPatientData()
    } catch (error) {
      console.error('Error deleting file:', error)
      alert('Failed to delete file')
    }
  }

  function getFilePublicUrl(storagePath: string) {
    const { data } = supabase.storage.from('patient-files').getPublicUrl(storagePath)
    return data.publicUrl
  }

  const getToothCondition = (toothNumber: number) => {
    const record = dentalRecords.find(r => r.tooth_number === toothNumber)
    return record?.condition || 'Healthy'
  }

  const getToothColor = (condition: string) => {
    const colors: Record<string, string> = {
      Healthy: 'fill-white stroke-gray-400',
      Cavity: 'fill-red-200 stroke-red-500',
      Filled: 'fill-blue-200 stroke-blue-500',
      'Root Canal': 'fill-purple-200 stroke-purple-500',
      Crown: 'fill-yellow-200 stroke-yellow-600',
      Missing: 'fill-gray-300 stroke-gray-500',
      Implant: 'fill-green-200 stroke-green-500',
    }
    return colors[condition] || colors.Healthy
  }

  // ── FDI dentition helpers ──────────────────────────────
  function getPatientAge(dob: string | null | undefined): number | null {
    if (!dob) return null
    const birth = new Date(dob)
    if (Number.isNaN(birth.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age
  }

  function getDentitionType(age: number | null): 'deciduous' | 'mixed' | 'permanent' {
    if (age === null || age > 16) return 'permanent'
    if (age >= 5) return 'mixed'
    return 'deciduous'
  }
  // ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-6 page-fade-in">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-32" />
        <div className="flex gap-2">
          {[...Array(7)].map((_, i) => <div key={i} className="skeleton h-9 w-24" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (!patient) {
    return <div className="p-6">Patient not found</div>
  }

  const requestedSection = searchParams.get('section') || 'profile'
  const activeSection = sectionOptions.some((section) => section.id === requestedSection)
    ? requestedSection as SectionId
    : (legacySectionMap[requestedSection] || 'profile')
  const activeTab = sectionToTab[activeSection] ?? 'overview'
  const activeTabMeta = tabOptions.find((tab) => tab.id === activeTab) || tabOptions[0]
  const totalBilled = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0)
  const totalDue = totalBilled - totalPaid
  const pendingInvoices = invoices.filter((invoice) => getInvoiceDue(invoice) > 0)
  const linkedTreatmentIds = extractTreatmentIdsFromInvoiceItems(
    invoices.flatMap((invoice) => (Array.isArray(invoice.items) ? invoice.items : []))
  )
  const pendingBillableTreatments = treatments.filter(
    (treatment) => !treatment.invoice_id && !treatment.is_invoiced && !linkedTreatmentIds.has(treatment.id)
  )
  const upcomingAppointments = [...appointments]
    .filter((appointment) => {
      const appointmentDate = new Date(appointment.date_time)
      return !Number.isNaN(appointmentDate.getTime()) && appointmentDate.getTime() >= Date.now()
    })
    .sort((left, right) => new Date(left.date_time).getTime() - new Date(right.date_time).getTime())
  const recentTransactions = [...invoices]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 4)
  const investigationItems = prescriptions.flatMap((prescription) => {
    if (!Array.isArray(prescription.investigations)) return []

    return prescription.investigations
      .filter((investigation: any) => investigation?.name?.trim())
      .map((investigation: any) => ({
        ...investigation,
        prescribedDate: prescription.prescribed_date,
        diagnosis: prescription.diagnosis,
      }))
  })
  const quickStats = [
    { label: 'Visits', value: visits.length, tone: 'bg-sky-50 text-sky-700' },
    { label: 'Treatments', value: treatments.length, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Files', value: files.length, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Pending', value: pendingInvoices.length, tone: 'bg-amber-50 text-amber-700' },
  ]
  const fileGroups = [
    {
      key: 'profile_photo',
      label: 'Profile Photos',
      files: files.filter((file) => file.file_category === 'profile_photo'),
    },
    {
      key: 'clinical_image',
      label: 'Clinical Images',
      files: files.filter((file) => file.file_category === 'clinical_image'),
    },
    {
      key: 'xray_image',
      label: 'X-Ray Images',
      files: files.filter((file) => file.file_category === 'xray_image'),
    },
  ]

  const profilePhoto = files.find((file) => file.file_category === 'profile_photo' && file.mime_type?.startsWith('image/'))
  const avatarUrl = profilePhoto ? getFilePublicUrl(profilePhoto.storage_path) : null
  const patientAge = getPatientAge(patient.date_of_birth)

  const { items: alertChecks, other: alertOther } = getMedicalHistoryChecks(patient.medical_history)
  const CRITICAL_ALERTS = ['Allergy', 'Bleeding disorder', 'Pregnant/Lactating mother']
  const medicalAlerts = [
    ...alertChecks
      .filter((item) => item.checked)
      .map((item) => ({
        label: item.label,
        severity: (CRITICAL_ALERTS.includes(item.label) ? 'critical' : 'warning') as 'critical' | 'warning',
      })),
    ...(alertOther ? [{ label: alertOther.slice(0, 40), severity: 'warning' as const }] : []),
  ]

  const completenessChecks: Array<[string, boolean]> = [
    ['Phone', !!patient.phone],
    ['Email', !!patient.email],
    ['Date of birth', !!patient.date_of_birth],
    ['Gender', !!patient.gender],
    ['Address', !!patient.address],
    ['Medical history', !!patient.medical_history],
    ['Weight', patient.weight != null],
    ['Profile photo', !!profilePhoto],
  ]
  const completeness = {
    percent: Math.round((completenessChecks.filter(([, done]) => done).length / completenessChecks.length) * 100),
    missing: completenessChecks.filter(([, done]) => !done).map(([label]) => label),
  }

  const treatmentCounts = {
    planned: treatments.filter((treatment) => treatment.status === 'Planned').length,
    inProgress: treatments.filter((treatment) => treatment.status === 'In Progress').length,
    completed: treatments.filter((treatment) => treatment.status === 'Completed').length,
  }
  const dentalConditionCounts = Object.entries(
    dentalRecords.reduce((acc: Record<string, number>, record) => {
      if (record.condition && record.condition !== 'Healthy') acc[record.condition] = (acc[record.condition] || 0) + 1
      return acc
    }, {})
  )

  const timelineItems: TimelineItem[] = [
    ...visits.map((visit) => ({
      id: `visit-${visit.id}`,
      type: 'visit' as const,
      date: visit.visit_date,
      title: 'Clinical visit',
      subtitle: visit.chief_complaint || visit.diagnosis || undefined,
      sectionId: 'visits',
    })),
    ...treatments.map((treatment) => ({
      id: `treatment-${treatment.id}`,
      type: 'treatment' as const,
      date: treatment.created_at,
      title: `Treatment — ${treatment.treatment_type}`,
      subtitle: treatment.tooth_number ? `Tooth #${treatment.tooth_number}` : undefined,
      badge: treatment.status,
      amountLabel: treatment.cost > 0 ? formatCurrency(treatment.cost) : undefined,
      sectionId: 'operations',
    })),
    ...prescriptions.map((prescription) => ({
      id: `rx-${prescription.id}`,
      type: 'prescription' as const,
      date: prescription.prescribed_date,
      title: 'Prescription',
      subtitle:
        prescription.diagnosis ||
        (Array.isArray(prescription.medications) ? `${prescription.medications.length} medication(s)` : undefined),
      sectionId: 'prescriptions',
    })),
    ...invoices.map((invoice) => ({
      id: `inv-${invoice.id}`,
      type: 'invoice' as const,
      date: invoice.created_at,
      title: 'Invoice',
      subtitle: getInvoiceDue(invoice) > 0 ? `Due ${formatCurrency(getInvoiceDue(invoice))}` : 'Paid in full',
      badge: invoice.status,
      amountLabel: formatCurrency(invoice.total_amount || 0),
      sectionId: 'billing',
    })),
    ...appointments.map((appointment) => ({
      id: `appt-${appointment.id}`,
      type: 'appointment' as const,
      date: appointment.date_time,
      title: 'Appointment',
      subtitle: appointment.treatment_type || appointment.notes || undefined,
      badge: appointment.status,
      sectionId: 'appointments',
    })),
    ...files.map((file) => ({
      id: `file-${file.id}`,
      type: 'file' as const,
      date: file.created_at,
      title: `File uploaded — ${file.file_name}`,
      subtitle: file.file_category === 'profile_photo' ? 'Profile photo' : file.file_category === 'xray_image' ? 'X-ray' : 'Clinical image',
      sectionId: 'files',
    })),
  ]

  function updateSection(section: SectionId) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', section)
    setSearchParams(nextParams)
  }

  function getSectionBadge(sectionId: SectionId) {
    switch (sectionId) {
      case 'appointments':
        return appointments.length
      case 'bookings':
        return upcomingAppointments.length
      case 'billing':
        return pendingInvoices.length
      case 'files':
      case 'forms':
        return files.length
      case 'investigations':
        return investigationItems.length
      case 'operations':
        return treatments.length
      case 'prescriptions':
        return prescriptions.length
      case 'visits':
      case 'consultations':
        return visits.length
      default:
        return undefined
    }
  }

  const renderProfileSection = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="flex flex-col gap-4">
          <InfoCard title="Patient Information">
            {patient.patient_code && (
              <div className="flex items-center justify-between py-1 border-b border-gray-100 mb-2">
                <span className="text-sm text-text-secondary font-medium">Patient ID</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                  {patient.patient_code}
                </span>
              </div>
            )}
            <InfoRow label="DOB" value={formatDateValue(patient.date_of_birth)} />
            <InfoRow label="Gender" value={patient.gender || 'N/A'} />
            <InfoRow label="Phone" value={patient.phone || 'N/A'} />
            <InfoRow label="Email" value={patient.email || 'N/A'} />
            <InfoRow label="Address" value={patient.address || 'N/A'} />
          </InfoCard>

          <InfoCard title="Quick Access">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {['medical', 'clinical', 'prescriptions', 'files'].map((sectionId) => {
                const section = sectionOptions.find((item) => item.id === sectionId)!
                const Icon = section.icon

                return (
                  <button
                    key={section.id}
                    onClick={() => updateSection(section.id)}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <div className="mt-3 font-medium">{section.label}</div>
                    <div className="mt-1 text-sm text-text-secondary">{section.description}</div>
                  </button>
                )
              })}
            </div>
          </InfoCard>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-primary via-primary/80 to-slate-900 p-4 sm:p-6 text-white shadow-sm">
          <p className="text-sm text-white/70">Financial dashboard</p>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(totalDue)}</div>
          <p className="mt-1 text-sm text-white/80">Current balance due</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-wide text-white/70">Paid</div>
              <div className="mt-1 text-lg font-semibold">{formatCurrency(totalPaid)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-wide text-white/70">Pending</div>
              <div className="mt-1 text-lg font-semibold">{pendingInvoices.length}</div>
            </div>
          </div>
          {totalBilled > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>Paid</span>
                <span>{Math.round((totalPaid / totalBilled) * 100)}% of {formatCurrency(totalBilled)}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-white/20">
                <div
                  className="h-2 rounded-full bg-emerald-300"
                  style={{ width: `${Math.min(100, Math.round((totalPaid / totalBilled) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <InfoCard title="Quick Stats">
          <div className="grid grid-cols-2 gap-3">
            {quickStats.map((stat) => (
              <div key={stat.label} className={`rounded-2xl px-4 py-3 ${stat.tone}`}>
                <div className="text-xs font-medium uppercase tracking-wide opacity-80">{stat.label}</div>
                <div className="mt-1 text-2xl font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>
        </InfoCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <InfoCard title="Upcoming Appointments">
          {upcomingAppointments.length === 0 ? (
            <EmptyState message="No upcoming appointments scheduled yet." />
          ) : (
            <div className="space-y-3">
              {upcomingAppointments.slice(0, 3).map((appointment) => (
                <button
                  key={appointment.id}
                  onClick={() => updateSection('appointments')}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{formatDateValue(appointment.date_time, 'MMMM d, yyyy h:mm a')}</div>
                      <div className="text-sm text-text-secondary">{appointment.type} • {appointment.duration} min</div>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                      {appointment.status || 'Scheduled'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </InfoCard>

        <InfoCard title="Recent Transactions">
          {recentTransactions.length === 0 ? (
            <EmptyState message="No invoices have been generated yet." />
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((invoice) => (
                <button
                  key={invoice.id}
                  onClick={() => updateSection('billing')}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{formatDateValue(invoice.created_at)}</div>
                      <div className="text-sm text-text-secondary">{invoice.status || 'Pending'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(invoice.total_amount || 0)}</div>
                      <div className="text-xs text-text-secondary">Due {formatCurrency(getInvoiceDue(invoice))}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </InfoCard>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <InfoCard title="Recent Activity">
          <div className="space-y-3">
            {visits.slice(0, 3).map((visit) => (
              <div key={visit.id} className="flex items-start gap-3 rounded-2xl bg-gray-50 p-4">
                <CalendarIcon className="mt-0.5 h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{formatDateValue(visit.visit_date)}</div>
                  <div className="text-sm text-text-secondary">{visit.chief_complaint || 'No complaint recorded'}</div>
                  {visit.diagnosis && <div className="mt-1 text-sm"><span className="font-medium">Diagnosis:</span> {visit.diagnosis}</div>}
                </div>
              </div>
            ))}
            {visits.length === 0 && <EmptyState message="No visits recorded for this patient." />}
          </div>
        </InfoCard>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <InfoCard title="Activity Timeline">
          <ActivityTimeline items={timelineItems} onNavigate={(sectionId) => updateSection(sectionId as SectionId)} />
        </InfoCard>
      </div>
    </div>
  )

  const renderMedicalSection = () => {
    const { items: historyChecks, other: historyOther } = getMedicalHistoryChecks(patient.medical_history)

    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <InfoCard title="Medical Snapshot">
          <InfoRow label="DOB" value={formatDateValue(patient.date_of_birth)} />
          <InfoRow label="Gender" value={patient.gender || 'N/A'} />
          <InfoRow label="Notes" value={patient.notes || 'No patient notes added yet'} />
        </InfoCard>

        <InfoCard title="Care Highlights">
          <InfoRow label="Latest Visit" value={visits[0] ? formatDateValue(visits[0].visit_date, 'MMMM d, yyyy h:mm a') : 'No visits yet'} />
          <InfoRow label="Latest Diagnosis" value={visits[0]?.diagnosis || prescriptions[0]?.diagnosis || 'No diagnosis recorded'} />
          <InfoRow label="Active Prescriptions" value={prescriptions.length.toString()} />
          <InfoRow label="Pending Balance" value={formatCurrency(totalDue)} className={totalDue > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'} />
        </InfoCard>

        <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-4 sm:p-6 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Medical History</h3>
            <Button size="sm" variant="outline" onClick={openMedicalHistoryForm}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          </div>
          <ul className="space-y-1.5">
            {historyChecks.map(({ label, checked }) => (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span>{checked ? '☑' : '☐'}</span>
                <span className={checked ? 'text-gray-900 font-medium' : 'text-text-secondary'}>{label}</span>
              </li>
            ))}
            <li className="flex items-center gap-2 text-sm">
              <span>{historyOther ? '☑' : '☐'}</span>
              <span className={historyOther ? 'text-gray-900 font-medium' : 'text-text-secondary'}>
                Other{historyOther ? `: ${historyOther}` : ''}
              </span>
            </li>
          </ul>
        </div>
      </div>
    )
  }

  const renderClinicalSection = () => {
    // FDI permanent quadrants (display order: distal → mesial)
    const Q1 = [18, 17, 16, 15, 14, 13, 12, 11] // upper right
    const Q2 = [21, 22, 23, 24, 25, 26, 27, 28] // upper left
    const Q3 = [31, 32, 33, 34, 35, 36, 37, 38] // lower left
    const Q4 = [48, 47, 46, 45, 44, 43, 42, 41] // lower right

    // FDI primary quadrants (display order: distal → mesial)
    const Q5 = [55, 54, 53, 52, 51] // upper right primary
    const Q6 = [61, 62, 63, 64, 65] // upper left primary
    const Q7 = [71, 72, 73, 74, 75] // lower left primary
    const Q8 = [85, 84, 83, 82, 81] // lower right primary

    const patientAge = getPatientAge(patient.date_of_birth)
    const dentitionType = getDentitionType(patientAge)

    const dentitionLabel: Record<typeof dentitionType, string> = {
      deciduous: 'Deciduous dentition (primary teeth)',
      mixed: 'Mixed dentition',
      permanent: 'Permanent dentition',
    }

    const renderArch = (
      leftQuadrant: number[],
      rightQuadrant: number[],
      label: string,
      isPrimary = false,
    ) => (
      <div className="mb-1">
        <p className="text-xs text-text-secondary text-center mb-1">{label}</p>
        <div className="flex justify-center items-center gap-px sm:gap-0.5">
          <div className="flex gap-px sm:gap-0.5">
            {leftQuadrant.map((num) => {
              const condition = getToothCondition(num)
              return (
                <Tooth
                  key={num}
                  number={num}
                  condition={condition}
                  color={getToothColor(condition)}
                  onClick={() => setSelectedTooth(num)}
                  small={isPrimary}
                />
              )
            })}
          </div>
          <div className="w-px h-10 bg-gray-300 mx-0.5 sm:mx-1" />
          <div className="flex gap-px sm:gap-0.5">
            {rightQuadrant.map((num) => {
              const condition = getToothCondition(num)
              return (
                <Tooth
                  key={num}
                  number={num}
                  condition={condition}
                  color={getToothColor(condition)}
                  onClick={() => setSelectedTooth(num)}
                  small={isPrimary}
                />
              )
            })}
          </div>
        </div>
      </div>
    )

    const conditionDotColors: Record<string, string> = {
      Cavity: 'bg-red-500',
      Filled: 'bg-blue-500',
      'Root Canal': 'bg-purple-500',
      Crown: 'bg-yellow-500',
      Missing: 'bg-gray-500',
      Implant: 'bg-green-500',
    }

    return (
      <div className="space-y-6">
        <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h3 className="font-semibold mb-3">Dental Summary</h3>
          {dentalRecords.length === 0 ? (
            <EmptyState message="No tooth conditions recorded yet. Tap a tooth on the chart below to add one." />
          ) : (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                {dentalRecords.length} recorded teeth
              </span>
              {dentalConditionCounts.map(([condition, count]) => (
                <span key={condition} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium">
                  <span className={`h-2 w-2 rounded-full ${conditionDotColors[condition] || 'bg-gray-400'}`} />
                  {condition}: {count}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h3 className="font-semibold mb-1 text-center">Dental Chart</h3>
          <p className="text-xs text-text-secondary text-center mb-5">
            {patientAge !== null ? `Age ${patientAge} · ` : ''}{dentitionLabel[dentitionType]}
          </p>

          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Labels row */}
              <div className="flex justify-between text-xs text-text-secondary mb-1 px-4">
                <span>Patient's Right</span>
                <span>Patient's Left</span>
              </div>

              {/* MAXILLA */}
              <div className="mb-4">
                <p className="text-xs font-medium text-center text-text-secondary mb-2 uppercase tracking-wide">Maxilla (Upper)</p>
                {(dentitionType === 'permanent' || dentitionType === 'mixed') && renderArch(Q1, Q2, 'Permanent')}
                {(dentitionType === 'deciduous' || dentitionType === 'mixed') && renderArch(Q5, Q6, dentitionType === 'mixed' ? 'Primary' : '', true)}
              </div>

              <div className="border-t border-dashed border-gray-300 my-3" />

              {/* MANDIBLE */}
              <div className="mt-4">
                <p className="text-xs font-medium text-center text-text-secondary mb-2 uppercase tracking-wide">Mandible (Lower)</p>
                {(dentitionType === 'deciduous' || dentitionType === 'mixed') && renderArch(Q8, Q7, dentitionType === 'mixed' ? 'Primary' : '', true)}
                {(dentitionType === 'permanent' || dentitionType === 'mixed') && renderArch(Q4, Q3, 'Permanent')}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 justify-center pt-5 border-t border-gray-200 mt-6">
            <Legend color="fill-white stroke-gray-400" label="Healthy" />
            <Legend color="fill-red-200 stroke-red-500" label="Cavity" />
            <Legend color="fill-blue-200 stroke-blue-500" label="Filled" />
            <Legend color="fill-purple-200 stroke-purple-500" label="Root Canal" />
            <Legend color="fill-yellow-200 stroke-yellow-600" label="Crown" />
            <Legend color="fill-gray-300 stroke-gray-500" label="Missing" />
            <Legend color="fill-green-200 stroke-green-500" label="Implant" />
          </div>
        </div>

        <InfoCard title="Treatment Summary">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricTile label="Total Treatments" value={treatments.length.toString()} />
            <MetricTile label="Completed" value={treatments.filter((treatment) => treatment.status === 'Completed').length.toString()} />
            <MetricTile label="In Progress" value={treatments.filter((treatment) => treatment.status === 'In Progress').length.toString()} />
          </div>
        </InfoCard>

        {/* Clinical Consultation History — CC and O/E from prescriptions */}
        {(visits.length > 0 || prescriptions.some(p => p.chief_complaint || p.on_examination)) && (
          <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Clinical Consultation History</h3>
                <p className="text-xs text-text-secondary mt-0.5">Chief complaints and examination findings from prescriptions</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => updateSection('prescriptions')}>
                View Prescriptions
              </Button>
            </div>
            {prescriptions.filter(p => p.chief_complaint || p.on_examination).length === 0 &&
             visits.filter(v => v.chief_complaint || v.examination_findings).length === 0 ? (
              <EmptyState message="No clinical findings recorded yet. Add CC and O/E when writing a prescription." />
            ) : (
              <div className="space-y-3">
                {/* Show from prescriptions (most recent 5) */}
                {prescriptions
                  .filter(p => p.chief_complaint || p.on_examination)
                  .slice(0, 5)
                  .map((prescription) => (
                    <div key={prescription.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-700">
                          {formatDateValue(prescription.prescribed_date, 'MMMM d, yyyy')}
                        </span>
                        {prescription.diagnosis && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 text-xs font-medium border border-blue-200">
                            {prescription.diagnosis.length > 40 ? prescription.diagnosis.slice(0, 40) + '…' : prescription.diagnosis}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {prescription.chief_complaint && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs">CC</span>
                            <span className="text-gray-700">{prescription.chief_complaint}</span>
                          </div>
                        )}
                        {prescription.on_examination && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-xs">O/E</span>
                            <span className="text-gray-700">{prescription.on_examination}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                {/* Also show from manually-entered visits that have clinical data */}
                {visits
                  .filter(v => v.chief_complaint || v.examination_findings)
                  .filter(v => !prescriptions.some(p =>
                    p.chief_complaint === v.chief_complaint &&
                    formatDateValue(p.prescribed_date) === formatDateValue(v.visit_date)
                  ))
                  .slice(0, 3)
                  .map((visit) => (
                    <div key={visit.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-700">
                          {formatDateValue(visit.visit_date, 'MMMM d, yyyy')}
                        </span>
                        {visit.diagnosis && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 text-xs font-medium border border-blue-200">
                            {visit.diagnosis.length > 40 ? visit.diagnosis.slice(0, 40) + '…' : visit.diagnosis}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {visit.chief_complaint && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs">CC</span>
                            <span className="text-gray-700">{visit.chief_complaint}</span>
                          </div>
                        )}
                        {visit.examination_findings && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-xs">O/E</span>
                            <span className="text-gray-700">{visit.examination_findings}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderVisitsSection = () => (
    <div className="bg-card rounded-3xl shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="font-semibold">Visit History</h3>
        <Button size="sm" onClick={() => setShowVisitForm(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add Visit
        </Button>
      </div>
      {visits.length === 0 ? (
        <div className="p-8 text-center text-text-secondary">No visits recorded</div>
      ) : (
        <div className="divide-y divide-gray-200">
          {visits.map((visit) => (
            <div key={visit.id} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarIcon className="w-4 h-4 text-text-secondary" />
                <span className="font-medium">{formatDateValue(visit.visit_date, 'MMMM d, yyyy h:mm a')}</span>
              </div>
              {visit.chief_complaint && <InfoRow label="Chief Complaint" value={visit.chief_complaint} />}
              {visit.examination_findings && <InfoRow label="Examination" value={visit.examination_findings} />}
              {visit.diagnosis && <InfoRow label="Diagnosis" value={visit.diagnosis} />}
              {visit.treatment_plan && <InfoRow label="Treatment Plan" value={visit.treatment_plan} />}
              {visit.notes && <InfoRow label="Notes" value={visit.notes} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderOperationsSection = () => (
    <div className="bg-card rounded-3xl shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Treatment History</h3>
          <p className="text-sm text-text-secondary mt-1">{pendingBillableTreatments.length} treatment(s) ready to bill</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => setShowInvoiceForm(true)} disabled={pendingBillableTreatments.length === 0}>
            Bill Pending Treatments
          </Button>
          <Button size="sm" onClick={() => setShowTreatmentPlanForm(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New Treatment Plan
          </Button>
        </div>
      </div>
      {treatments.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100">
            {treatmentCounts.planned > 0 && (
              <div className="bg-amber-400" style={{ width: `${(treatmentCounts.planned / treatments.length) * 100}%` }} />
            )}
            {treatmentCounts.inProgress > 0 && (
              <div className="bg-blue-500" style={{ width: `${(treatmentCounts.inProgress / treatments.length) * 100}%` }} />
            )}
            {treatmentCounts.completed > 0 && (
              <div className="bg-emerald-500" style={{ width: `${(treatmentCounts.completed / treatments.length) * 100}%` }} />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />{treatmentCounts.planned} planned</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" />{treatmentCounts.inProgress} in progress</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{treatmentCounts.completed} completed</span>
          </div>
        </div>
      )}
      {treatments.length === 0 ? (
        <div className="p-8 text-center text-text-secondary">No treatments recorded</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Treatment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Tooth</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Billing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {treatments.map((treatment) => (
                (() => {
                  const isLinked = !!treatment.invoice_id || !!treatment.is_invoiced || linkedTreatmentIds.has(treatment.id)
                  return (
                <tr key={treatment.id}>
                  <td className="px-4 py-3 text-sm">{formatDateValue(treatment.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{treatment.treatment_type}</div>
                    {treatment.description && <div className="text-sm text-text-secondary">{treatment.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm">{treatment.tooth_number || 'N/A'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={treatment.status}
                      onChange={(e) => updateTreatmentStatus(treatment.id, e.target.value)}
                      className={`px-2 py-1 text-xs rounded-full border-0 cursor-pointer ${
                        treatment.status === 'Completed' ? 'bg-green-100 text-green-800' :
                        treatment.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                        treatment.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <option value="Planned">Planned</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(treatment.cost || 0)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 text-xs rounded-full ${isLinked ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {isLinked ? 'Invoiced' : 'Ready to bill'}
                    </span>
                  </td>
                </tr>
                  )
                })()
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const renderPrescriptionsSection = () => (
    <div className="bg-card rounded-3xl shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="font-semibold">Prescription History</h3>
        <Button size="sm" onClick={startNewPrescription}>
          <Plus className="w-4 h-4 mr-1" />
          Add Prescription
        </Button>
      </div>
      {prescriptions.length === 0 ? (
        <div className="p-8 text-center text-text-secondary">No prescriptions recorded</div>
      ) : (
        <div className="p-4 space-y-4">
          {prescriptions.map((prescription) => (
            <div key={prescription.id} className="rounded-2xl border border-gray-200 shadow-sm bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-gray-800">{formatDateValue(prescription.prescribed_date, 'MMMM d, yyyy')}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      // Lazily reload doctor profile if not available
                      let doc = doctorProfile
                      if (!doc) {
                        try {
                          const data = await loadSavedDoctorProfile()
                          if (data) { setDoctorProfile(data); doc = data }
                        } catch { /* ignore */ }
                      }
                      setPrintingPrescription(prescription)
                    }}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
                    title="Print"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditPrescription(prescription)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePrescription(prescription.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* CC / O&E chips */}
              {(prescription.chief_complaint || prescription.on_examination) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {prescription.chief_complaint && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
                      CC: {prescription.chief_complaint}
                    </span>
                  )}
                  {prescription.on_examination && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 text-xs font-medium border border-purple-200">
                      O/E: {prescription.on_examination}
                    </span>
                  )}
                </div>
              )}
              {prescription.diagnosis && (
                <div className="mb-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-sm font-medium">
                    {prescription.diagnosis}
                  </span>
                </div>
              )}
              {Array.isArray(prescription.medications) && prescription.medications.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Pill className="w-3.5 h-3.5" /> Medications
                  </div>
                  <ol className="space-y-1.5">
                    {prescription.medications.map((med: any, idx: number) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                        <span>
                          <span className="font-semibold text-primary">Rx</span>
                          {' '}<span className="font-medium text-gray-800">{med.name}</span>
                          {med.dosage && <span className="text-gray-600"> · {med.dosage}</span>}
                          {med.frequency && <span className="text-gray-600"> · {med.frequency}</span>}
                          {med.duration && <span className="text-gray-600"> · {med.duration}</span>}
                          {med.instructions && <span className="text-gray-500 italic"> — {med.instructions}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {Array.isArray(prescription.investigations) && prescription.investigations.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <FlaskConical className="w-3.5 h-3.5" /> Investigations
                  </div>
                  <ul className="space-y-1">
                    {prescription.investigations.map((inv: any, idx: number) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <FlaskConical className="w-3.5 h-3.5 mt-0.5 text-teal-600 flex-shrink-0" />
                        <span>
                          <span className="font-medium text-gray-800">{inv.name}</span>
                          {inv.urgency && inv.urgency !== 'Routine' && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">{inv.urgency}</span>
                          )}
                          {inv.description && <span className="text-gray-500"> — {inv.description}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {prescription.notes && (
                <blockquote className="mt-3 border-l-4 border-primary/30 pl-3 text-sm text-gray-600 italic">
                  {prescription.notes}
                </blockquote>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderAppointmentsSection = () => (
    <div className="bg-card rounded-3xl shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold">Appointment History</h3>
        <Button onClick={() => setShowAppointmentForm(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Appointment
        </Button>
      </div>
      {appointments.length === 0 ? (
        <div className="p-8 text-center text-text-secondary">No appointments recorded</div>
      ) : (
        <div className="divide-y divide-gray-200">
          {appointments.map((appointment) => (
            <div key={appointment.id} className="p-4 flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="font-medium">{formatDateValue(appointment.date_time, 'MMMM d, yyyy h:mm a')}</div>
                <div className="text-sm text-text-secondary">{appointment.type} • {appointment.duration} min</div>
                {appointment.notes && <div className="text-sm mt-1">{appointment.notes}</div>}
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${
                appointment.status === 'Completed' ? 'bg-green-100 text-green-800' :
                appointment.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {appointment.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderBookingsSection = () => (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Upcoming Bookings</h3>
            <p className="mt-1 text-sm text-text-secondary">Manage the next patient visits and scheduling flow.</p>
          </div>
          <Button onClick={() => setShowAppointmentForm(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Schedule Booking
          </Button>
        </div>
      </div>

      <InfoCard title="Next Visits">
        {upcomingAppointments.length === 0 ? (
          <EmptyState message="No future bookings are currently scheduled." />
        ) : (
          <div className="space-y-3">
            {upcomingAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{formatDateValue(appointment.date_time, 'MMMM d, yyyy h:mm a')}</div>
                    <div className="text-sm text-text-secondary">{appointment.type} • {appointment.duration} min</div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    {appointment.status || 'Scheduled'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </InfoCard>
    </div>
  )

  const renderFormsSection = () => (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <InfoCard title="Stored Documents">
        <div className="space-y-3">
          {fileGroups.map((group) => (
            <button
              key={group.key}
              onClick={() => updateSection('files')}
              className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white hover:shadow-sm"
            >
              <div>
                <div className="font-medium">{group.label}</div>
                <div className="text-sm text-text-secondary">View and manage uploads</div>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                {group.files.length}
              </span>
            </button>
          ))}
        </div>
      </InfoCard>

      <InfoCard title="Form Notes">
        <InfoRow label="Patient Notes" value={patient.notes || 'No notes saved yet'} />
        <InfoRow label="Medical History" value={patient.medical_history || 'No history entered yet'} />
        <div className="pt-4">
          <Button onClick={() => updateSection('files')} className="w-full sm:w-auto">
            Open Files Workspace
          </Button>
        </div>
      </InfoCard>
    </div>
  )

  const renderInvestigationsSection = () => (
    <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h3 className="font-semibold">Investigations</h3>
          <p className="mt-1 text-sm text-text-secondary">Review requested investigations from saved prescriptions.</p>
        </div>
        <Button size="sm" onClick={() => updateSection('prescriptions')}>
          Review Prescriptions
        </Button>
      </div>

      {investigationItems.length === 0 ? (
        <EmptyState message="No investigations have been requested yet." />
      ) : (
        <div className="space-y-3">
          {investigationItems.map((investigation: any, index: number) => (
            <div key={`${investigation.name}-${investigation.prescribedDate}-${index}`} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">{investigation.name}</div>
                  <div className="text-sm text-text-secondary">{investigation.description || 'No extra instructions provided'}</div>
                </div>
                <span className="text-sm font-medium text-primary">{formatDateValue(investigation.prescribedDate)}</span>
              </div>
              {investigation.diagnosis && (
                <div className="mt-2 text-sm">
                  <span className="font-medium text-text-secondary">Linked diagnosis:</span> {investigation.diagnosis}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderFilesSection = () => (
    <div className="space-y-6">
      <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold mb-4">Upload File</h3>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              value={fileCategory}
              onChange={(e) => setFileCategory(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="profile_photo">Profile Photo</option>
              <option value="clinical_image">Clinical Image</option>
              <option value="xray_image">X-Ray Image</option>
            </select>
          </div>
          <div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploadingFile ? 'Uploading…' : 'Choose & Upload'}
            </Button>
          </div>
        </div>
      </div>

      {fileGroups.map((group) => {
        if (group.files.length === 0) return null

        return (
          <div key={group.key} className="bg-card rounded-3xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Image className="w-4 h-4 text-primary" />
              {group.label}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {group.files.map((file) => {
                const url = getFilePublicUrl(file.storage_path)
                const isImage = file.mime_type?.startsWith('image/')
                return (
                  <div key={file.id} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                    {isImage ? (
                      <img
                        src={url}
                        alt={file.file_name}
                        className="w-full h-32 object-cover cursor-pointer"
                        onClick={() => setPreviewUrl(url)}
                      />
                    ) : (
                      <div
                        className="w-full h-32 flex items-center justify-center cursor-pointer"
                        onClick={() => window.open(url, '_blank')}
                      >
                        <FileText className="w-10 h-10 text-gray-400" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs text-text-secondary truncate">{file.file_name}</p>
                      <p className="text-xs text-text-secondary">{formatDateValue(file.created_at)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(file)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {files.length === 0 && (
        <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-8 text-center text-text-secondary">
          No files uploaded yet. Use the upload area above to add patient files.
        </div>
      )}
    </div>
  )

  const renderCommunicationsSection = () => (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <InfoCard title="Patient Contact">
        <div className="space-y-3">
          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="text-sm text-text-secondary">Phone</div>
            <div className="mt-1 font-medium">{patient.phone || 'No phone provided'}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="text-sm text-text-secondary">Email</div>
            <div className="mt-1 font-medium">{patient.email || 'No email provided'}</div>
          </div>
          <div className="flex flex-wrap gap-3">
            {patient.phone && (
              <a
                href={`tel:${patient.phone}`}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                Call Patient
              </a>
            )}
            {patient.email && (
              <a
                href={`mailto:${patient.email}`}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
              >
                Send Email
              </a>
            )}
          </div>
        </div>
      </InfoCard>

      <InfoCard title="Follow-up Context">
        <InfoRow label="Next Appointment" value={upcomingAppointments[0] ? formatDateValue(upcomingAppointments[0].date_time, 'MMMM d, yyyy h:mm a') : 'No future appointment booked'} />
        <InfoRow label="Latest Complaint" value={visits[0]?.chief_complaint || 'No complaint recorded'} />
        <InfoRow label="Latest Notes" value={visits[0]?.notes || patient.notes || 'No follow-up note available'} />
      </InfoCard>
    </div>
  )

  const renderReferralsSection = () => (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <InfoCard title="Referral Snapshot">
        <InfoRow label="Latest Diagnosis" value={visits[0]?.diagnosis || prescriptions[0]?.diagnosis || 'No diagnosis recorded'} />
        <InfoRow label="Treatment Plan" value={visits[0]?.treatment_plan || 'No treatment plan documented'} />
        <InfoRow label="Files Available" value={files.length.toString()} />
      </InfoCard>

      <InfoCard title="Supporting Records">
        <div className="space-y-3">
          <button
            onClick={() => updateSection('files')}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white hover:shadow-sm"
          >
            <div className="font-medium">Open patient files</div>
            <div className="text-sm text-text-secondary">Review images, x-rays, and attached documentation.</div>
          </button>
          <button
            onClick={() => updateSection('consultations')}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white hover:shadow-sm"
          >
            <div className="font-medium">Review consultation notes</div>
            <div className="text-sm text-text-secondary">Use clinical history before sharing external referrals.</div>
          </button>
        </div>
      </InfoCard>
    </div>
  )

  const renderConsultationsSection = () => (
    <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold mb-4">Consultation Summaries</h3>
      {visits.length === 0 ? (
        <EmptyState message="No consultations recorded yet." />
      ) : (
        <div className="space-y-4">
          {visits.slice(0, 5).map((visit) => (
            <div key={visit.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-medium">{formatDateValue(visit.visit_date, 'MMMM d, yyyy h:mm a')}</div>
                <span className="text-sm text-primary">{visit.chief_complaint || 'General consultation'}</span>
              </div>
              {visit.diagnosis && <div className="mt-3 text-sm"><span className="font-medium text-text-secondary">Diagnosis:</span> {visit.diagnosis}</div>}
              {visit.treatment_plan && <div className="mt-2 text-sm"><span className="font-medium text-text-secondary">Plan:</span> {visit.treatment_plan}</div>}
              {visit.notes && <div className="mt-2 text-sm"><span className="font-medium text-text-secondary">Notes:</span> {visit.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderBillingSection = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-blue-50 border border-blue-200 p-5">
          <div className="text-sm text-blue-600 font-medium">Total Billed</div>
          <div className="mt-2 text-2xl font-bold text-blue-900">{formatCurrency(totalBilled)}</div>
        </div>
        <div className="rounded-3xl bg-green-50 border border-green-200 p-5">
          <div className="text-sm text-green-600 font-medium">Total Paid</div>
          <div className="mt-2 text-2xl font-bold text-green-900">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="rounded-3xl bg-red-50 border border-red-200 p-5">
          <div className="text-sm text-red-600 font-medium">Balance Due</div>
          <div className="mt-2 text-2xl font-bold text-red-900">{formatCurrency(totalDue)}</div>
        </div>
      </div>

      {totalBilled > 0 && (
        <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Payment progress</span>
            <span className="text-text-secondary">{Math.round((totalPaid / totalBilled) * 100)}% collected</span>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
            {totalPaid > 0 && <div className="bg-green-500" style={{ width: `${(totalPaid / totalBilled) * 100}%` }} />}
            {totalDue > 0 && <div className="bg-red-400" style={{ width: `${(totalDue / totalBilled) * 100}%` }} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Paid {formatCurrency(totalPaid)}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Due {formatCurrency(totalDue)}</span>
          </div>
        </div>
      )}

      <div className="bg-card rounded-3xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <h3 className="font-semibold">Invoice History</h3>
          <Button size="sm" onClick={() => setShowInvoiceForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
        </div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">No invoices recorded</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {invoices.map((invoice) => (
              <PatientInvoiceRow
                key={invoice.id}
                invoice={invoice}
                onMarkPaid={() => handleMarkInvoicePaid(invoice.id, invoice.total_amount || 0)}
                onDelete={() => handleDeleteInvoice(invoice.id)}
                onPaymentRecorded={loadPatientData}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  function renderActiveSection() {
    switch (activeSection) {
      case 'profile':
        return renderProfileSection()
      case 'medical':
        return renderMedicalSection()
      case 'clinical':
        return renderClinicalSection()
      case 'appointments':
        return renderAppointmentsSection()
      case 'prescriptions':
        return renderPrescriptionsSection()
      case 'forms':
        return renderFormsSection()
      case 'bookings':
        return renderBookingsSection()
      case 'operations':
        return renderOperationsSection()
      case 'visits':
        return renderVisitsSection()
      case 'investigations':
        return renderInvestigationsSection()
      case 'files':
        return renderFilesSection()
      case 'communications':
        return renderCommunicationsSection()
      case 'referrals':
        return renderReferralsSection()
      case 'consultations':
        return renderConsultationsSection()
      case 'billing':
        return renderBillingSection()
      default:
        return renderProfileSection()
    }
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6 page-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/patients')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      <PatientHeader
        patient={patient}
        avatarUrl={avatarUrl}
        age={patientAge}
        alerts={medicalAlerts}
        completeness={completeness}
        stats={[
          { label: 'Balance', value: formatCurrency(totalDue) },
          { label: 'Next visit', value: upcomingAppointments[0] ? formatDateValue(upcomingAppointments[0].date_time, 'MMM d') : 'Not set' },
          { label: 'Files', value: files.length.toString() },
        ]}
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <QuickActionButton icon={Plus} label="New Prescription" onClick={startNewPrescription} />
        <QuickActionButton icon={CalendarIcon} label="New Appointment" onClick={() => setShowAppointmentForm(true)} />
        <QuickActionButton
          icon={DollarSign}
          label="Record Payment"
          disabled={pendingInvoices.length === 0}
          onClick={() => {
            if (pendingInvoices.length === 1) {
              setPayingInvoice(pendingInvoices[0])
            } else {
              updateSection('billing')
            }
          }}
        />
        <QuickActionButton icon={Upload} label="Upload File" onClick={() => fileInputRef.current?.click()} />
        {patient.phone && (
          <a
            href={`tel:${patient.phone}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-text-primary whitespace-nowrap transition-all duration-200 hover:border-primary/40 hover:text-primary hover:shadow-sm"
          >
            <Phone className="h-4 w-4 text-primary" />
            Call Patient
          </a>
        )}
      </div>

      <div className="hidden md:flex gap-1.5 rounded-3xl border border-gray-200 bg-card p-2">
        {tabOptions.map((tab) => {
          const Icon = tab.icon
          const badge = getSectionBadge(tab.sections[0])
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => updateSection(tab.sections[0])}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {badge !== undefined && badge > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTabMeta.sections.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {activeTabMeta.sections.map((sectionId) => {
            const section = sectionOptions.find((item) => item.id === sectionId)
            if (!section) return null
            const badge = getSectionBadge(section.id)
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => updateSection(section.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  isActive ? 'bg-primary text-white shadow-sm' : 'border border-gray-200 bg-white text-text-secondary hover:border-primary/40 hover:text-primary'
                }`}
              >
                {section.label}
                {badge !== undefined && badge > 0 && (
                  <span className={`rounded-full px-1.5 py-px text-xs font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div key={activeSection} className="section-fade-in">
        {renderActiveSection()}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-1 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-xl gap-0.5">
          {tabOptions.map((tab) => (
            <BottomNavButton
              key={tab.id}
              active={activeTab === tab.id}
              icon={tab.icon}
              label={tab.shortLabel}
              onClick={() => updateSection(tab.sections[0])}
            />
          ))}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Full-screen image preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/75"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {selectedTooth && (
        <ToothModal
          toothNumber={selectedTooth}
          currentCondition={getToothCondition(selectedTooth)}
          currentNotes={dentalRecords.find(r => r.tooth_number === selectedTooth)?.notes || ''}
          onClose={() => setSelectedTooth(null)}
          onSave={saveToothCondition}
        />
      )}

      {showVisitForm && (
        <VisitFormModal
          formData={visitForm}
          setFormData={setVisitForm}
          onSubmit={handleVisitSubmit}
          onClose={() => setShowVisitForm(false)}
        />
      )}

      {showPrescriptionForm && (
        <PrescriptionFormModal
          formData={prescriptionForm}
          setFormData={setPrescriptionForm}
          onSubmit={handlePrescriptionSubmit}
          onClose={() => { setShowPrescriptionForm(false); setEditingPrescriptionId(null); setShowMedTemplates(false); setShowInvTemplates(false) }}
          isEditing={!!editingPrescriptionId}
          medicationTemplates={medicationTemplates}
          investigationTemplates={investigationTemplates}
          localMeds={localMeds}
          localInvs={localInvs}
          showMedTemplates={showMedTemplates}
          setShowMedTemplates={setShowMedTemplates}
          showInvTemplates={showInvTemplates}
          setShowInvTemplates={setShowInvTemplates}
          medicalHistoryForm={medicalHistoryForm}
          setMedicalHistoryForm={setMedicalHistoryForm}
          patientDOB={patient?.date_of_birth}
          aiPanelOpenIndex={aiPanelOpenIndex}
          setAiPanelOpenIndex={setAiPanelOpenIndex}
        />
      )}

      {printingPrescription && patient && (
        <PrescriptionPrint
          prescription={{
            id: printingPrescription.id,
            patient_id: printingPrescription.patient_id || patient.id,
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
            first_name: patient.first_name,
            last_name: patient.last_name,
            date_of_birth: patient.date_of_birth,
            gender: patient.gender,
            phone: patient.phone,
            patient_code: patient.patient_code,
            medical_history: patient.medical_history,
          }}
          doctor={doctorProfile || { full_name: '', degrees: '', designation: '', workplace: '' }}
          onClose={() => setPrintingPrescription(null)}
        />
      )}

      {showTreatmentPlanForm && (
        <TreatmentPlanModal
          formData={treatmentPlanForm}
          setFormData={setTreatmentPlanForm}
          onSubmit={handleTreatmentPlanSubmit}
          onClose={() => setShowTreatmentPlanForm(false)}
        />
      )}

      {showMedicalHistoryForm && (
        <MedicalHistoryModal
          formData={medicalHistoryForm}
          setFormData={setMedicalHistoryForm}
          onSubmit={handleMedicalHistorySubmit}
          onClose={() => setShowMedicalHistoryForm(false)}
        />
      )}

      {showAppointmentForm && (
        <AppointmentModal
          selectedDate={new Date()}
          defaultPatientId={id}
          onClose={() => setShowAppointmentForm(false)}
          onSave={() => {
            loadPatientData()
            setShowAppointmentForm(false)
          }}
        />
      )}

      {showInvoiceForm && id && (
        <InvoiceModal
          defaultPatientId={id}
          hidePatientSelect
          onClose={() => setShowInvoiceForm(false)}
          onSave={() => {
            loadPatientData()
            setShowInvoiceForm(false)
          }}
        />
      )}

      {payingInvoice && (
        <PaymentEntryModal
          invoiceId={payingInvoice.id}
          invoiceTotal={payingInvoice.total_amount || 0}
          invoicePaid={payingInvoice.paid_amount || 0}
          onClose={() => setPayingInvoice(null)}
          onSaved={() => {
            setPayingInvoice(null)
            loadPatientData()
          }}
        />
      )}
    </div>
  )
}

function QuickActionButton({ icon: Icon, label, onClick, disabled }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-text-primary whitespace-nowrap transition-all duration-200 hover:border-primary/40 hover:text-primary hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:text-text-primary disabled:hover:shadow-none"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </button>
  )
}

function InfoCard({ title, children, className = '' }: any) {
  return (
    <div className={`bg-card rounded-3xl shadow-sm border border-gray-200 p-4 sm:p-6 ${className}`}>
      <h3 className="font-semibold mb-4">{title}</h3>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value, className = '' }: any) {
  return (
    <div className="text-sm">
      <span className="text-text-secondary">{label}: </span>
      <span className={className}>{value}</span>
    </div>
  )
}

function MetricTile({ label, value }: any) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}

function EmptyState({ message }: any) {
  return <p className="rounded-2xl bg-gray-50 p-4 text-sm text-text-secondary">{message}</p>
}

function Tooth({ number, condition, color, onClick, small }: any) {
  const sizeClasses = small ? 'w-4 h-6 sm:w-6 sm:h-9' : 'w-[18px] h-[27px] sm:w-8 sm:h-12'
  return (
    <div className="flex flex-col items-center cursor-pointer group" onClick={onClick} title={condition}>
      <svg viewBox="0 0 32 48" className={`${sizeClasses} ${color} group-hover:opacity-75 transition-opacity`}>
        <path
          d="M16 2 C10 2, 6 6, 6 12 C6 18, 8 24, 10 32 C11 36, 12 42, 16 46 C20 42, 21 36, 22 32 C24 24, 26 18, 26 12 C26 6, 22 2, 16 2 Z"
          strokeWidth="2"
        />
      </svg>
      <span className="text-xs font-medium mt-0.5" style={{ fontSize: small ? '9px' : undefined }}>{number}</span>
    </div>
  )
}

function BottomNavButton({ active, icon: Icon, label, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-0.5 py-2.5 text-xs font-medium transition-all duration-200 ${
        active
          ? 'bg-primary text-white shadow-sm'
          : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="w-full truncate text-center">{label}</span>
    </button>
  )
}

function Legend({ color, label }: any) {
  return (
    <div className="flex items-center gap-2">
      <svg width="20" height="20" viewBox="0 0 20 20" className={color}>
        <circle cx="10" cy="10" r="8" strokeWidth="2" />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  )
}

function ToothModal({ toothNumber, currentCondition, currentNotes, onClose, onSave }: any) {
  const [condition, setCondition] = useState(currentCondition)
  const [notes, setNotes] = useState(currentNotes)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave(toothNumber, condition, notes)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">Tooth #{toothNumber}</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Condition</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option>Healthy</option>
              <option>Cavity</option>
              <option>Filled</option>
              <option>Root Canal</option>
              <option>Crown</option>
              <option>Missing</option>
              <option>Implant</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this tooth..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1">Save</Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function VisitFormModal({ formData, setFormData, onSubmit, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">Add Visit</h2>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Chief Complaint</label>
            <input
              type="text"
              value={formData.chief_complaint}
              onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Examination Findings</label>
            <textarea
              rows={3}
              value={formData.examination_findings}
              onChange={(e) => setFormData({ ...formData, examination_findings: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
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
            <label className="block text-sm font-medium mb-1">Treatment Plan</label>
            <textarea
              rows={3}
              value={formData.treatment_plan}
              onChange={(e) => setFormData({ ...formData, treatment_plan: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
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
            <Button type="submit" className="flex-1">Save Visit</Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PrescriptionFormModal({
  formData,
  setFormData,
  onSubmit,
  onClose,
  isEditing,
  medicationTemplates,
  investigationTemplates,
  localMeds,
  localInvs,
  showMedTemplates,
  setShowMedTemplates,
  showInvTemplates,
  setShowInvTemplates,
  medicalHistoryForm,
  setMedicalHistoryForm,
  patientDOB,
  aiPanelOpenIndex,
  setAiPanelOpenIndex,
}: any) {
  const [showComplaintTemplates, setShowComplaintTemplates] = useState(false)
  const [showExamTemplates, setShowExamTemplates] = useState(false)
  const [complaintTemplates, setComplaintTemplates] = useState<Array<SectionTemplate<string>>>([])
  const [examinationTemplates, setExaminationTemplates] = useState<Array<SectionTemplate<string>>>([])
  const [savedMedicationTemplates, setSavedMedicationTemplates] = useState<Array<SectionTemplate<MedicationTemplateItem[]>>>([])
  const [savedInvestigationTemplates, setSavedInvestigationTemplates] = useState<Array<SectionTemplate<InvestigationTemplateItem[]>>>([])

  useEffect(() => {
    async function loadSectionTemplates() {
      setComplaintTemplates(await getComplaintTemplates())
      setExaminationTemplates(await getExaminationTemplates())
      setSavedMedicationTemplates(await getMedicationSectionTemplates())
      setSavedInvestigationTemplates(await getInvestigationSectionTemplates())
    }

    void loadSectionTemplates()
  }, [])

  function addMedication() {
    setFormData({
      ...formData,
      medications: [...formData.medications, { name: '', dosage: '', frequency: '', duration: '', instructions: '', route: '' }],
    })
  }

  function removeMedication(index: number) {
    setFormData({ ...formData, medications: formData.medications.filter((_: any, i: number) => i !== index) })
  }

  function addInvestigation() {
    setFormData({
      ...formData,
      investigations: [...formData.investigations, { name: '', description: '', urgency: 'Routine' }],
    })
  }

  function removeInvestigation(index: number) {
    setFormData({ ...formData, investigations: formData.investigations.filter((_: any, i: number) => i !== index) })
  }

  function addMedicationFromTemplate(template: any) {
    const newMeds = [...formData.medications]
    const emptyIndex = newMeds.findIndex((m: any) => !m.name)
    const item = {
      name: template.name,
      dosage: template.dosage || '',
      frequency: template.frequency || '',
      duration: template.duration || '',
      instructions: template.instructions || '',
    }
    if (emptyIndex >= 0) {
      newMeds[emptyIndex] = item
    } else {
      newMeds.push(item)
    }
    setFormData({ ...formData, medications: newMeds })
    setShowMedTemplates(false)
  }

  function addInvestigationFromTemplate(template: any) {
    const newInvs = [...formData.investigations]
    const emptyIndex = newInvs.findIndex((i: any) => !i.name)
    const item = {
      name: template.name,
      description: template.description || '',
    }
    if (emptyIndex >= 0) {
      newInvs[emptyIndex] = item
    } else {
      newInvs.push(item)
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
    const emptyIndex = newMeds.findIndex((m: any) => !m.name.trim())
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
    const emptyIndex = newInvs.findIndex((i: any) => !i.name.trim())
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

  return (
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
                {isEditing ? 'Update Prescription' : 'New Prescription'}
              </h2>
              <p className="text-blue-200 text-xs">Dental Prescription Form</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* ── Weight for this visit ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg) for this visit</label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={formData.weight || ''}
              onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
              placeholder="Defaults from patient profile"
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            />
          </div>

          {/* ── Medical History ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Medical History</div>
            <MedicalHistoryFields
              checked={medicalHistoryForm.checked}
              other={medicalHistoryForm.other}
              onChange={setMedicalHistoryForm}
            />
          </div>

          {/* ── Chief Complaint ── */}
          <MultiEntryClinicalField
            label="Chief Complaint"
            entries={formData.chief_complaint_entries}
            onChange={(entries: ClinicalEntry[]) => setFormData({ ...formData, chief_complaint_entries: entries })}
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
            onChange={(entries: ClinicalEntry[]) => setFormData({ ...formData, on_examination_entries: entries })}
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
            onChange={(entries: ClinicalEntry[]) => setFormData({ ...formData, diagnosis_entries: entries })}
            placeholder="Enter diagnosis"
            helperText="e.g., Dental caries (K02.1), Periapical abscess (K04.7)"
          />

          {/* ── Treatment Plan ── */}
          <MultiEntryClinicalField
            label="Treatment Plan"
            entries={formData.treatment_plan_entries}
            onChange={(entries: ClinicalEntry[]) => setFormData({ ...formData, treatment_plan_entries: entries })}
            placeholder="e.g., RCT + Cap"
            helperText="Each entry is added to this patient's Operations tab as its own treatment record, individually selectable for invoicing."
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
                      {medicationTemplates.slice(0, 10).map((template: any) => (
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
              {formData.medications.map((med: any, index: number) => (
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
                          const defaultTier = getAgeTierFromDOB(patientDOB)
                          newMeds[index] = {
                            ...newMeds[index],
                            name: drug.name,
                            dosage: drug.ageDosing[defaultTier],
                            frequency: drug.frequency,
                            duration: drug.duration,
                            instructions: drug.instructions,
                            route: drug.route,
                            ageDosing: drug.ageDosing,
                            generic: drug.generic,
                            dosageForm: drug.dosageForm,
                            selectedAgeTier: defaultTier,
                            dosageSource: 'manual',
                          }
                          setFormData({ ...formData, medications: newMeds })
                          setAiPanelOpenIndex((current: number | null) => (current === index ? null : current))
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
                        value={med.route || ''}
                        onChange={(e) => {
                          const newMeds = [...formData.medications]
                          newMeds[index] = { ...newMeds[index], route: e.target.value }
                          setFormData({ ...formData, medications: newMeds })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  {med.ageDosing && (() => {
                    const ageDosing = med.ageDosing as { infant: string; child: string; adult: string }
                    const generic = med.generic as string | undefined
                    const dosageSource = med.dosageSource as string | undefined
                    const selectedTier = (med.selectedAgeTier ?? 'adult') as AgeTier
                    const aiTier = getAgeTierFromDOB(patientDOB)
                    const weightKg = formData.weight ? Number.parseFloat(formData.weight) : 0
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
                                    dosage: ageDosing[tier],
                                    dosageSource: 'manual',
                                  }
                                  setFormData({ ...formData, medications: newMeds })
                                  setAiPanelOpenIndex((current: number | null) => (current === index ? null : current))
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
                                onClick={() => setAiPanelOpenIndex((current: number | null) => (current === index ? null : index))}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                                  dosageSource === 'ai-estimate'
                                    ? 'bg-primary text-white'
                                    : 'text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                <Sparkles className="w-3 h-3" /> AI
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
                                  }
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
                  {localMeds.map((med: any, idx: number) => (
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
                      {investigationTemplates.slice(0, 12).map((template: any) => (
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
              {formData.investigations.map((inv: any, index: number) => (
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
                        value={inv.urgency || 'Routine'}
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
                  {localInvs.map((inv: any, idx: number) => (
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
            <label className="block text-sm font-semibold text-gray-700 mb-1">📝 Clinician's Notes & Follow-up Instructions</label>
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
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {isEditing ? 'Update Prescription' : 'Issue Prescription'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TreatmentPlanModal({ formData, setFormData, onSubmit, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full my-8">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold">New Treatment Plan</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Treatment Type *</label>
            <select
              required
              value={formData.treatment_type}
              onChange={(e) => setFormData({ ...formData, treatment_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select treatment type...</option>
              <option>Filling</option>
              <option>Root Canal</option>
              <option>Crown</option>
              <option>Bridge</option>
              <option>Extraction</option>
              <option>Implant</option>
              <option>Cleaning</option>
              <option>Whitening</option>
              <option>Braces</option>
              <option>Dentures</option>
              <option>Veneer</option>
              <option>Consultation</option>
              <option>Other</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tooth Number (FDI)</label>
              <input
                type="number"
                min="11"
                max="85"
                value={formData.tooth_number}
                onChange={(e) => setFormData({ ...formData, tooth_number: e.target.value })}
                placeholder="e.g. 11–48, 51–85"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the treatment..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Estimated Cost</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1">Save Treatment Plan</Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MedicalHistoryModal({ formData, setFormData, onSubmit, onClose }: any) {
  function toggleLabel(label: string) {
    setFormData((prev: { checked: string[]; other: string }) => ({
      ...prev,
      checked: prev.checked.includes(label)
        ? prev.checked.filter((l: string) => l !== label)
        : [...prev.checked, label],
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full my-8">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold">Medical History</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            {MEDICAL_HISTORY_LABELS.map((label) => (
              <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.checked.includes(label)}
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
              value={formData.other}
              onChange={(e) => setFormData({ ...formData, other: e.target.value })}
              placeholder="Any other condition not listed above..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1">Save Medical History</Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PatientInvoiceRow({
  invoice,
  onMarkPaid,
  onDelete,
  onPaymentRecorded,
}: {
  invoice: any
  onMarkPaid: () => void
  onDelete: () => void
  onPaymentRecorded: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const items: any[] = Array.isArray(invoice.items) ? invoice.items : []
  const discountAmt: number = invoice.discount_amount || 0
  const subtotal = getInvoiceItemSubtotal(items)
  const itemPreview = buildInvoiceItemPreview(items)
  const statusColors: Record<string, string> = {
    Paid: 'bg-green-100 text-green-800',
    Partial: 'bg-yellow-100 text-yellow-800',
    Pending: 'bg-red-100 text-red-800',
  }
  const due = getInvoiceDue(invoice)

  return (
    <div className="hover:bg-gray-50 transition-colors">
      <div
        className="p-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{formatDateValue(invoice.created_at)}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[invoice.status] || 'bg-gray-100 text-gray-800'}`}>
                {invoice.status}
              </span>
              {items.length > 0 && (
                <span className="text-xs text-text-secondary">{items.length} item{items.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              <span className="font-bold text-primary">{formatCurrency(invoice.total_amount || 0)}</span>
              {due > 0 && <span className="text-red-600">Due: {formatCurrency(due)}</span>}
            </div>
            {itemPreview && <p className="mt-1 text-sm text-text-secondary truncate">{itemPreview}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {invoice.status !== 'Paid' && (
              <Button size="sm" variant="outline" onClick={onMarkPaid}>Mark Paid</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowPaymentModal(true)} disabled={due <= 0}>Record Payment</Button>
            <Button size="sm" variant="outline" onClick={onDelete}>Delete</Button>
          </div>
        </div>
      </div>

      {expanded && items.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-200">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">Line Items</p>
            {items.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-sm">
                <div className="min-w-0 pr-3">
                  <span>{formatInvoiceItemLabel(item)}</span>
                  {getInvoiceItemLineTotal(item) > 0 && (
                    <p className="text-xs text-text-secondary">
                      {formatCurrency(getInvoiceItemLineTotal(item) / Math.max(Number(item.quantity) || 1, 1))} each
                    </p>
                  )}
                </div>
                <span className="font-medium">{formatCurrency(getInvoiceItemLineTotal(item))}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-200 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Discount</span>
                  <span className="text-green-600">-{formatCurrency(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-sm pt-1 border-t border-gray-200">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(invoice.total_amount || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Paid</span>
                <span className="text-green-600">{formatCurrency(invoice.paid_amount || 0)}</span>
              </div>
              {due > 0 && (
                <div className="flex justify-between font-semibold text-sm">
                  <span className="text-text-secondary">Due</span>
                  <span className="text-red-600">{formatCurrency(due)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 mt-3">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Payment History</p>
            <PaymentHistoryPanel invoiceId={invoice.id} />
          </div>
        </div>
      )}
      {showPaymentModal && (
        <PaymentEntryModal
          invoiceId={invoice.id}
          invoiceTotal={invoice.total_amount || 0}
          invoicePaid={invoice.paid_amount || 0}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => {
            setShowPaymentModal(false)
            onPaymentRecorded()
          }}
        />
      )}
    </div>
  )
}
