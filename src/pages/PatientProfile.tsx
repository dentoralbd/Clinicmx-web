import { Fragment, useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Calendar as CalendarIcon, FileText, Activity, DollarSign, Pill, Trash2, Lightbulb, Pencil, Upload, Image, X, User, FolderOpen, MessageSquare, FlaskConical, CheckCircle, Stethoscope, Printer, Sparkles, Phone, CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PatientHeader } from '@/components/PatientHeader'
import { ActivityTimeline, type TimelineItem } from '@/components/ActivityTimeline'
import { AppointmentModal } from '@/components/AppointmentModal'
import { InvoiceModal } from '@/components/InvoiceModal'
import { InvoicePrint } from '@/components/InvoicePrint'
import { PaymentEntryModal } from '@/components/PaymentEntryModal'
import { PayInvoicePickerModal } from '@/components/PayInvoicePickerModal'
import { PaymentHistoryPanel } from '@/components/PaymentHistoryPanel'
import { InvoiceTimelinePanel } from '@/components/InvoiceTimelinePanel'
import { TreatmentEstimatePrint } from '@/components/TreatmentEstimatePrint'
import { PrescriptionPrint } from '@/components/PrescriptionPrint'
import { buildInvoiceItemPreview, buildLegacySafeInvoicePayload, buildMergedInvoicePayload, buildTreatmentInvoiceItems, buildTreatmentLabel, extractTreatmentIdsFromInvoiceItems, formatInvoiceItemLabel, getFriendlySupabaseErrorMessage, getInvoiceItemLineTotal, getInvoiceItemSubtotal, getTreatmentPlanDiscountTotal, isSchemaCompatibilityError, logBillingError } from '@/lib/billing'
import { syncInvoiceForTreatmentChange } from '@/lib/invoiceSync'
import { ToothSelector } from '@/components/ToothSelector'
import { ArchDentalChart } from '@/components/ArchDentalChart'
import { supabase } from '@/lib/supabase'
import { MEMORY_KEYS, rememberItem } from '@/lib/prescriptionMemory'
import { loadDoctorProfile as loadSavedDoctorProfile } from '@/lib/doctorProfile'
import { MEDICAL_HISTORY_LABELS, getMedicalHistoryChecks, buildMedicalHistoryString } from '@/lib/medicalHistory'
import { MedicalHistoryFields } from '@/components/MedicalHistoryFields'
import { mapEntryToOperation } from '@/lib/treatmentPlan'
import { type ClinicalEntry, collectSuggestedTeeth, createEmptyEntry, entriesToText, textToEntries } from '@/lib/clinicalEntries'
import { MultiEntryClinicalField } from '@/components/MultiEntryClinicalField'
import { TreatmentPlanCostDialog } from '@/components/TreatmentPlanCostDialog'
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
import { getAgeTierFromDOB, AGE_TIER_LABELS, type AgeTier, getDentitionTypeFromDOB } from '@/lib/ageTier'
import { WEIGHT_DOSING_FORMULAS } from '@/lib/weightDosingFormulas'
import { translateDrugDefaults, translateDosage, retranslateMedication, dosageToBengali, frequencyToBengali, durationToBengali, instructionsToBengali, type PrescriptionLanguage } from '@/lib/medicationBengali'
import { PrescriptionLanguageToggle } from '@/components/PrescriptionLanguageToggle'
import { canDelete } from '@/lib/appSession'
import { logDeletion } from '@/lib/deleteHistory'
import { logEdit } from '@/lib/editHistory'
import { logActivity } from '@/lib/activityLog'
import { calculateWeightDose, formatWeightDoseSuggestion } from '@/lib/weightDosing'
import { isLiquidDosageForm, isSpoonableDosageForm, parseLiquidConcentration, calculateVolumeDose, formatVolumeDoseSuggestion } from '@/lib/liquidVolumeDosing'

interface VisitTreatmentEntry {
  key: string
  description: string
  teeth: number[]
  cost: string
  status: 'In Progress' | 'Completed'
}

// Selection state for marking existing Planned/In Progress treatments as done in a visit.
interface VisitPlannedSelection {
  selected: boolean
  status: 'In Progress' | 'Completed'
  cost: string
}

function createEmptyVisitTreatment(): VisitTreatmentEntry {
  return {
    key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    teeth: [],
    cost: '',
    status: 'In Progress',
  }
}

// Seed cost for a plan item ticked in the Add Visit modal. Prescription-derived
// plan rows default to cost 0; if a sibling planned/in-progress row for the same
// treatment type and tooth carries a price (entered on the Treatment Plan form),
// borrow that price. Items that already have a cost keep it unchanged.
function resolvePlannedCostSeed(target: any, plannedTreatments: any[]): string {
  if ((Number(target.cost) || 0) > 0) return String(target.cost)
  const match = plannedTreatments.find(
    (t) =>
      t.id !== target.id &&
      (Number(t.cost) || 0) > 0 &&
      (t.treatment_type || '').trim().toLowerCase() ===
        (target.treatment_type || '').trim().toLowerCase() &&
      (t.tooth_number ?? null) === (target.tooth_number ?? null)
  )
  return match ? String(match.cost) : String(target.cost ?? '')
}

// Cost shown (read-only) for a plan item in the Add Visit modal. If the treatment
// is the sole item on its invoice, a discount applied later at invoice creation
// is reflected by showing that invoice's post-discount total instead of the plan's
// raw cost. Treatments sharing an invoice with others keep their plain plan cost,
// since a shared invoice-level discount can't be attributed to one line item.
function resolvePlannedDisplayCost(target: any, allTreatments: any[], invoices: any[]): number {
  if (target.invoice_id) {
    const siblingCount = (allTreatments || []).filter((t) => t.invoice_id === target.invoice_id).length
    if (siblingCount === 1) {
      const invoice = (invoices || []).find((inv) => inv.id === target.invoice_id)
      if (invoice) return Number(invoice.total_amount) || 0
    }
  }
  return Number(target.cost) || 0
}

// Shared by the Treatment Plan form's live preview and its submit handler, so the
// discount that's shown always matches what actually gets written to treatments.cost.
function computeTreatmentPlanDiscount(
  items: Array<{ cost: string; teeth: number[] }>,
  discountType: 'fixed' | 'percentage',
  discountValue: string
) {
  const subtotal = items.reduce(
    (sum, item) => sum + (parseFloat(item.cost) || 0) * Math.max(item.teeth.length, 1),
    0
  )
  const rawDiscount =
    discountType === 'percentage'
      ? subtotal * ((parseFloat(discountValue) || 0) / 100)
      : parseFloat(discountValue) || 0
  const discountAmount = Math.min(Math.max(rawDiscount, 0), subtotal)
  return { subtotal, discountAmount, finalTotal: subtotal - discountAmount }
}

// Prefixes are load-bearing: splitVisitNotes() parses them back out of the
// visit's notes column so the Visits tab can render labeled rows.
const TREATMENT_LINE_PREFIX = 'Treatment done:'
const PAYMENT_LINE_PREFIX = 'Payment:'

// Visits have no DB link to treatments/invoices, so the per-visit summary
// (tooth numbers worked on, billed/paid amounts) is captured as plain text
// inside the visit's notes at save time.
function buildVisitSummaryLines(args: {
  doneFromPlan: Array<{ treatment: any; selection: VisitPlannedSelection }>
  doneEntries: VisitTreatmentEntry[]
  newBilledTotal: number
  paymentAmount: number
  paymentMethod: string
  towardPreviousDue: number
}): string[] {
  const lines: string[] = []

  const parts = [
    ...args.doneFromPlan.map(
      ({ treatment, selection }) => `${buildTreatmentLabel(treatment)} — ${selection.status}`
    ),
    ...args.doneEntries.map((entry) => {
      const teeth = entry.teeth.length > 0 ? ` (${entry.teeth.map((t) => `T${t}`).join(', ')})` : ''
      return `${entry.description.trim()}${teeth} — ${entry.status}`
    }),
  ]
  if (parts.length > 0) lines.push(`${TREATMENT_LINE_PREFIX} ${parts.join('; ')}`)

  if (args.newBilledTotal > 0 || args.paymentAmount > 0) {
    const paymentParts: string[] = []
    if (args.newBilledTotal > 0) paymentParts.push(`Billed ${formatCurrency(args.newBilledTotal)}`)
    if (args.paymentAmount > 0) {
      paymentParts.push(`Paid ${formatCurrency(args.paymentAmount)} (${args.paymentMethod})`)
      if (args.towardPreviousDue > 0) {
        paymentParts.push(`${formatCurrency(args.towardPreviousDue)} toward previous due`)
      }
    } else {
      paymentParts.push('No payment received')
    }
    lines.push(`${PAYMENT_LINE_PREFIX} ${paymentParts.join(' · ')}`)
  }

  return lines
}

function splitVisitNotes(notes: string | null | undefined): {
  treatmentDone: string | null
  payment: string | null
  rest: string
} {
  let treatmentDone: string | null = null
  let payment: string | null = null
  const rest: string[] = []
  for (const line of (notes || '').split('\n')) {
    if (treatmentDone === null && line.startsWith(TREATMENT_LINE_PREFIX)) {
      treatmentDone = line.slice(TREATMENT_LINE_PREFIX.length).trim()
    } else if (payment === null && line.startsWith(PAYMENT_LINE_PREFIX)) {
      payment = line.slice(PAYMENT_LINE_PREFIX.length).trim()
    } else {
      rest.push(line)
    }
  }
  return { treatmentDone, payment, rest: rest.join('\n').trim() }
}

// Splits the "Treatment done: A — Completed; B — In Progress" line back into
// individual chips for colored display in the Visits tab.
function parseTreatmentDoneChips(text: string): Array<{ label: string; status: string }> {
  return text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*)\s—\s(Completed|In Progress|Cancelled|Planned)$/)
      return match ? { label: match[1].trim(), status: match[2] } : { label: part, status: '' }
    })
}

// Splits the "Billed X · Paid Y (Method) · Z toward previous due" line into chips.
function parsePaymentChips(text: string): string[] {
  return text.split('·').map((part) => part.trim()).filter(Boolean)
}

function treatmentDoneChipClass(status: string): string {
  if (status === 'Completed') return 'bg-green-50 text-green-800 border-green-200'
  if (status === 'In Progress') return 'bg-blue-50 text-blue-800 border-blue-200'
  if (status === 'Cancelled') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

function paymentChipClass(chip: string): string {
  if (chip.startsWith('Billed')) return 'bg-blue-50 text-blue-800 border-blue-200'
  if (chip.startsWith('Paid')) return 'bg-green-50 text-green-800 border-green-200'
  if (chip.startsWith('Due')) return 'bg-red-50 text-red-700 border-red-200'
  if (chip.endsWith('toward previous due')) return 'bg-amber-50 text-amber-800 border-amber-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

// For visits linked to an invoice (invoice_id), "Billed" is recomputed live from
// the invoice so a discount applied after the visit (which updates
// invoices.total_amount) is reflected here too. "Due" is the running balance
// right after this visit's payment — invoice total minus every payment on that
// invoice up to and including this visit's timestamp — not the invoice's current
// (final) due, so each visit in a multi-visit installment plan shows its own
// balance rather than all showing the same end-state number. "Paid" stays as the
// frozen text since it's a historical fact about what was paid at that visit.
function buildVisitPaymentChips(visit: any, paymentText: string | null, invoices: any[], payments: any[]): string[] {
  const chips = (paymentText ? parsePaymentChips(paymentText) : []).filter(
    (chip) => !chip.endsWith('toward previous due')
  )
  if (!visit.invoice_id) return chips
  const invoice = invoices.find((inv) => inv.id === visit.invoice_id)
  if (!invoice) return chips
  const billed = invoice.total_amount || 0
  const visitTime = new Date(visit.created_at).getTime() + 2000 // tolerate clock skew with same-transaction payment rows
  const paidThroughVisit = payments
    .filter((p) => p.invoice_id === visit.invoice_id && new Date(p.payment_date).getTime() <= visitTime)
    .reduce((sum, p) => sum + (p.amount || 0), 0)
  const due = Math.max(billed - paidThroughVisit, 0)
  const hadBilledChip = chips.some((chip) => chip.startsWith('Billed'))
  const result = hadBilledChip
    ? chips.map((chip) => (chip.startsWith('Billed') ? `Billed ${formatCurrency(billed)}` : chip))
    : [`Billed ${formatCurrency(billed)}`, ...chips]
  if (due > 0) result.push(`Due ${formatCurrency(due)}`)
  return result
}

type SectionId =
  | 'profile'
  | 'medical'
  | 'clinical'
  | 'appointments'
  | 'prescriptions'
  | 'forms'
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
  { id: 'appointments', label: 'Appointments', shortLabel: 'Appts', icon: CalendarIcon, sections: ['appointments'] },
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
  const [payments, setPayments] = useState<any[]>([])
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAppointmentForm, setShowAppointmentForm] = useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoicePlanGroupId, setInvoicePlanGroupId] = useState<string | null>(null)
  const [editingInvoiceRecord, setEditingInvoiceRecord] = useState<any | null>(null)
  const [estimateJob, setEstimateJob] = useState<{ treatments: any[] } | null>(null)
  const [payingInvoice, setPayingInvoice] = useState<any | null>(null)
  const [showPayPicker, setShowPayPicker] = useState(false)
  const [mergeMode, setMergeMode] = useState(false)
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set())
  const [invoicePrintJob, setInvoicePrintJob] = useState<{ invoices: any[]; initialDueOnly?: boolean } | null>(null)
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

  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [editingTreatment, setEditingTreatment] = useState<any | null>(null)
  const [groupSimilarTreatments, setGroupSimilarTreatments] = useState(false)
  const [expandedPlanGroups, setExpandedPlanGroups] = useState<Set<string>>(new Set())
  const togglePlanGroup = (key: string) => {
    setExpandedPlanGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const [showTreatmentPlanForm, setShowTreatmentPlanForm] = useState(false)
  const [treatmentPlanForm, setTreatmentPlanForm] = useState({
    items: [
      { treatment_type: '', teeth: [] as number[], description: '', status: 'Planned', cost: '', notes: '' },
    ],
    discount_type: 'fixed' as 'fixed' | 'percentage',
    discount_value: '',
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
  const [visitTreatmentsDone, setVisitTreatmentsDone] = useState<VisitTreatmentEntry[]>([])
  const [visitPlannedSelections, setVisitPlannedSelections] = useState<Record<string, VisitPlannedSelection>>({})
  const [visitPayment, setVisitPayment] = useState({ amount: '', method: 'Cash' })
  const [editingVisit, setEditingVisit] = useState<any | null>(null)
  // Treatment plan cost confirmation: prescription submit is gated behind this
  // dialog whenever the prescription has plan entries; the doctor enters costs or defers.
  const [rxCostDialogEntries, setRxCostDialogEntries] = useState<ClinicalEntry[] | null>(null)
  const [rxCostDialogInitial, setRxCostDialogInitial] = useState<Record<string, string>>({})
  const [visitEditForm, setVisitEditForm] = useState({
    visit_date: '',
    chief_complaint: '',
    examination_findings: '',
    diagnosis: '',
    treatment_plan: '',
    notes: '',
  })
  // Treatment Done / Payment summary lines are generated once at Add Visit time
  // and shown read-only in Edit Visit — kept out of visitEditForm.notes so the
  // doctor can't accidentally edit or delete them.
  const [editingVisitFixedSummary, setEditingVisitFixedSummary] = useState<{ treatmentDone: string | null; payment: string | null }>({
    treatmentDone: null,
    payment: null,
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
    language: 'bn' as PrescriptionLanguage,
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

  // Deep-link support: Appointments' "Add visit now" prompt lands here with
  // ?openVisit=1 to auto-open the Add Visit modal instead of requiring a
  // second manual click on this page.
  useEffect(() => {
    if (searchParams.get('openVisit') === '1') {
      setShowVisitForm(true)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('openVisit')
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams])

  async function loadPatientData() {
    if (!id) return
    try {
      setLoading(true)
      
      const [
        { data: patientData },
        { data: visitsData },
        { data: dentalData },
        { data: treatmentsData },
        { data: prescriptionsData },
        { data: appointmentsData },
        { data: invoicesData },
        { data: filesData },
      ] = await Promise.all([
        supabase.from('patients').select('*').eq('id', id).single(),
        supabase
          .from('patient_visits')
          .select('*')
          .eq('patient_id', id)
          .order('visit_date', { ascending: false }),
        supabase.from('dental_records').select('*').eq('patient_id', id),
        supabase
          .from('treatments')
          .select('*')
          .eq('patient_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('prescriptions')
          .select('*')
          .eq('patient_id', id)
          .order('prescribed_date', { ascending: false }),
        supabase
          .from('appointments')
          .select('*')
          .eq('patient_id', id)
          .order('date_time', { ascending: false }),
        supabase
          .from('invoices')
          .select('*')
          .eq('patient_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('patient_files')
          .select('*')
          .eq('patient_id', id)
          .order('created_at', { ascending: false }),
      ])

      const invoiceIds = (invoicesData || []).map((inv: any) => inv.id)
      const { data: paymentsData } = invoiceIds.length
        ? await supabase.from('payments').select('*').in('invoice_id', invoiceIds)
        : { data: [] }

      setPatient(patientData)
      setVisits(visitsData || [])
      setDentalRecords(dentalData || [])
      setTreatments(treatmentsData || [])
      setPrescriptions(prescriptionsData || [])
      setAppointments(appointmentsData || [])
      setInvoices(invoicesData || [])
      setPayments(paymentsData || [])
      setFiles(filesData || [])
    } catch (error) {
      console.error('Error loading patient:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadTemplates() {
    const [{ data: medTemplates }, { data: invTemplates }] = await Promise.all([
      supabase.from('medication_templates').select('*').order('usage_count', { ascending: false }),
      supabase.from('investigation_templates').select('*').order('usage_count', { ascending: false }),
    ])

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
      // One treatments row per (item x tooth) so each is labelled and billed individually,
      // matching the prescription treatment-plan flow. Cost is per item.
      // Items created in the same submission share a planGroupId so they can be
      // displayed/selected together later (Treatment History grouping, invoice picker).
      const planGroupId = crypto.randomUUID()
      // Discount is entered once for the whole plan (see the form's Discount section)
      // and baked proportionally into each row's cost here, so every downstream reader
      // of treatments.cost (Add Visit, invoicing, the Treatments list) already sees the
      // discounted price with no separate discount field to keep in sync.
      const { subtotal, discountAmount } = computeTreatmentPlanDiscount(
        treatmentPlanForm.items,
        treatmentPlanForm.discount_type,
        treatmentPlanForm.discount_value
      )
      const costFactor = discountAmount > 0 && subtotal > 0 ? 1 - discountAmount / subtotal : 1
      const rows = treatmentPlanForm.items.flatMap((item) => {
        const teethList: Array<number | null> = item.teeth.length > 0 ? item.teeth : [null]
        const originalCost = parseFloat(item.cost) || 0
        const discountedCost = Math.round(originalCost * costFactor * 100) / 100
        return teethList.map((tooth) => ({
          patient_id: id,
          tooth_number: tooth,
          treatment_type: item.treatment_type,
          description: item.description || null,
          status: item.status,
          cost: discountedCost,
          original_cost: originalCost,
          notes: item.notes || null,
          treatment_plan_group_id: planGroupId,
        }))
      })
      const { error } = await supabase.from('treatments').insert(rows)
      if (error) throw error
      logActivity({
        action: 'create',
        entityType: 'treatment',
        entityLabel: treatmentPlanForm.items.map((item) => item.treatment_type).filter(Boolean).join(', '),
        patientId: id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        details: `${rows.length} planned item(s)`,
      })
      setShowTreatmentPlanForm(false)
      setTreatmentPlanForm({
        items: [{ treatment_type: '', teeth: [], description: '', status: 'Planned', cost: '', notes: '' }],
        discount_type: 'fixed',
        discount_value: '',
      })
      loadPatientData()

      const billable = rows.some((row) => (row.cost || 0) > 0 && row.status !== 'Cancelled')
      if (billable && confirm('Treatment plan saved. Create an invoice for these treatments now?')) {
        setInvoicePlanGroupId(planGroupId)
        setShowInvoiceForm(true)
      }
    } catch (error) {
      console.error('Error saving treatment plan:', error)
      alert('Failed to save treatment plan')
    }
  }

  function addTreatmentPlanItem() {
    setTreatmentPlanForm({
      ...treatmentPlanForm,
      items: [
        ...treatmentPlanForm.items,
        { treatment_type: '', teeth: [], description: '', status: 'Planned', cost: '', notes: '' },
      ],
    })
  }

  function removeTreatmentPlanItem(index: number) {
    setTreatmentPlanForm({
      ...treatmentPlanForm,
      items: treatmentPlanForm.items.filter((_, i) => i !== index),
    })
  }

  async function updateTreatmentStatus(treatmentId: string, newStatus: string) {
    try {
      const previous = treatments.find((t) => t.id === treatmentId)
      if (previous) {
        await logEdit({
          entityType: 'treatment',
          entityId: treatmentId,
          entityLabel: previous.treatment_type,
          patientId: previous.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
          previousPayload: previous,
        })
      }
      const { error } = await supabase.from('treatments').update({ status: newStatus }).eq('id', treatmentId)
      if (error) throw error
      setTreatments((prev) => prev.map((t) => (t.id === treatmentId ? { ...t, status: newStatus } : t)))

      const unbilled = previous && !previous.invoice_id
      if (newStatus === 'Completed' && previous?.status !== 'Completed' && unbilled && (previous.cost || 0) > 0) {
        if (confirm('Treatment completed but not billed yet. Create the invoice now?')) {
          setInvoicePlanGroupId(null)
          setShowInvoiceForm(true)
        }
      }
    } catch (error) {
      console.error('Error updating treatment status:', error)
      alert('Failed to update treatment status')
    }
  }

  /** Bulk status change for every treatment in a plan group at once. */
  async function updateGroupTreatmentsStatus(members: any[], newStatus: string) {
    try {
      const ids = members.map((m) => m.id)
      await Promise.all(members.map((m) => logEdit({
        entityType: 'treatment',
        entityId: m.id,
        entityLabel: m.treatment_type,
        patientId: m.patient_id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        previousPayload: m,
      })))
      const { error } = await supabase.from('treatments').update({ status: newStatus }).in('id', ids)
      if (error) throw error
      setTreatments((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, status: newStatus } : t)))

      if (newStatus === 'Completed') {
        const unbilledCostly = members.filter((m) => m.status !== 'Completed' && !m.invoice_id && (m.cost || 0) > 0)
        if (unbilledCostly.length > 0 && confirm(`${unbilledCostly.length} treatment(s) completed but not billed yet. Create the invoice now?`)) {
          setInvoicePlanGroupId(members[0]?.treatment_plan_group_id || null)
          setShowInvoiceForm(true)
        }
      }
    } catch (error) {
      console.error('Error updating treatment statuses:', error)
      alert('Failed to update treatment statuses')
    }
  }

  async function updateTreatmentFields(treatmentId: string, patch: {
    treatment_type: string
    tooth_number: number | null
    description: string | null
    cost: number
    status: string
    notes: string | null
  }) {
    try {
      const previous = treatments.find((t) => t.id === treatmentId)
      if (previous) {
        await logEdit({
          entityType: 'treatment',
          entityId: treatmentId,
          entityLabel: previous.treatment_type,
          patientId: previous.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
          previousPayload: previous,
        })
      }
      const { error } = await supabase.from('treatments').update(patch).eq('id', treatmentId)
      if (error) throw error
      setTreatments((prev) => prev.map((t) => (t.id === treatmentId ? { ...t, ...patch } : t)))
      const billingFieldsChanged = previous && (
        previous.treatment_type !== patch.treatment_type ||
        (previous.tooth_number ?? null) !== (patch.tooth_number ?? null) ||
        (previous.description ?? '') !== (patch.description ?? '') ||
        Number(previous.cost ?? 0) !== Number(patch.cost ?? 0)
      )
      if (billingFieldsChanged) {
        await handleInvoiceSyncForTreatment({ ...previous, ...patch, id: treatmentId }, 'edited')
      }
      setEditingTreatment(null)
    } catch (error) {
      console.error('Error updating treatment:', error)
      alert('Failed to update treatment')
    }
  }

  /** After a linked treatment is edited or deleted, rebuild the invoice's
   *  treatment-sourced items and totals. The treatment change is already
   *  committed — failures here must not roll it back. */
  async function handleInvoiceSyncForTreatment(treatment: any, change: 'edited' | 'deleted') {
    try {
      const result = await syncInvoiceForTreatmentChange(treatment, change, { knownInvoices: invoices })
      if (!result) return

      logActivity({
        action: 'edit',
        entityType: 'invoice',
        entityId: result.invoiceId,
        entityLabel: result.invoiceNumber,
        patientId: id ?? null,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        details: `Recalculated after treatment ${change}`,
      })

      setInvoices((prev: any[]) => prev.map((inv) => (inv.id === result.invoiceId ? { ...inv, ...result.appliedPayload } : inv)))
    } catch (error) {
      logBillingError('Failed to sync invoice after treatment change', error, {
        treatmentId: treatment.id,
      })
      alert(`The treatment was ${change === 'edited' ? 'saved' : 'deleted'}, but the linked invoice could not be updated: ${getFriendlySupabaseErrorMessage(error)}`)
    }
  }

  async function deleteTreatmentRow(treatment: any) {
    if (!canDelete()) return
    const linkedToInvoice = !!treatment.invoice_id
    if (!confirm(linkedToInvoice
      ? 'Delete this treatment? Its invoice will be updated to remove it.'
      : 'Delete this treatment?')) return
    try {
      await logDeletion({
        entityType: 'treatment',
        entityId: treatment.id,
        entityLabel: treatment.treatment_type,
        patientId: treatment.patient_id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        payload: treatment,
      })
      const { error } = await supabase.from('treatments').delete().eq('id', treatment.id)
      if (error) throw error
      setTreatments((prev) => prev.filter((t) => t.id !== treatment.id))
      await handleInvoiceSyncForTreatment(treatment, 'deleted')
    } catch (error) {
      console.error('Error deleting treatment:', error)
      alert('Failed to delete treatment')
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

    const doneEntries = visitTreatmentsDone.filter((entry) => entry.description.trim())
    const doneFromPlan = plannedTreatments
      .filter((treatment) => visitPlannedSelections[treatment.id]?.selected)
      .map((treatment) => ({ treatment, selection: visitPlannedSelections[treatment.id] }))
    // Already-invoiced planned treatments can still be marked done, but only
    // uninvoiced ones go on the new invoice generated by Payment Received.
    const billableFromPlan = doneFromPlan.filter(
      ({ treatment }) => !treatment.invoice_id
    )
    const paymentAmount = parseFloat(visitPayment.amount) || 0
    // Ad-hoc entries create one row per tooth, each at the entry's cost
    const treatmentsTotal =
      doneEntries.reduce((sum, entry) => sum + (parseFloat(entry.cost) || 0) * Math.max(entry.teeth.length, 1), 0) +
      billableFromPlan.reduce((sum, { treatment }) => sum + (Number(treatment.cost) || 0), 0)
    // Selected plan items that were invoiced on a previous visit: a payment
    // entered here goes toward their existing invoices' due balances.
    const billedFromPlan = doneFromPlan.filter(({ treatment }) => treatment.invoice_id)
    const seenInvoiceIds = new Set<string>()
    const existingInvoicesWithDue: any[] = []
    for (const { treatment } of billedFromPlan) {
      if (!treatment.invoice_id || seenInvoiceIds.has(treatment.invoice_id)) continue
      seenInvoiceIds.add(treatment.invoice_id)
      const invoice = invoices.find((inv) => inv.id === treatment.invoice_id)
      if (invoice && getInvoiceDue(invoice) > 0) existingInvoicesWithDue.push(invoice)
    }
    const existingDueTotal = existingInvoicesWithDue.reduce((sum, inv) => sum + getInvoiceDue(inv), 0)
    if (paymentAmount > 0 && doneEntries.length === 0 && billableFromPlan.length === 0 && existingInvoicesWithDue.length === 0) {
      alert('Add a Treatment Done entry, or tick a billed plan item that still has a due balance, before recording a payment')
      return
    }
    if (paymentAmount > treatmentsTotal + existingDueTotal) {
      alert('Payment amount cannot be greater than the new treatment cost plus outstanding due on billed items')
      return
    }

    // Capture what was done/billed/paid this visit as text inside notes, mirroring
    // the payment routing below (new invoice first, remainder to previous due).
    const hasNewBillable = doneEntries.length > 0 || billableFromPlan.length > 0
    const newInvoicePortion = hasNewBillable ? Math.min(paymentAmount, treatmentsTotal) : 0
    const towardPreviousDue = Math.min(paymentAmount - newInvoicePortion, existingDueTotal)
    const summaryLines = buildVisitSummaryLines({
      doneFromPlan,
      doneEntries,
      newBilledTotal: treatmentsTotal,
      paymentAmount,
      paymentMethod: visitPayment.method,
      towardPreviousDue,
    })
    const notesWithSummary = [visitForm.notes?.trim(), ...summaryLines]
      .filter(Boolean)
      .join('\n')

    try {
      const { data: insertedVisit, error: visitInsertError } = await supabase
        .from('patient_visits')
        .insert([{
          patient_id: id,
          ...visitForm,
          notes: notesWithSummary || null,
        }])
        .select('id')
        .single()
      if (visitInsertError) throw visitInsertError
      logActivity({
        action: 'create',
        entityType: 'patient_visit',
        entityLabel: visitForm.chief_complaint || 'Visit',
        patientId: id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
      })

      // Planned treatments ticked as done: update the existing rows (no duplicates)
      const billablePlanIds = new Set(billableFromPlan.map(({ treatment }) => treatment.id))
      const updatedPlanTreatments: any[] = []
      for (const { treatment, selection } of doneFromPlan) {
        await logEdit({
          entityType: 'treatment',
          entityId: treatment.id,
          entityLabel: treatment.treatment_type,
          patientId: treatment.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
          previousPayload: treatment,
        })
        // Cost is read-only in this modal (set at treatment-plan creation, or by the
        // linked invoice once billed), so only status is writable here.
        const { error: planUpdateError } = await supabase
          .from('treatments')
          .update({ status: selection.status })
          .eq('id', treatment.id)
        if (planUpdateError) throw planUpdateError
        if (billablePlanIds.has(treatment.id)) {
          updatedPlanTreatments.push({ ...treatment, status: selection.status })
        }
      }

      let insertedTreatments: any[] = []
      if (doneEntries.length > 0) {
        // One row per tooth (cost per tooth), matching the prescription flow
        const rows = doneEntries.flatMap((entry) => {
          const clinicalEntry = { id: entry.key, text: entry.description.trim(), teeth: entry.teeth }
          const teethList: Array<number | null> = entry.teeth.length > 0 ? entry.teeth : [null]
          return teethList.map((tooth) => ({
            patient_id: id,
            ...mapEntryToOperation(clinicalEntry, tooth),
            status: entry.status,
            cost: parseFloat(entry.cost) || 0,
            notes: null,
          }))
        })
        const { data, error } = await supabase
          .from('treatments')
          .insert(rows)
          .select('id, treatment_type, description, tooth_number, cost')
        if (error) throw error
        insertedTreatments = data || []
        logActivity({
          action: 'create',
          entityType: 'treatment',
          entityLabel: insertedTreatments.map((t) => t.treatment_type).filter(Boolean).join(', '),
          patientId: id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
          details: `${insertedTreatments.length} item(s) done at visit`,
        })
      }

      const billableTreatments = [...updatedPlanTreatments, ...insertedTreatments]
      if (paymentAmount > 0) {
        // New unbilled treatments get a new invoice first; any remainder pays
        // down existing invoices of selected already-billed plan items. Either
        // way, link the visit to whichever invoice its payment actually went
        // toward, so Visit History can show that invoice's live billed/due
        // amounts (prefer a newly-created invoice as the visit's "own" bill).
        let remaining = paymentAmount
        let linkedInvoiceId: string | null = null
        if (billableTreatments.length > 0 && remaining > 0) {
          const newInvoicePortion = Math.min(remaining, treatmentsTotal)
          const newInvoiceId = await createVisitInvoiceWithPayment(billableTreatments, newInvoicePortion)
          if (newInvoiceId) linkedInvoiceId = newInvoiceId
          remaining -= newInvoicePortion
        }
        for (const invoice of existingInvoicesWithDue) {
          if (remaining <= 0) break
          const applied = Math.min(remaining, getInvoiceDue(invoice))
          await applyPaymentToExistingInvoice(invoice, applied)
          if (!linkedInvoiceId) linkedInvoiceId = invoice.id
          remaining -= applied
        }
        if (linkedInvoiceId && insertedVisit?.id) {
          await supabase.from('patient_visits').update({ invoice_id: linkedInvoiceId }).eq('id', insertedVisit.id)
        }
      }

      setShowVisitForm(false)
      setVisitForm({
        chief_complaint: '',
        examination_findings: '',
        diagnosis: '',
        treatment_plan: '',
        notes: '',
      })
      setVisitTreatmentsDone([])
      setVisitPlannedSelections({})
      setVisitPayment({ amount: '', method: 'Cash' })
      loadPatientData()
    } catch (error) {
      console.error('Error saving visit:', error)
      alert(`Failed to save visit: ${getFriendlySupabaseErrorMessage(error)}`)
    }
  }

  async function createVisitInvoiceWithPayment(insertedTreatments: any[], paymentAmount: number): Promise<string | null> {
    if (!id) return null

    // Items show the pre-discount price so the printed invoice can break out a
    // Discount line, matching how a discount applied at treatment-plan creation
    // is expected to "sync" into invoicing (rather than silently disappearing
    // into a lower, unlabeled price).
    const items = buildTreatmentInvoiceItems(insertedTreatments, { useOriginalCost: true })
    const subtotal = getInvoiceItemSubtotal(items)
    const discountAmount = getTreatmentPlanDiscountTotal(insertedTreatments)
    const totalAmount = Math.max(subtotal - discountAmount, 0)
    const basePayload = buildLegacySafeInvoicePayload({
      patientId: id,
      items,
      totalAmount,
      paidAmount: 0,
      status: 'Pending',
      dueDate: null,
    })
    // discount_amount/type/value columns arrive in migration 008 — fall back to the
    // legacy-safe payload (still correctly totaled) on older schemas.
    const extendedPayload = discountAmount > 0
      ? { ...basePayload, discount_amount: discountAmount, discount_type: 'fixed', discount_value: discountAmount }
      : basePayload

    let insertResult = await supabase.from('invoices').insert([extendedPayload]).select('id').single()
    if (insertResult.error && isSchemaCompatibilityError(insertResult.error)) {
      insertResult = await supabase.from('invoices').insert([basePayload]).select('id').single()
    }
    const { data: invoice, error: invoiceError } = insertResult
    if (invoiceError) throw invoiceError
    if (!invoice?.id) return null

    logActivity({
      action: 'create',
      entityType: 'invoice',
      entityId: invoice.id,
      patientId: id,
      patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
      details: `Total ${formatBDT(totalAmount)} (visit form)`,
    })

    // invoice_history / is_invoiced columns arrive in later migrations — ignore if missing
    await supabase.from('invoice_history').insert({
      invoice_id: invoice.id,
      event_type: 'invoice_created',
      event_data: { source: 'visit_form' },
    }).then(() => {}, () => {})

    await supabase
      .from('treatments')
      .update({ is_invoiced: true, invoice_id: invoice.id })
      .in('id', insertedTreatments.map((treatment) => treatment.id))
      .then(() => {}, () => {})

    // Same fallback chain as InvoiceModal.recordImmediatePayment for older payments schemas
    const paymentDateIso = new Date().toISOString()
    let paymentStored = false
    let paymentSchemaError: unknown = null
    const paymentPayloads: Array<{
      invoice_id: string
      amount: number
      payment_method?: string
      payment_date?: string
      notes?: string | null
    }> = [
      { invoice_id: invoice.id, amount: paymentAmount, payment_method: visitPayment.method, payment_date: paymentDateIso, notes: null },
      { invoice_id: invoice.id, amount: paymentAmount, payment_date: paymentDateIso },
      { invoice_id: invoice.id, amount: paymentAmount },
    ]
    for (const payload of paymentPayloads) {
      const { error: paymentError } = await supabase.from('payments').insert(payload)
      if (!paymentError) {
        paymentStored = true
        paymentSchemaError = null
        break
      }
      if (!isSchemaCompatibilityError(paymentError)) throw paymentError
      paymentSchemaError = paymentError
    }

    if (paymentStored) {
      logActivity({
        action: 'create',
        entityType: 'payment',
        patientId: id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        details: `${formatBDT(paymentAmount)} (${visitPayment.method}) on new visit invoice`,
      })
    }

    const { error: statusError } = await supabase
      .from('invoices')
      .update({
        paid_amount: paymentAmount,
        status: paymentAmount >= totalAmount ? 'Paid' : 'Partial',
      })
      .eq('id', invoice.id)
    if (statusError) throw statusError

    await supabase.from('invoice_history').insert({
      invoice_id: invoice.id,
      event_type: 'payment_recorded',
      event_data: { amount: paymentAmount, payment_method: visitPayment.method },
    }).then(() => {}, () => {})

    if (!paymentStored && paymentSchemaError) {
      logBillingError('Payment recorded without payment ledger row', paymentSchemaError, { invoiceId: invoice.id, amount: paymentAmount })
    }

    return invoice.id as string
  }

  async function applyPaymentToExistingInvoice(invoice: any, amount: number) {
    // Same fallback chain as createVisitInvoiceWithPayment for older payments schemas
    const paymentDateIso = new Date().toISOString()
    let paymentStored = false
    let paymentSchemaError: unknown = null
    const paymentPayloads: Array<{
      invoice_id: string
      amount: number
      payment_method?: string
      payment_date?: string
      notes?: string | null
    }> = [
      { invoice_id: invoice.id, amount, payment_method: visitPayment.method, payment_date: paymentDateIso, notes: null },
      { invoice_id: invoice.id, amount, payment_date: paymentDateIso },
      { invoice_id: invoice.id, amount },
    ]
    for (const payload of paymentPayloads) {
      const { error: paymentError } = await supabase.from('payments').insert(payload)
      if (!paymentError) {
        paymentStored = true
        paymentSchemaError = null
        break
      }
      if (!isSchemaCompatibilityError(paymentError)) throw paymentError
      paymentSchemaError = paymentError
    }

    if (paymentStored) {
      logActivity({
        action: 'create',
        entityType: 'payment',
        patientId: id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        details: `${formatBDT(amount)} (${visitPayment.method}) against invoice ${invoice.invoice_number || invoice.id}`,
      })
    }

    const newPaid = (invoice.paid_amount || 0) + amount
    const { error: statusError } = await supabase
      .from('invoices')
      .update({
        paid_amount: newPaid,
        status: newPaid >= (invoice.total_amount || 0) ? 'Paid' : 'Partial',
      })
      .eq('id', invoice.id)
    if (statusError) throw statusError

    await supabase.from('invoice_history').insert({
      invoice_id: invoice.id,
      event_type: 'payment_recorded',
      event_data: { amount, payment_method: visitPayment.method, source: 'visit_form' },
    }).then(() => {}, () => {})

    if (!paymentStored && paymentSchemaError) {
      logBillingError('Payment recorded without payment ledger row', paymentSchemaError, { invoiceId: invoice.id, amount })
    }
  }

  function openVisitEdit(visit: any) {
    const parsedNotes = splitVisitNotes(visit.notes)
    setVisitEditForm({
      visit_date: visit.visit_date ? format(new Date(visit.visit_date), "yyyy-MM-dd'T'HH:mm") : '',
      chief_complaint: visit.chief_complaint || '',
      examination_findings: visit.examination_findings || '',
      diagnosis: visit.diagnosis || '',
      treatment_plan: visit.treatment_plan || '',
      notes: parsedNotes.rest,
    })
    setEditingVisitFixedSummary({ treatmentDone: parsedNotes.treatmentDone, payment: parsedNotes.payment })
    setEditingVisit(visit)
  }

  async function handleVisitEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingVisit) return
    try {
      await logEdit({
        entityType: 'patient_visit',
        entityId: editingVisit.id,
        entityLabel: editingVisit.chief_complaint || 'Visit',
        patientId: id ?? null,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        previousPayload: editingVisit,
      })
      // Re-attach the fixed Treatment Done / Payment lines unchanged — they are
      // display-only in this form and were never editable here.
      const fixedLines = [
        editingVisitFixedSummary.treatmentDone ? `${TREATMENT_LINE_PREFIX} ${editingVisitFixedSummary.treatmentDone}` : null,
        editingVisitFixedSummary.payment ? `${PAYMENT_LINE_PREFIX} ${editingVisitFixedSummary.payment}` : null,
      ].filter((line): line is string => !!line)
      const notes = [visitEditForm.notes?.trim(), ...fixedLines].filter(Boolean).join('\n')
      const { error } = await supabase.from('patient_visits').update({
        visit_date: visitEditForm.visit_date ? new Date(visitEditForm.visit_date).toISOString() : editingVisit.visit_date,
        chief_complaint: visitEditForm.chief_complaint || null,
        examination_findings: visitEditForm.examination_findings || null,
        diagnosis: visitEditForm.diagnosis || null,
        treatment_plan: visitEditForm.treatment_plan || null,
        notes: notes || null,
      }).eq('id', editingVisit.id)
      if (error) throw error
      setEditingVisit(null)
      loadPatientData()
    } catch (error) {
      console.error('Error updating visit:', error)
      alert('Failed to update visit')
    }
  }

  async function handleDeleteVisit(visit: any) {
    if (!canDelete()) return
    if (!confirm('Delete this visit record? Treatments and invoices from this visit are separate records and will NOT be deleted.')) return
    try {
      await logDeletion({
        entityType: 'patient_visit',
        entityId: visit.id,
        entityLabel: visit.chief_complaint || 'Visit',
        patientId: id ?? null,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        payload: visit,
      })
      await supabase.from('patient_visits').delete().eq('id', visit.id)
      loadPatientData()
    } catch (error) {
      console.error('Error deleting visit:', error)
      alert('Failed to delete visit')
    }
  }

  async function handlePrescriptionSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return

    const planEntries = prescriptionForm.treatment_plan_entries.filter((entry) => entry.text.trim())
    if (planEntries.length === 0) {
      await savePrescriptionWithCosts({})
      return
    }

    // Prefill the dialog with costs already stored on this prescription's plan rows
    const initialCosts: Record<string, string> = {}
    if (editingPrescriptionId) {
      const { data: existingRows } = await supabase
        .from('treatments')
        .select('prescription_entry_id, cost')
        .eq('prescription_id', editingPrescriptionId)
      for (const row of existingRows || []) {
        const key = row.prescription_entry_id
        if (key && !(key in initialCosts) && (Number(row.cost) || 0) > 0) {
          initialCosts[key] = String(row.cost)
        }
      }
    }
    setRxCostDialogInitial(initialCosts)
    setRxCostDialogEntries(planEntries)
  }

  async function savePrescriptionWithCosts(entryCosts: Record<string, string>) {
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
        language: prescriptionForm.language,
      }

      await supabase
        .from('patients')
        .update({ medical_history: buildMedicalHistoryString(medicalHistoryForm.checked, medicalHistoryForm.other) })
        .eq('id', id)

      let prescriptionId = editingPrescriptionId
      if (editingPrescriptionId) {
        const previousPrescription = prescriptions.find((p: any) => p.id === editingPrescriptionId)
        if (previousPrescription) {
          await logEdit({
            entityType: 'prescription',
            entityId: editingPrescriptionId,
            entityLabel: previousPrescription.diagnosis || 'Prescription',
            patientId: id ?? null,
            patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
            previousPayload: previousPrescription,
          })
        }
        await supabase.from('prescriptions').update(payload).eq('id', editingPrescriptionId)
      } else {
        const { data: inserted } = await supabase.from('prescriptions').insert([payload]).select().single()
        prescriptionId = inserted?.id || null
        logActivity({
          action: 'create',
          entityType: 'prescription',
          entityId: prescriptionId,
          entityLabel: payload.diagnosis || 'Prescription',
          patientId: id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
          details: `${(payload.medications || []).length} medication(s)`,
        })

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
            logActivity({
              action: 'create',
              entityType: 'patient_visit',
              entityLabel: flatChiefComplaint || 'Visit',
              patientId: id,
              patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
              details: 'Auto-saved from prescription',
            })
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
        let treatmentRowsCreated = 0

        for (const entry of currentEntries) {
          const rowsForEntry = rowsByEntryId.get(entry.id) || []
          const reusableRows = rowsForEntry.filter((row) => !row.is_invoiced)
          const teethList = entry.teeth.length > 0 ? entry.teeth : [null]

          // Cost from the confirmation dialog applies per tooth row; blank means
          // "add later" — never overwrite a cost already set elsewhere with 0.
          const enteredCost = entryCosts[entry.id]
          const costPatch = enteredCost?.trim() ? { cost: parseFloat(enteredCost) || 0 } : {}
          for (let i = 0; i < teethList.length; i++) {
            const operation = mapEntryToOperation(entry, teethList[i])
            const reuseRow = reusableRows[i]
            if (reuseRow) {
              await supabase.from('treatments').update({ ...operation, ...costPatch }).eq('id', reuseRow.id)
            } else {
              await supabase.from('treatments').insert([{
                patient_id: id,
                prescription_id: prescriptionId,
                prescription_entry_id: entry.id,
                status: 'Planned',
                notes: 'Added from prescription treatment plan',
                ...operation,
                ...costPatch,
              }])
              treatmentRowsCreated++
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
              patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
              payload: treatment,
            })
          }
          await supabase.from('treatments').delete().in('id', idsToDelete)
        }

        if (treatmentRowsCreated > 0) {
          logActivity({
            action: 'create',
            entityType: 'treatment',
            patientId: id,
            patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
            details: `${treatmentRowsCreated} item(s) from prescription treatment plan`,
          })
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
        language: 'bn',
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
      language: 'bn',
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
      language: (prescription.language as PrescriptionLanguage) || 'bn',
    })
    setAiPanelOpenIndex(null)
    seedMedicalHistoryForm()
    setShowPrescriptionForm(true)
  }

  async function handleDeletePrescription(prescriptionId: string) {
    if (!canDelete()) return
    if (!confirm('Are you sure you want to delete this prescription?')) return
    try {
      const prescription = prescriptions.find((p: any) => p.id === prescriptionId)
      await logDeletion({
        entityType: 'prescription',
        entityId: prescriptionId,
        entityLabel: prescription?.diagnosis || 'Prescription',
        patientId: id ?? null,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        payload: prescription || { id: prescriptionId },
      })
      await supabase.from('prescriptions').delete().eq('id', prescriptionId)
      loadPatientData()
    } catch (error) {
      console.error('Error deleting prescription:', error)
      alert('Failed to delete prescription')
    }
  }

  function openPaymentFlow() {
    if (pendingInvoices.length === 1) {
      setPayingInvoice(pendingInvoices[0])
    } else if (pendingInvoices.length > 1) {
      setShowPayPicker(true)
    }
  }

  async function handleMergeSelectedInvoices() {
    const toMerge = pendingInvoices.filter((invoice: any) => selectedForMerge.has(invoice.id))
    if (toMerge.length < 2 || !id) return

    try {
      const payload = buildMergedInvoicePayload(id, toMerge)
      const { data, error } = await supabase.from('invoices').insert([payload]).select('id').single()
      if (error) throw error

      const oldIds = toMerge.map((invoice: any) => invoice.id)
      const newId = data.id as string

      logActivity({
        action: 'create',
        entityType: 'invoice',
        entityId: newId,
        patientId: id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        details: `Merged from ${oldIds.length} invoices`,
      })

      const { error: treatmentsError } = await supabase
        .from('treatments')
        .update({ invoice_id: newId })
        .in('invoice_id', oldIds)
      if (treatmentsError) throw treatmentsError

      const { error: paymentsError } = await supabase
        .from('payments')
        .update({ invoice_id: newId })
        .in('invoice_id', oldIds)
      if (paymentsError) throw paymentsError

      // Keep any visit's live-amount link pointing at the surviving invoice
      const { error: visitsError } = await supabase
        .from('patient_visits')
        .update({ invoice_id: newId })
        .in('invoice_id', oldIds)
      if (visitsError) throw visitsError

      const { error: mergeError } = await supabase
        .from('invoices')
        .update({ status: 'Merged', merged_into_invoice_id: newId })
        .in('id', oldIds)
      if (mergeError) throw mergeError

      await supabase.from('invoice_history').insert({
        invoice_id: newId,
        event_type: 'merged_from',
        event_data: { source_invoice_ids: oldIds },
      }).then(() => {}, () => {})

      await supabase.from('invoice_history').insert(
        oldIds.map((invoiceId: string) => ({
          invoice_id: invoiceId,
          event_type: 'merged_into',
          event_data: { merged_into_invoice_id: newId },
        }))
      ).then(() => {}, () => {})

      setMergeMode(false)
      setSelectedForMerge(new Set())
      loadPatientData()
    } catch (error) {
      logBillingError('Failed to merge invoices', error, { invoiceIds: Array.from(selectedForMerge) })
      alert(`Failed to merge invoices: ${getFriendlySupabaseErrorMessage(error)}`)
    }
  }

  async function handleDeleteInvoice(invoiceId: string) {
    if (!canDelete()) return
    if (!confirm('Delete this invoice?')) return

    try {
      const invoice = invoices.find((inv: any) => inv.id === invoiceId)
      await logDeletion({
        entityType: 'invoice',
        entityId: invoiceId,
        entityLabel: invoice?.invoice_number || 'Invoice',
        patientId: id ?? null,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        payload: invoice || { id: invoiceId },
      })
      // Free the invoiced treatments so they can be billed again. Must run before the
      // delete: the FK ON DELETE SET NULL wipes treatments.invoice_id once the invoice
      // row is gone. Two paths because linkage is dual (invoice_id column + items JSON);
      // errors swallowed since is_invoiced/invoice_id may not exist on legacy schemas.
      await supabase
        .from('treatments')
        .update({ is_invoiced: false, invoice_id: null })
        .eq('invoice_id', invoiceId)
        .then(() => {}, () => {})
      const releasedIds = extractTreatmentIdsFromInvoiceItems(
        Array.isArray(invoice?.items) ? invoice.items : []
      )
      if (releasedIds.size > 0) {
        await supabase
          .from('treatments')
          .update({ is_invoiced: false, invoice_id: null })
          .in('id', Array.from(releasedIds))
          .then(() => {}, () => {})
      }
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

      logActivity({
        action: 'create',
        entityType: 'patient_file',
        entityLabel: file.name,
        patientId: id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        details: fileCategory,
      })

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
    if (!canDelete()) return
    if (!confirm(`Delete "${file.file_name}"?`)) return

    try {
      await logDeletion({
        entityType: 'patient_file',
        entityId: file.id,
        entityLabel: file.file_name,
        patientId: id ?? null,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        payload: file,
      })
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
    if (age === null || age > 14) return 'permanent'
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
  const activeInvoices = invoices.filter((invoice) => invoice.status !== 'Merged')
  const totalBilled = activeInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
  const totalPaid = activeInvoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0)
  const totalDue = totalBilled - totalPaid
  const pendingInvoices = activeInvoices.filter((invoice) => getInvoiceDue(invoice) > 0)
  const patientDentition = getDentitionTypeFromDOB(patient?.date_of_birth)
  const plannedTreatments = treatments.filter(
    (treatment) => treatment.status === 'Planned' || treatment.status === 'In Progress'
  )
  // Retired 'Merged' source invoices keep their items JSON but must not pin treatments
  const linkedTreatmentIds = extractTreatmentIdsFromInvoiceItems(
    invoices
      .filter((invoice) => invoice.status !== 'Merged')
      .flatMap((invoice) => (Array.isArray(invoice.items) ? invoice.items : []))
  )
  // Trust invoice_id (FK ON DELETE SET NULL keeps it accurate) and actual items-JSON
  // linkage over the is_invoiced flag, which can go stale (e.g. an invoice deleted by
  // an older app version) and would otherwise strand a treatment as permanently "billed."
  const pendingBillableTreatments = treatments.filter(
    (treatment) =>
      treatment.status !== 'Cancelled' &&
      !treatment.invoice_id &&
      !linkedTreatmentIds.has(treatment.id)
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
          <div className="mt-2 text-3xl font-bold">{formatCurrency(Math.abs(totalDue))}</div>
          <p className="mt-1 text-sm text-white/80">{totalDue < 0 ? 'Advance paid' : 'Current balance due'}</p>
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
    const patientAge = getPatientAge(patient.date_of_birth)
    const dentitionType = getDentitionType(patientAge)

    const dentitionLabel: Record<typeof dentitionType, string> = {
      deciduous: 'Deciduous dentition (primary teeth)',
      mixed: 'Mixed dentition',
      permanent: 'Permanent dentition',
    }

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

          <ArchDentalChart
            dentitionType={dentitionType}
            getToothClass={(num) => getToothColor(getToothCondition(num))}
            getToothTitle={(num) => getToothCondition(num)}
            onToothClick={(num) => setSelectedTooth(num)}
          />

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
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-blue-50 border border-blue-200 p-4">
          <div className="text-sm text-blue-600 font-medium">Total Bill</div>
          <div className="mt-1 text-xl font-bold text-blue-900">{formatCurrency(totalBilled)}</div>
        </div>
        <div className="rounded-3xl bg-green-50 border border-green-200 p-4">
          <div className="text-sm text-green-600 font-medium">Total Paid</div>
          <div className="mt-1 text-xl font-bold text-green-900">{formatCurrency(totalPaid)}</div>
        </div>
        {totalDue < 0 ? (
          <div className="rounded-3xl bg-green-50 border border-green-200 p-4">
            <div className="text-sm text-green-600 font-medium">Advance</div>
            <div className="mt-1 text-xl font-bold text-green-900">{formatCurrency(-totalDue)}</div>
          </div>
        ) : (
          <div className="rounded-3xl bg-red-50 border border-red-200 p-4">
            <div className="text-sm text-red-600 font-medium">Total Due</div>
            <div className="mt-1 text-xl font-bold text-red-900">{formatCurrency(totalDue)}</div>
          </div>
        )}
      </div>

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
          <div className="p-4 space-y-4">
            {visits.map((visit) => {
              const parsedNotes = splitVisitNotes(visit.notes)
              return (
                <div key={visit.id} className="rounded-2xl border border-gray-200 shadow-sm bg-white p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-text-secondary flex-shrink-0" />
                      <span className="font-bold text-gray-800">{formatDateValue(visit.visit_date, 'MMMM d, yyyy h:mm a')}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openVisitEdit(visit)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {canDelete() && (
                        <button
                          type="button"
                          onClick={() => handleDeleteVisit(visit)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {(visit.chief_complaint || visit.examination_findings) && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {visit.chief_complaint && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
                          CC: {visit.chief_complaint}
                        </span>
                      )}
                      {visit.examination_findings && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 text-xs font-medium border border-purple-200">
                          O/E: {visit.examination_findings}
                        </span>
                      )}
                    </div>
                  )}

                  {visit.diagnosis && (
                    <div className="mb-3">
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-sm font-medium">
                        {visit.diagnosis}
                      </span>
                    </div>
                  )}

                  {visit.treatment_plan && (
                    <div className="mb-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 text-xs font-medium border border-indigo-200">
                        Plan: {visit.treatment_plan}
                      </span>
                    </div>
                  )}

                  {parsedNotes.treatmentDone && (
                    <div className="mb-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" /> Treatment Done
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {parseTreatmentDoneChips(parsedNotes.treatmentDone).map((chip, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${treatmentDoneChipClass(chip.status)}`}
                          >
                            {chip.label}{chip.status ? ` · ${chip.status}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {parsedNotes.payment && (
                    <div className="mb-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5" /> Payment
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {buildVisitPaymentChips(visit, parsedNotes.payment, invoices, payments).map((chip, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${paymentChipClass(chip)}`}
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {parsedNotes.rest && (
                    <blockquote className="mt-3 border-l-4 border-primary/30 pl-3 text-sm text-gray-600 italic whitespace-pre-line">
                      {parsedNotes.rest}
                    </blockquote>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  const renderOperationsSection = () => {
    // Rows created together share an origin id: treatment_plan_group_id for the
    // direct Treatment Plan form, prescription_entry_id for prescription-derived
    // rows (one tagged entry split into one row per tooth). Either counts as "same plan".
    const getTreatmentOriginId = (t: any): string | null => t.treatment_plan_group_id || t.prescription_entry_id || null

    const planGroupCounts = new Map<string, number>()
    const planGroupTeeth = new Map<string, number[]>()
    treatments.forEach((t) => {
      const originId = getTreatmentOriginId(t)
      if (originId) {
        planGroupCounts.set(originId, (planGroupCounts.get(originId) || 0) + 1)
        if (t.tooth_number != null) {
          const teeth = planGroupTeeth.get(originId) || []
          if (!teeth.includes(t.tooth_number)) teeth.push(t.tooth_number)
          planGroupTeeth.set(originId, teeth)
        }
      }
    })
    planGroupTeeth.forEach((teeth) => teeth.sort((a, b) => a - b))

    const statusBadgeClass = (status: string) =>
      status === 'Completed' ? 'bg-green-100 text-green-800' :
      status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
      status === 'Cancelled' ? 'bg-red-100 text-red-800' :
      'bg-gray-100 text-gray-800'

    const isTreatmentLinked = (treatment: any) =>
      !!treatment.invoice_id || linkedTreatmentIds.has(treatment.id)

    // Possible-duplicate detection: Planned/In Progress rows that share the same
    // treatment type and tooth are very likely the same real-world item entered
    // twice (e.g. once via a prescription, once via the direct Treatment Plan
    // form). Flagged for manual review only — nothing here is deleted automatically.
    const duplicateClusterMap = new Map<string, any[]>()
    plannedTreatments.forEach((t) => {
      const key = `${(t.treatment_type || '').trim().toLowerCase()}::${t.tooth_number ?? 'none'}`
      duplicateClusterMap.set(key, [...(duplicateClusterMap.get(key) || []), t])
    })
    const duplicateClusters = [...duplicateClusterMap.values()].filter((members) => members.length > 1)

    const estimatableTreatments = pendingBillableTreatments.filter(
      (t) => t.status === 'Planned' || t.status === 'In Progress'
    )

    // Opt-in grouping: only merges plan rows identical apart from tooth number
    // (same type, description, cost) — variants like GI vs LC filling stay separate.
    const planRowKey = (t: any) => {
      const originId = getTreatmentOriginId(t)
      return originId ? `${originId}::${t.treatment_type}::${(t.description || '').trim()}::${t.cost || 0}` : null
    }
    const groupBuckets = new Map<string, any[]>()
    if (groupSimilarTreatments) {
      treatments.forEach((t) => {
        const key = planRowKey(t)
        if (!key) return
        groupBuckets.set(key, [...(groupBuckets.get(key) || []), t])
      })
    }
    const displayRows: Array<{ kind: 'single'; treatment: any } | { kind: 'group'; key: string; members: any[] }> = []
    const emittedGroups = new Set<string>()
    treatments.forEach((t) => {
      const key = groupSimilarTreatments ? planRowKey(t) : null
      const members = key ? groupBuckets.get(key) || [] : []
      if (!key || members.length < 2) {
        displayRows.push({ kind: 'single', treatment: t })
      } else if (!emittedGroups.has(key)) {
        emittedGroups.add(key)
        displayRows.push({ kind: 'group', key, members })
      }
    })

    const renderTreatmentRow = (treatment: any, child = false) => {
      const isLinked = isTreatmentLinked(treatment)
      return (
        <tr key={treatment.id} className={child ? 'bg-blue-50/50 border-l-2 border-blue-200' : undefined}>
          <td className={`px-4 py-3 text-sm ${child ? 'pl-8 text-text-secondary' : ''}`}>{formatDateValue(treatment.created_at)}</td>
          <td className="px-4 py-3">
            <div className={`flex items-center gap-2 ${child ? 'font-normal text-text-secondary' : 'font-medium'}`}>
              {child && <span className="text-blue-300">&#8627;</span>}
              {treatment.treatment_type}
              {!child && getTreatmentOriginId(treatment) && (planGroupCounts.get(getTreatmentOriginId(treatment)!) || 0) > 1 && (
                <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                  Plan &middot; {planGroupCounts.get(getTreatmentOriginId(treatment)!)} items
                </span>
              )}
            </div>
            {treatment.description && <div className="text-sm text-text-secondary">{treatment.description}</div>}
          </td>
          <td className="px-4 py-3 text-sm">
            {treatment.tooth_number || 'N/A'}
            {!child && treatment.tooth_number != null && getTreatmentOriginId(treatment) && (planGroupTeeth.get(getTreatmentOriginId(treatment)!) || []).length > 1 && (
              <span className="text-xs text-gray-400"> ({(planGroupTeeth.get(getTreatmentOriginId(treatment)!) || []).join(', ')})</span>
            )}
          </td>
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
            {isLinked ? (
              <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Invoiced</span>
            ) : treatment.status === 'Cancelled' ? (
              <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">Not billable</span>
            ) : (
              <span className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800">Ready to bill</span>
            )}
          </td>
          <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setEditingTreatment(treatment)}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              {canDelete() && (
                <button
                  type="button"
                  onClick={() => deleteTreatmentRow(treatment)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </td>
        </tr>
      )
    }

    const renderGroupRow = (key: string, members: any[]) => {
      const first = members[0]
      const expanded = expandedPlanGroups.has(key)
      const teeth = members
        .map((m) => m.tooth_number)
        .filter((n): n is number => n != null)
        .sort((a, b) => a - b)
      const statusCounts = new Map<string, number>()
      members.forEach((m) => statusCounts.set(m.status, (statusCounts.get(m.status) || 0) + 1))
      const totalCost = members.reduce((sum, m) => sum + (m.cost || 0), 0)
      const linkedCount = members.filter(isTreatmentLinked).length
      return (
        <Fragment key={`group-${key}`}>
          <tr className="cursor-pointer hover:bg-gray-50" onClick={() => togglePlanGroup(key)}>
            <td className="px-4 py-3 text-sm">{formatDateValue(first.created_at)}</td>
            <td className="px-4 py-3">
              <div className="font-medium flex items-center gap-2">
                {first.treatment_type}
                <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                  Plan &middot; {members.length} items
                </span>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
              {first.description && <div className="text-sm text-text-secondary">{first.description}</div>}
            </td>
            <td className="px-4 py-3 text-sm">{teeth.length > 0 ? teeth.join(', ') : 'N/A'}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1 mb-1">
                {Array.from(statusCounts.entries()).map(([status, count]) => (
                  <span key={status} className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${statusBadgeClass(status)}`}>
                    {count} {status}
                  </span>
                ))}
              </div>
              <select
                value=""
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const value = e.target.value
                  if (value) updateGroupTreatmentsStatus(members, value)
                  e.target.value = ''
                }}
                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 cursor-pointer"
                title="Change status for all items in this plan"
              >
                <option value="">Set all to…</option>
                <option value="Planned">Planned</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </td>
            <td className="px-4 py-3 text-sm">{formatCurrency(totalCost)}</td>
            <td className="px-4 py-3 text-sm">
              <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${linkedCount === members.length ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {linkedCount === members.length ? 'Invoiced' : linkedCount === 0 ? 'Ready to bill' : `${linkedCount}/${members.length} invoiced`}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-2">
                {linkedCount === 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEstimateJob({ treatments: members })
                    }}
                    className="text-xs text-primary hover:underline whitespace-nowrap"
                  >
                    Estimate
                  </button>
                )}
                <span className="text-xs text-gray-400 whitespace-nowrap">Expand to edit</span>
              </div>
            </td>
          </tr>
          {expanded && members.map((m) => renderTreatmentRow(m, true))}
        </Fragment>
      )
    }

    return (
    <div className="space-y-6">
      {duplicateClusters.length > 0 && (
        <div className="rounded-3xl bg-amber-50 border border-amber-200 p-4">
          <h3 className="font-semibold text-amber-900">Possible Duplicates</h3>
          <p className="text-xs text-amber-700 mt-1 mb-3">
            These planned/in-progress items share the same treatment type and tooth — likely the same work entered twice. Delete the one that shouldn&apos;t be billed.
          </p>
          <div className="space-y-3">
            {duplicateClusters.map((members, idx) => (
              <div key={idx} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="text-sm font-medium mb-2">
                  {members[0].treatment_type}
                  {members[0].tooth_number != null ? ` (T${members[0].tooth_number})` : ''}
                </div>
                <div className="space-y-1.5">
                  {members.map((m) => {
                    const invoiced = !!m.invoice_id || linkedTreatmentIds.has(m.id)
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-text-secondary">
                          {m.description || '—'} · {m.status} · {formatCurrency(m.cost || 0)}
                        </span>
                        {invoiced ? (
                          <span className="text-xs text-gray-400 whitespace-nowrap">Invoiced — resolve in Billing</span>
                        ) : canDelete() ? (
                          <button
                            type="button"
                            onClick={() => deleteTreatmentRow(m)}
                            className="text-xs text-red-600 hover:underline whitespace-nowrap"
                          >
                            Delete duplicate
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card rounded-3xl shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Treatment History</h3>
          <p className="text-sm text-text-secondary mt-1">{pendingBillableTreatments.length} treatment(s) ready to bill</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end items-center">
          <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer mr-1">
            <input
              type="checkbox"
              checked={groupSimilarTreatments}
              onChange={(e) => setGroupSimilarTreatments(e.target.checked)}
            />
            Group similar
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEstimateJob({ treatments: estimatableTreatments })}
            disabled={estimatableTreatments.length === 0}
          >
            Print estimate
          </Button>
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
                <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayRows.map((row) =>
                row.kind === 'group' ? renderGroupRow(row.key, row.members) : renderTreatmentRow(row.treatment)
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
    )
  }

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
                  {canDelete() && (
                    <button
                      type="button"
                      onClick={() => handleDeletePrescription(prescription.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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
                    {prescription.medications.map((med: any, idx: number) => {
                      const shouldTranslate = prescription.language !== 'en'
                      return (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                        <span>
                          <span className="font-semibold text-primary">Rx</span>
                          {' '}<span className="font-medium text-gray-800">{med.name}</span>
                          {med.dosage && <span className="text-gray-600"> · {shouldTranslate ? dosageToBengali(med.dosage) : med.dosage}</span>}
                          {med.frequency && <span className="text-gray-600"> · {shouldTranslate ? frequencyToBengali(med.frequency) : med.frequency}</span>}
                          {med.duration && <span className="text-gray-600"> · {shouldTranslate ? durationToBengali(med.duration) : med.duration}</span>}
                          {med.instructions && <span className="text-gray-500 italic"> — {shouldTranslate ? instructionsToBengali(med.instructions) : med.instructions}</span>}
                        </span>
                      </li>
                      )
                    })}
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

  const renderAppointmentsSection = () => {
    const upcomingIds = new Set(upcomingAppointments.map((appointment) => appointment.id))
    const pastAppointments = appointments.filter((appointment) => !upcomingIds.has(appointment.id))
    const orderedAppointments = [...upcomingAppointments, ...pastAppointments]
    return (
      <div className="bg-card rounded-3xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold">Appointments</h3>
          <Button onClick={() => setShowAppointmentForm(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Appointment
          </Button>
        </div>
        {orderedAppointments.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">No appointments recorded</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {orderedAppointments.map((appointment) => (
              <div key={appointment.id} className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium">{formatDateValue(appointment.date_time, 'MMMM d, yyyy h:mm a')}</div>
                  <div className="text-sm text-text-secondary">{appointment.type} • {appointment.duration} min</div>
                  {appointment.notes && <div className="text-sm mt-1">{appointment.notes}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {upcomingIds.has(appointment.id) && (
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Upcoming</span>
                  )}
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    appointment.status === 'Completed' ? 'bg-green-100 text-green-800' :
                    appointment.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {appointment.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

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
                    {canDelete() && (
                      <button
                        onClick={() => handleDeleteFile(file)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
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
      {prescriptions.length > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold mb-3">Prescription Summaries</h4>
          <div className="space-y-4">
            {prescriptions.slice(0, 5).map((prescription) => {
              const medicationNames = Array.isArray(prescription.medications)
                ? prescription.medications.map((med: any) => med?.name).filter(Boolean).join(', ')
                : ''
              const medicationCount = Array.isArray(prescription.medications) ? prescription.medications.length : 0
              return (
                <div key={prescription.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-medium">{formatDateValue(prescription.prescribed_date, 'MMMM d, yyyy h:mm a')}</div>
                    <span className="text-sm text-primary">{prescription.diagnosis || prescription.chief_complaint || 'Prescription'}</span>
                  </div>
                  {medicationNames && (
                    <div className="mt-3 text-sm">
                      <span className="font-medium text-text-secondary">Medications:</span> {medicationNames}
                    </div>
                  )}
                  {medicationCount > 0 && (
                    <div className="mt-2 text-xs text-text-secondary">{medicationCount} medication(s)</div>
                  )}
                </div>
              )
            })}
          </div>
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
        {totalDue < 0 ? (
          <div className="rounded-3xl bg-green-50 border border-green-200 p-5">
            <div className="text-sm text-green-600 font-medium">Advance</div>
            <div className="mt-2 text-2xl font-bold text-green-900">{formatCurrency(-totalDue)}</div>
          </div>
        ) : (
          <div className="rounded-3xl bg-red-50 border border-red-200 p-5">
            <div className="text-sm text-red-600 font-medium">Balance Due</div>
            <div className="mt-2 text-2xl font-bold text-red-900">{formatCurrency(totalDue)}</div>
          </div>
        )}
      </div>

      {totalBilled > 0 && (
        <div className="bg-card rounded-3xl shadow-sm border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Payment progress</span>
            <span className="text-text-secondary">{Math.min(Math.round((totalPaid / totalBilled) * 100), 100)}% collected</span>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
            {totalPaid > 0 && <div className="bg-green-500" style={{ width: `${Math.min((totalPaid / totalBilled) * 100, 100)}%` }} />}
            {totalDue > 0 && <div className="bg-red-400" style={{ width: `${(totalDue / totalBilled) * 100}%` }} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Paid {formatCurrency(totalPaid)}</span>
            {totalDue < 0
              ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Advance {formatCurrency(-totalDue)}</span>
              : <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Due {formatCurrency(totalDue)}</span>}
          </div>
        </div>
      )}

      <div className="bg-card rounded-3xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Invoice History</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {activeInvoices.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInvoicePrintJob({ invoices: activeInvoices.slice().reverse() })}
              >
                <Printer className="w-4 h-4 mr-2" />
                Print all ({activeInvoices.length})
              </Button>
            )}
            {pendingInvoices.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInvoicePrintJob({ invoices: activeInvoices.slice().reverse(), initialDueOnly: true })}
              >
                <Printer className="w-4 h-4 mr-2" />
                Print due ({pendingInvoices.length})
              </Button>
            )}
            {pendingInvoices.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setMergeMode((prev) => !prev)
                  setSelectedForMerge(new Set())
                }}
              >
                {mergeMode ? 'Cancel merge' : 'Select to merge'}
              </Button>
            )}
            <Button size="sm" onClick={() => setShowInvoiceForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Invoice
            </Button>
          </div>
        </div>
        {mergeMode && (
          <div className="p-3 bg-blue-50 border-b border-blue-200 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-blue-800">
              {selectedForMerge.size >= 2
                ? `Merge ${selectedForMerge.size} invoices — total due ${formatCurrency(
                    pendingInvoices
                      .filter((invoice: any) => selectedForMerge.has(invoice.id))
                      .reduce((sum: number, invoice: any) => sum + getInvoiceDue(invoice), 0)
                  )}`
                : 'Select 2 or more due invoices to merge'}
            </span>
            <div className="flex gap-2">
              <Button size="sm" disabled={selectedForMerge.size < 2} onClick={handleMergeSelectedInvoices}>
                Merge selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setMergeMode(false)
                  setSelectedForMerge(new Set())
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">No invoices recorded</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {invoices.map((invoice) => (
              <PatientInvoiceRow
                key={invoice.id}
                invoice={invoice}
                patient={patient}
                onDelete={() => handleDeleteInvoice(invoice.id)}
                onEdit={() => setEditingInvoiceRecord(invoice)}
                onPaymentRecorded={loadPatientData}
                onPaymentPrintChain={async (invoiceId) => {
                  const { data } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
                  if (data) setInvoicePrintJob({ invoices: [data] })
                }}
                mergeMode={mergeMode}
                mergeSelected={selectedForMerge.has(invoice.id)}
                onToggleMergeSelected={() => {
                  setSelectedForMerge((prev) => {
                    const next = new Set(prev)
                    if (next.has(invoice.id)) {
                      next.delete(invoice.id)
                    } else {
                      next.add(invoice.id)
                    }
                    return next
                  })
                }}
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
    <div className="space-y-6 pb-40 md:pb-6 page-fade-in">
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
          { label: totalDue < 0 ? 'Advance' : 'Balance', value: formatCurrency(Math.abs(totalDue)) },
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
          onClick={openPaymentFlow}
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

      <div className={`fixed right-4 bottom-20 md:right-6 md:bottom-6 ${showQuickAdd ? 'z-50' : 'z-40'}`}>
        {showQuickAdd && (
          <>
            <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowQuickAdd(false)} />
            <div className="absolute bottom-16 right-0 z-50 w-56 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
              <button
                onClick={() => { setShowQuickAdd(false); setShowTreatmentPlanForm(true) }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-gray-100"
              >
                <Activity className="h-4 w-4 text-primary" />
                New Treatment Plan
              </button>
              <button
                onClick={() => { setShowQuickAdd(false); setShowVisitForm(true) }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-gray-100"
              >
                <Stethoscope className="h-4 w-4 text-primary" />
                New Visit
              </button>
              <button
                disabled={pendingInvoices.length === 0}
                onClick={() => {
                  setShowQuickAdd(false)
                  openPaymentFlow()
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <DollarSign className="h-4 w-4 text-primary" />
                Add Payment
                {pendingInvoices.length === 0 && <span className="ml-auto text-xs font-normal text-text-secondary">No due invoices</span>}
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setShowQuickAdd((prev) => !prev)}
          aria-label={showQuickAdd ? 'Close quick actions' : 'Open quick actions'}
          className={`relative z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-all duration-200 hover:shadow-xl ${showQuickAdd ? 'rotate-45' : ''}`}
        >
          <Plus className="h-6 w-6" />
        </button>
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

      {rxCostDialogEntries && (
        <TreatmentPlanCostDialog
          entries={rxCostDialogEntries}
          initialCosts={rxCostDialogInitial}
          onConfirm={async (costs) => {
            setRxCostDialogEntries(null)
            await savePrescriptionWithCosts(costs)
          }}
          onCancel={() => setRxCostDialogEntries(null)}
        />
      )}

      {showVisitForm && (
        <VisitFormModal
          formData={visitForm}
          setFormData={setVisitForm}
          treatmentsDone={visitTreatmentsDone}
          setTreatmentsDone={setVisitTreatmentsDone}
          plannedTreatments={plannedTreatments}
          plannedSelections={visitPlannedSelections}
          setPlannedSelections={setVisitPlannedSelections}
          invoices={invoices}
          allTreatments={treatments}
          payment={visitPayment}
          setPayment={setVisitPayment}
          dentitionType={patientDentition}
          onSubmit={handleVisitSubmit}
          onClose={() => setShowVisitForm(false)}
        />
      )}

      {editingVisit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold">Edit Visit</h2>
              <button type="button" onClick={() => setEditingVisit(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleVisitEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Visit Date & Time</label>
                <input
                  type="datetime-local"
                  value={visitEditForm.visit_date}
                  onChange={(e) => setVisitEditForm({ ...visitEditForm, visit_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Chief Complaint</label>
                <input
                  type="text"
                  value={visitEditForm.chief_complaint}
                  onChange={(e) => setVisitEditForm({ ...visitEditForm, chief_complaint: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Examination Findings</label>
                <input
                  type="text"
                  value={visitEditForm.examination_findings}
                  onChange={(e) => setVisitEditForm({ ...visitEditForm, examination_findings: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Diagnosis</label>
                <input
                  type="text"
                  value={visitEditForm.diagnosis}
                  onChange={(e) => setVisitEditForm({ ...visitEditForm, diagnosis: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Treatment Plan</label>
                <input
                  type="text"
                  value={visitEditForm.treatment_plan}
                  onChange={(e) => setVisitEditForm({ ...visitEditForm, treatment_plan: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              {(editingVisitFixedSummary.treatmentDone || editingVisitFixedSummary.payment) && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <p className="text-xs font-medium text-text-secondary">Recorded automatically at the visit — not editable</p>
                  {editingVisitFixedSummary.treatmentDone && (
                    <div className="flex flex-wrap gap-1.5">
                      {parseTreatmentDoneChips(editingVisitFixedSummary.treatmentDone).map((chip, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${treatmentDoneChipClass(chip.status)}`}
                        >
                          {chip.label}{chip.status ? ` · ${chip.status}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {editingVisitFixedSummary.payment && (
                    <div className="flex flex-wrap gap-1.5">
                      {buildVisitPaymentChips(editingVisit, editingVisitFixedSummary.payment, invoices, payments).map((chip, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${paymentChipClass(chip)}`}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Notes (your own notes)</label>
                <textarea
                  rows={2}
                  value={visitEditForm.notes}
                  onChange={(e) => setVisitEditForm({ ...visitEditForm, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1">Save Changes</Button>
                <Button type="button" variant="outline" onClick={() => setEditingVisit(null)} className="flex-1">Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPrescriptionForm && (
        <PrescriptionFormModal
          formData={prescriptionForm}
          setFormData={setPrescriptionForm}
          dentitionType={patientDentition}
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
            language: printingPrescription.language,
          }}
          patient={{
            first_name: patient.first_name,
            last_name: patient.last_name,
            date_of_birth: patient.date_of_birth,
            gender: patient.gender,
            phone: patient.phone,
            email: patient.email,
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
          dentitionType={patientDentition}
          existingPlanned={plannedTreatments}
          onSubmit={handleTreatmentPlanSubmit}
          onClose={() => setShowTreatmentPlanForm(false)}
          onAddItem={addTreatmentPlanItem}
          onRemoveItem={removeTreatmentPlanItem}
        />
      )}

      {editingTreatment && (
        <EditTreatmentModal
          treatment={editingTreatment}
          dentitionType={patientDentition}
          onSave={updateTreatmentFields}
          onClose={() => setEditingTreatment(null)}
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
          preferredPlanGroupId={invoicePlanGroupId}
          onClose={() => {
            setShowInvoiceForm(false)
            setInvoicePlanGroupId(null)
          }}
          onSave={async (invoiceId) => {
            await loadPatientData()
            setShowInvoiceForm(false)
            setInvoicePlanGroupId(null)
            if (invoiceId) {
              const { data } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
              if (data && confirm('Invoice created. Print or share it now?')) {
                setInvoicePrintJob({ invoices: [data] })
              }
            }
          }}
        />
      )}

      {editingInvoiceRecord && id && (
        <InvoiceModal
          defaultPatientId={id}
          hidePatientSelect
          editingInvoice={editingInvoiceRecord}
          onClose={() => setEditingInvoiceRecord(null)}
          onSave={async (invoiceId) => {
            await loadPatientData()
            setEditingInvoiceRecord(null)
            if (invoiceId) {
              const { data } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
              if (data && confirm('Invoice updated. Print or share it now?')) {
                setInvoicePrintJob({ invoices: [data] })
              }
            }
          }}
        />
      )}

      {estimateJob && patient && (
        <TreatmentEstimatePrint
          treatments={estimateJob.treatments}
          patient={patient}
          doctor={doctorProfile}
          onClose={() => setEstimateJob(null)}
        />
      )}

      {payingInvoice && (
        <PaymentEntryModal
          invoiceId={payingInvoice.id}
          invoiceTotal={payingInvoice.total_amount || 0}
          invoicePaid={payingInvoice.paid_amount || 0}
          onClose={() => setPayingInvoice(null)}
          onSaved={async () => {
            const paidInvoiceId = payingInvoice.id
            setPayingInvoice(null)
            await loadPatientData()
            if (confirm('Payment recorded. Print the updated invoice?')) {
              const { data } = await supabase.from('invoices').select('*').eq('id', paidInvoiceId).maybeSingle()
              if (data) setInvoicePrintJob({ invoices: [data] })
            }
          }}
        />
      )}

      {showPayPicker && id && (
        <PayInvoicePickerModal
          patientId={id}
          invoices={pendingInvoices}
          onClose={() => setShowPayPicker(false)}
          onChanged={loadPatientData}
        />
      )}

      {invoicePrintJob && patient && (
        <InvoicePrint
          invoices={invoicePrintJob.invoices}
          patient={{
            first_name: patient.first_name,
            last_name: patient.last_name,
            phone: patient.phone,
            email: patient.email,
            patient_code: patient.patient_code,
          }}
          doctor={doctorProfile}
          initialDueOnly={invoicePrintJob.initialDueOnly}
          onClose={() => setInvoicePrintJob(null)}
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
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold">Tooth #{toothNumber}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
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

function VisitFormModal({
  formData,
  setFormData,
  treatmentsDone,
  setTreatmentsDone,
  plannedTreatments,
  plannedSelections,
  setPlannedSelections,
  invoices,
  allTreatments,
  payment,
  setPayment,
  dentitionType,
  onSubmit,
  onClose,
}: any) {
  // Grouping is opt-in per plan-item type so visits with many planned treatments
  // (e.g. a full-mouth plan) don't force a long scroll through one card each —
  // mirrors the "Group similar" toggle on the Treatment History tab.
  const [groupPlannedTreatments, setGroupPlannedTreatments] = useState(true)
  const [expandedVisitGroups, setExpandedVisitGroups] = useState<Set<string>>(new Set())
  const toggleVisitGroup = (key: string) =>
    setExpandedVisitGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const validTreatments = (treatmentsDone as VisitTreatmentEntry[]).filter((entry) => entry.description.trim())
  const selectedPlanned = (plannedTreatments as any[]).filter((t) => plannedSelections[t.id]?.selected)
  // Only uninvoiced plan items go on the new invoice; billed ones route the
  // payment to their existing invoice instead.
  const selectedUnbilled = selectedPlanned.filter((t) => !t.invoice_id)
  // Ad-hoc entries create one treatment row per tooth, each at the entry's cost
  const treatmentsTotal =
    validTreatments.reduce((sum, entry) => sum + (parseFloat(entry.cost) || 0) * Math.max(entry.teeth.length, 1), 0) +
    selectedUnbilled.reduce((sum, t) => sum + (parseFloat(plannedSelections[t.id]?.cost) || 0), 0)
  // Already-billed selected items don't add to treatmentsTotal (their cost was invoiced on
  // a prior visit) — payment for them instead pays down whatever's still due on that invoice.
  // Surfaced separately so "Treatments total: 0" doesn't read as if there's nothing to pay.
  const selectedBilledInvoiceIds = Array.from(
    new Set(selectedPlanned.filter((t) => t.invoice_id).map((t) => t.invoice_id as string))
  )
  const billedDueTotal = selectedBilledInvoiceIds.reduce((sum, invoiceId) => {
    const invoice = (invoices as any[]).find((inv) => inv.id === invoiceId)
    return invoice ? sum + getInvoiceDue(invoice) : sum
  }, 0)
  const hasAnyDone = validTreatments.length > 0 || selectedPlanned.length > 0

  function updateTreatmentEntry(index: number, patch: Partial<VisitTreatmentEntry>) {
    setTreatmentsDone(treatmentsDone.map((entry: VisitTreatmentEntry, i: number) => (i === index ? { ...entry, ...patch } : entry)))
  }

  function togglePlanned(treatmentId: string, cost: string) {
    setPlannedSelections((prev: Record<string, any>) => {
      const existing = prev[treatmentId]
      if (existing?.selected) {
        const { [treatmentId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [treatmentId]: { selected: true, status: 'In Progress', cost } }
    })
  }

  function updatePlannedSelection(treatmentId: string, patch: Partial<{ status: 'In Progress' | 'Completed'; cost: string }>) {
    setPlannedSelections((prev: Record<string, any>) => ({
      ...prev,
      [treatmentId]: { ...prev[treatmentId], ...patch },
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10 flex items-center justify-between">
          <h2 className="text-xl font-bold">Add Visit</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
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
            {plannedTreatments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(plannedTreatments as any[]).map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full bg-gray-100 text-gray-600 border border-gray-200"
                  >
                    {buildTreatmentLabel(t)} · {t.status}
                  </span>
                ))}
              </div>
            )}
            <textarea
              rows={3}
              value={formData.treatment_plan}
              onChange={(e) => setFormData({ ...formData, treatment_plan: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Treatment Done</label>

            {plannedTreatments.length > 0 && (() => {
              const renderPlannedItem = (t: any) => {
                const selection = plannedSelections[t.id]
                return (
                  <div key={t.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!selection?.selected}
                        onChange={() => togglePlanned(t.id, resolvePlannedCostSeed(t, plannedTreatments as any[]))}
                      />
                      {buildTreatmentLabel(t)}
                      {t.invoice_id && (
                        <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">Billed</span>
                      )}
                    </label>
                    {selection?.selected && (
                      <div className="flex flex-wrap items-center gap-2 pl-6">
                        <span className="w-32 px-3 py-1.5 text-sm text-text-secondary">
                          {formatBDT(resolvePlannedDisplayCost(t, allTreatments, invoices))}
                        </span>
                        <select
                          value={selection.status}
                          onChange={(e) => updatePlannedSelection(t.id, { status: e.target.value as 'In Progress' | 'Completed' })}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </div>
                    )}
                  </div>
                )
              }

              // Group by treatment type so a full-mouth plan (many teeth, same
              // procedure) collapses into one row instead of one card each.
              const groupBuckets = new Map<string, any[]>()
              ;(plannedTreatments as any[]).forEach((t) => {
                const key = (t.treatment_type || 'Other').trim()
                groupBuckets.set(key, [...(groupBuckets.get(key) || []), t])
              })

              return (
                <div className="mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-text-secondary">From Treatment Plan</p>
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={groupPlannedTreatments}
                        onChange={(e) => setGroupPlannedTreatments(e.target.checked)}
                      />
                      Group similar
                    </label>
                  </div>
                  {[...groupBuckets.entries()].map(([key, members]) => {
                    if (!groupPlannedTreatments || members.length < 2) {
                      return members.map((t) => renderPlannedItem(t))
                    }
                    const expanded = expandedVisitGroups.has(key)
                    const selectedCount = members.filter((t) => plannedSelections[t.id]?.selected).length
                    const allSelected = selectedCount === members.length
                    return (
                      <div key={`group-${key}`} className="rounded-lg border border-gray-200 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => {
                                members.forEach((t) => {
                                  const isSelected = !!plannedSelections[t.id]?.selected
                                  if (allSelected ? isSelected : !isSelected) {
                                    togglePlanned(t.id, resolvePlannedCostSeed(t, plannedTreatments as any[]))
                                  }
                                })
                              }}
                            />
                            {key}
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                              {members.length} items{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
                            </span>
                          </label>
                          <button type="button" onClick={() => toggleVisitGroup(key)} className="text-gray-400 hover:text-gray-600">
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                        {expanded && <div className="space-y-2 pl-2">{members.map((t) => renderPlannedItem(t))}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            <p className="text-xs font-medium text-text-secondary mb-1">{plannedTreatments.length > 0 ? 'Other treatment done' : ''}</p>
            <div className="space-y-2">
              {(treatmentsDone as VisitTreatmentEntry[]).map((entry, index) => (
                <div key={entry.key} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Treatment done (e.g. Extraction, RCT)"
                      value={entry.description}
                      onChange={(e) => updateTreatmentEntry(index, { description: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setTreatmentsDone(treatmentsDone.filter((_: VisitTreatmentEntry, i: number) => i !== index))}
                      className="text-gray-400 hover:text-red-500"
                      aria-label="Remove treatment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ToothSelector selectedTeeth={entry.teeth} onChange={(teeth) => updateTreatmentEntry(index, { teeth })} dentitionType={dentitionType} />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Cost (BDT)"
                      value={entry.cost}
                      onChange={(e) => updateTreatmentEntry(index, { cost: e.target.value })}
                      className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <select
                      value={entry.status}
                      onChange={(e) => updateTreatmentEntry(index, { status: e.target.value as VisitTreatmentEntry['status'] })}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setTreatmentsDone([...treatmentsDone, createEmptyVisitTreatment()])}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
              >
                <Plus className="w-4 h-4" />
                Add Treatment
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Payment Received</label>
            {hasAnyDone ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Amount (BDT)"
                    value={payment.amount}
                    onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                    className="w-36 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <select
                    value={payment.method}
                    onChange={(e) => setPayment({ ...payment, method: e.target.value })}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                  {treatmentsTotal > 0 && (
                    <span className="text-xs text-text-secondary">Treatments total: {formatBDT(treatmentsTotal)}</span>
                  )}
                  {billedDueTotal > 0 && (
                    <span className="text-xs text-text-secondary">Due on billed item(s): {formatBDT(billedDueTotal)}</span>
                  )}
                  {treatmentsTotal <= 0 && billedDueTotal <= 0 && (
                    <span className="text-xs text-text-secondary">Treatments total: {formatBDT(0)}</span>
                  )}
                </div>
                {(parseFloat(payment.amount) || 0) > 0 && (
                  <p className="text-xs text-text-secondary">
                    {selectedUnbilled.length > 0 || validTreatments.length > 0
                      ? 'A new invoice will be generated for the unbilled treatments above.'
                      : 'This payment will be applied to the existing invoice of the billed item(s).'}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-text-secondary px-3 py-2 border border-dashed border-gray-300 rounded-lg">
                Add a treatment done first to record a payment.
              </p>
            )}
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
  dentitionType,
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

  // Auto-select teeth already tagged upstream (On Examination → Diagnosis → Treatment Plan)
  // onto each field's own first entry, so a tooth picked once doesn't need re-picking.
  // Only touches the first entry; manual removals stick unless the upstream tooth set changes again.
  const diagnosisUpstreamTeeth = collectSuggestedTeeth([formData.on_examination_entries])
  const treatmentPlanUpstreamTeeth = collectSuggestedTeeth([formData.on_examination_entries, formData.diagnosis_entries])

  useEffect(() => {
    if (diagnosisUpstreamTeeth.length === 0) return
    setFormData((prev: any) => {
      const entries = prev.diagnosis_entries
      if (entries.length === 0) return prev
      const merged = Array.from(new Set([...entries[0].teeth, ...diagnosisUpstreamTeeth])).sort((a: number, b: number) => a - b)
      if (merged.length === entries[0].teeth.length) return prev
      return { ...prev, diagnosis_entries: [{ ...entries[0], teeth: merged }, ...entries.slice(1)] }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(diagnosisUpstreamTeeth)])

  useEffect(() => {
    if (treatmentPlanUpstreamTeeth.length === 0) return
    setFormData((prev: any) => {
      const entries = prev.treatment_plan_entries
      if (entries.length === 0) return prev
      const merged = Array.from(new Set([...entries[0].teeth, ...treatmentPlanUpstreamTeeth])).sort((a: number, b: number) => a - b)
      if (merged.length === entries[0].teeth.length) return prev
      return { ...prev, treatment_plan_entries: [{ ...entries[0], teeth: merged }, ...entries.slice(1)] }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(treatmentPlanUpstreamTeeth)])

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
            dentitionType={dentitionType}
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
            suggestedTeeth={collectSuggestedTeeth([formData.on_examination_entries])}
            dentitionType={dentitionType}
          />

          {/* ── Treatment Plan ── */}
          <MultiEntryClinicalField
            label="Treatment Plan"
            entries={formData.treatment_plan_entries}
            onChange={(entries: ClinicalEntry[]) => setFormData({ ...formData, treatment_plan_entries: entries })}
            placeholder="e.g., RCT + Cap"
            helperText="Each entry is added to this patient's Operations tab as its own treatment record, individually selectable for invoicing."
            suggestedTeeth={collectSuggestedTeeth([formData.on_examination_entries, formData.diagnosis_entries])}
            dentitionType={dentitionType}
          />

          {/* ── Medications ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 rounded-full bg-primary"></div>
              <Pill className="w-4 h-4 text-primary" />
              <span className="font-semibold text-gray-800">Rx — Medications</span>
              <div className="ml-auto flex items-center gap-2">
                <PrescriptionLanguageToggle
                  value={formData.language}
                  onChange={(language) =>
                    setFormData({
                      ...formData,
                      language,
                      medications: formData.medications.map((med: any) => retranslateMedication(med, language)),
                    })
                  }
                />
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
                            ...translateDrugDefaults(drug, drug.ageDosing[defaultTier], formData.language),
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
                                    dosage: translateDosage(ageDosing[tier], formData.language),
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

function EditTreatmentModal({ treatment, dentitionType, onSave, onClose }: {
  treatment: any
  dentitionType: any
  onSave: (id: string, patch: {
    treatment_type: string
    tooth_number: number | null
    description: string | null
    cost: number
    status: string
    notes: string | null
  }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    treatment_type: treatment.treatment_type || '',
    tooth_number: treatment.tooth_number ?? null,
    description: treatment.description || '',
    cost: String(treatment.cost ?? ''),
    status: treatment.status || 'Planned',
    notes: treatment.notes || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(treatment.id, {
        treatment_type: form.treatment_type,
        tooth_number: form.tooth_number,
        description: form.description || null,
        cost: parseFloat(form.cost) || 0,
        status: form.status,
        notes: form.notes || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold">Edit Treatment</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Treatment Type *</label>
            <select
              required
              value={form.treatment_type}
              onChange={(e) => setForm({ ...form, treatment_type: e.target.value })}
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
              <option>Dentures</option>
              <option>Scaling</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Tooth</label>
            <ToothSelector
              selectedTeeth={form.tooth_number != null ? [form.tooth_number] : []}
              onChange={(teeth: number[]) => setForm({ ...form, tooth_number: teeth.length > 0 ? teeth[teeth.length - 1] : null })}
              dentitionType={dentitionType}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
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
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TreatmentPlanModal({ formData, setFormData, dentitionType, existingPlanned, onSubmit, onClose, onAddItem, onRemoveItem }: any) {
  function updateItem(index: number, patch: Record<string, any>) {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], ...patch }
    setFormData({ ...formData, items: newItems })
  }

  const plannedList = (existingPlanned as any[]) || []

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold">New Treatment Plan</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {plannedList.length > 0 && (
          <div className="px-6 pt-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-1.5">
                Already planned — check before adding a duplicate
              </p>
              <div className="flex flex-wrap gap-1.5">
                {plannedList.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full bg-white text-amber-900 border border-amber-200"
                  >
                    {buildTreatmentLabel(t)} · {t.status}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="space-y-3">
            {formData.items.map((item: any, index: number) => (
              <div key={index} className="relative rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
                <div className="absolute -left-3 top-4 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow">
                  {index + 1}
                </div>
                {formData.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Treatment Type *</label>
                  <select
                    required
                    value={item.treatment_type}
                    onChange={(e) => updateItem(index, { treatment_type: e.target.value })}
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
                    <label className="block text-sm font-medium mb-1">Tooth / Teeth</label>
                    <ToothSelector selectedTeeth={item.teeth} onChange={(teeth) => updateItem(index, { teeth })} dentitionType={dentitionType} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      value={item.status}
                      onChange={(e) => updateItem(index, { status: e.target.value })}
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
                    value={item.description}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
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
                    value={item.cost}
                    onChange={(e) => updateItem(index, { cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={item.notes}
                    onChange={(e) => updateItem(index, { notes: e.target.value })}
                    placeholder="Additional notes..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onAddItem}
            className="w-full text-sm font-medium text-primary border border-dashed border-primary/40 rounded-lg py-2 hover:bg-primary/5"
          >
            + Add Treatment Item
          </button>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <label className="block text-sm font-medium">Discount</label>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={formData.discount_type}
                onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="fixed">Fixed (BDT)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.discount_value}
                onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {(() => {
              const { subtotal, discountAmount, finalTotal } = computeTreatmentPlanDiscount(
                formData.items,
                formData.discount_type,
                formData.discount_value
              )
              return (
                <div className="text-sm space-y-1 pt-1 border-t border-gray-200">
                  <div className="flex justify-between text-text-secondary">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Final Total</span>
                    <span>{formatCurrency(finalTotal)}</span>
                  </div>
                </div>
              )
            })()}
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
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full my-8 max-h-[90vh] overflow-y-auto">
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
  patient,
  onDelete,
  onEdit,
  onPaymentRecorded,
  onPaymentPrintChain,
  mergeMode = false,
  mergeSelected = false,
  onToggleMergeSelected,
}: {
  invoice: any
  patient: any
  onDelete: () => void
  onEdit: () => void
  onPaymentRecorded: () => void
  onPaymentPrintChain: (invoiceId: string) => void
  mergeMode?: boolean
  mergeSelected?: boolean
  onToggleMergeSelected?: () => void
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
    Merged: 'bg-gray-100 text-gray-500',
  }
  const due = getInvoiceDue(invoice)
  const isMerged = invoice.status === 'Merged'
  const mergeEligible = !isMerged && due > 0

  return (
    <div className={`hover:bg-gray-50 transition-colors ${isMerged ? 'opacity-60' : ''}`}>
      <div
        className="p-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          {mergeMode && (
            <button
              type="button"
              disabled={!mergeEligible}
              onClick={(e) => {
                e.stopPropagation()
                onToggleMergeSelected?.()
              }}
              className="mt-0.5 flex-shrink-0 disabled:opacity-30"
            >
              {mergeSelected
                ? <CheckSquare className="w-5 h-5 text-primary" />
                : <Square className="w-5 h-5 text-gray-400" />}
            </button>
          )}
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
            {isMerged && invoice.merged_into_invoice_id && (
              <p className="mt-1 text-xs text-text-secondary">
                Merged into #{invoice.merged_into_invoice_id.slice(0, 8).toUpperCase()}
              </p>
            )}
          </div>
          {!mergeMode && (
            <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {!isMerged && (
                <Button size="sm" variant="outline" onClick={() => setShowPaymentModal(true)} disabled={due <= 0}>
                  Pay
                </Button>
              )}
              {!isMerged && (
                <Button size="sm" variant="outline" onClick={onEdit} title="Add or remove items on this invoice">
                  Edit
                </Button>
              )}
              {canDelete() && (
                <Button size="sm" variant="outline" onClick={onDelete}>Delete</Button>
              )}
            </div>
          )}
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
            <PaymentHistoryPanel invoiceId={invoice.id} invoice={invoice} patient={patient} />
          </div>

          <div className="mt-3">
            <InvoiceTimelinePanel invoiceId={invoice.id} />
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
            if (confirm('Payment recorded. Print the updated invoice?')) {
              onPaymentPrintChain(invoice.id)
            }
          }}
        />
      )}
    </div>
  )
}
