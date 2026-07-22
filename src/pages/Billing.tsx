import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  buildInvoiceItemPreview,
  extractTreatmentIdsFromInvoiceItems,
  formatInvoiceItemLabel,
  getFriendlySupabaseErrorMessage,
  getInvoiceItemLineTotal,
  getInvoiceItemSubtotal,
  type BillingLineItem,
} from '@/lib/billing'
import { recordInvoicePayment } from '@/lib/payments'
import {
  Plus,
  DollarSign,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircle,
  MoreVertical,
  Printer,
  Settings,
  BarChart3,
  Search,
  X,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InvoiceModal } from '@/components/InvoiceModal'
import { InvoicePrint } from '@/components/InvoicePrint'
import { InvoiceListPrint } from '@/components/InvoiceListPrint'
import { InvoiceTemplateSelector } from '@/components/InvoiceTemplateSelector'
import type { InvoiceTemplateData } from '@/components/InvoiceTemplateSelector'
import { PaymentHistoryPanel } from '@/components/PaymentHistoryPanel'
import { PaymentEntryModal } from '@/components/PaymentEntryModal'
import { PayInvoicePickerModal } from '@/components/PayInvoicePickerModal'
import { InvoiceTimelinePanel } from '@/components/InvoiceTimelinePanel'
import { FinancialReportsPanel } from '@/components/FinancialReportsPanel'
import { InvoiceSettingsModal } from '@/components/InvoiceSettingsModal'
import { supabase } from '@/lib/supabase'
import { loadDoctorProfile, type DoctorProfileData } from '@/lib/doctorProfile'
import { resolveLogoSrc } from '@/lib/logoImage'
import { sharePdf, toWhatsAppNumber } from '@/lib/sharePdf'
import { canDelete } from '@/lib/appSession'
import { logDeletion } from '@/lib/deleteHistory'
import { logEdit } from '@/lib/editHistory'
import { matchesPatientSearch } from '@/lib/patients'
import { safeFormat, formatBDT } from '@/lib/utils'

interface Invoice {
  id: string
  patient_id: string
  items: BillingLineItem[] | null
  total_amount: number
  paid_amount: number
  discount_amount?: number | null
  tax_amount?: number | null
  tax_rate?: number | null
  notes?: string | null
  payment_terms?: string | null
  invoice_number?: string | null
  invoice_type?: string | null
  recurring_enabled?: boolean | null
  recurring_frequency: string | null
  status: string
  due_date: string | null
  created_at: string
  patients: {
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    patient_code: string | null
  } | null
}

const PATIENT_ACCENTS = [
  { bar: 'bg-rose-400', avatar: 'bg-rose-100 text-rose-700', ring: 'ring-rose-100', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  { bar: 'bg-orange-400', avatar: 'bg-orange-100 text-orange-700', ring: 'ring-orange-100', chip: 'bg-orange-50 text-orange-700 border-orange-200' },
  { bar: 'bg-amber-400', avatar: 'bg-amber-100 text-amber-700', ring: 'ring-amber-100', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  { bar: 'bg-emerald-400', avatar: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-100', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { bar: 'bg-teal-400', avatar: 'bg-teal-100 text-teal-700', ring: 'ring-teal-100', chip: 'bg-teal-50 text-teal-700 border-teal-200' },
  { bar: 'bg-sky-400', avatar: 'bg-sky-100 text-sky-700', ring: 'ring-sky-100', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  { bar: 'bg-indigo-400', avatar: 'bg-indigo-100 text-indigo-700', ring: 'ring-indigo-100', chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { bar: 'bg-violet-400', avatar: 'bg-violet-100 text-violet-700', ring: 'ring-violet-100', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  { bar: 'bg-fuchsia-400', avatar: 'bg-fuchsia-100 text-fuchsia-700', ring: 'ring-fuchsia-100', chip: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  { bar: 'bg-pink-400', avatar: 'bg-pink-100 text-pink-700', ring: 'ring-pink-100', chip: 'bg-pink-50 text-pink-700 border-pink-200' },
]

function getPatientAccent(patientId: string) {
  let hash = 0
  for (let i = 0; i < patientId.length; i++) hash = (hash * 31 + patientId.charCodeAt(i)) >>> 0
  return PATIENT_ACCENTS[hash % PATIENT_ACCENTS.length]
}

function getPatientInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showBasicModal, setShowBasicModal] = useState(false)
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [showReports, setShowReports] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showPendingPatients, setShowPendingPatients] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<InvoiceTemplateData | null>(null)
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState<string>(() => {
    const f = searchParams.get('filter')
    return ['Due', 'Pending', 'Partial', 'Paid'].includes(f || '') ? f! : 'all'
  })
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [pendingPatients, setPendingPatients] = useState<Array<{ patient_id: string; name: string; count: number }>>([])
  const [preselectedPatientId, setPreselectedPatientId] = useState('')
  const [patientFilter, setPatientFilter] = useState<{ id: string; name: string } | null>(null)
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false)
  const [printJob, setPrintJob] = useState<{ invoices: Invoice[]; patient: NonNullable<Invoice['patients']>; initialDueOnly?: boolean } | null>(null)
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set())
  const [showListPrint, setShowListPrint] = useState(false)
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileData | null>(null)
  const [allPatients, setAllPatients] = useState<Array<{ id: string; name: string; phone: string | null; patient_code: string | null }>>([])
  const [payPicker, setPayPicker] = useState<{ patientId: string; invoices: Invoice[] } | null>(null)
  const [editingInvoiceRecord, setEditingInvoiceRecord] = useState<Invoice | null>(null)

  useEffect(() => {
    loadInvoices()
    loadPendingPatients()
    loadAllPatients()
  }, [])

  useEffect(() => {
    if (!showMoreMenu) return
    const handler = () => setShowMoreMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showMoreMenu])

  useEffect(() => {
    if (!showPendingPatients) return
    const handler = () => setShowPendingPatients(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showPendingPatients])

  useEffect(() => {
    if (!showPatientSuggestions) return
    const handler = () => setShowPatientSuggestions(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showPatientSuggestions])

  async function loadInvoices() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('invoices')
        .select('*, patients (first_name, last_name, email, phone, patient_code)')
        .order('created_at', { ascending: false })

      if (error) throw error
      setInvoices((data as Invoice[]) || [])
    } catch (error) {
      console.error('Error loading invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadAllPatients() {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('id, first_name, last_name, phone, patient_code')
        .neq('patient_type', 'consultation')

      if (error) throw error
      setAllPatients(
        ((data || []) as Array<{ id: string; first_name: string; last_name: string; phone: string | null; patient_code: string | null }>).map(
          (patient) => ({
            id: patient.id,
            name: `${patient.first_name} ${patient.last_name}`.trim(),
            phone: patient.phone,
            patient_code: patient.patient_code,
          })
        )
      )
    } catch (error) {
      console.error('Error loading patients:', error)
    }
  }

  async function loadPendingPatients() {
    interface PendingTreatmentRow {
      id: string
      patient_id: string | null
      invoice_id?: string | null
      patients: { first_name: string; last_name: string } | null
    }

    function groupByPatient(rows: PendingTreatmentRow[]) {
      const map = new Map<string, { name: string; count: number }>()
      for (const row of rows) {
        if (!row.patient_id) continue
        const name = row.patients
          ? `${row.patients.first_name} ${row.patients.last_name}`.trim()
          : 'Unknown patient'
        const existing = map.get(row.patient_id)
        if (existing) {
          existing.count += 1
        } else {
          map.set(row.patient_id, { name, count: 1 })
        }
      }
      return Array.from(map.entries()).map(([patient_id, { name, count }]) => ({ patient_id, name, count }))
    }

    try {
      // invoice_id (not is_invoiced) is normally the source of truth — the FK's ON DELETE
      // SET NULL keeps it accurate even if an invoice was deleted by an older app version
      // that left is_invoiced stuck true. But invoice_id can still go stale on its own (a
      // restored invoice doesn't always re-link every treatment it lists) — cross-check
      // against live invoices' items JSON too before calling something unbilled.
      const [{ data, error }, { data: invoicesData, error: invoicesError }] = await Promise.all([
        supabase
          .from('treatments')
          .select('id, patient_id, invoice_id, patients (first_name, last_name)')
          .is('invoice_id', null)
          .neq('status', 'Cancelled'),
        supabase.from('invoices').select('items').neq('status', 'Merged'),
      ])

      if (error) throw error
      if (invoicesError) throw invoicesError

      const linkedTreatmentIds = extractTreatmentIdsFromInvoiceItems(
        (invoicesData || []).flatMap((invoice: { items?: unknown }) => (Array.isArray(invoice.items) ? invoice.items : []))
      )

      setPendingPatients(
        groupByPatient(((data || []) as PendingTreatmentRow[]).filter((row) => !linkedTreatmentIds.has(row.id)))
      )
    } catch {
      // treatments.is_invoiced / invoice_id are added by a later migration —
      // fall back to cross-referencing treatment ids stored in invoice items
      try {
        const [{ data: treatmentsData, error: treatmentsError }, { data: invoicesData, error: invoicesError }] = await Promise.all([
          supabase.from('treatments').select('id, patient_id, patients (first_name, last_name)').neq('status', 'Cancelled'),
          supabase.from('invoices').select('items').neq('status', 'Merged'),
        ])

        if (treatmentsError) throw treatmentsError
        if (invoicesError) throw invoicesError

        const linkedTreatmentIds = extractTreatmentIdsFromInvoiceItems(
          (invoicesData || []).flatMap((invoice: { items?: unknown }) => (Array.isArray(invoice.items) ? invoice.items : []))
        )

        setPendingPatients(
          groupByPatient(((treatmentsData || []) as PendingTreatmentRow[]).filter((row) => !linkedTreatmentIds.has(row.id)))
        )
      } catch {
        setPendingPatients([])
      }
    }
  }

  async function deleteInvoice(id: string) {
    if (!canDelete()) return
    if (!confirm('Delete this invoice?')) return

    try {
      const invoice = invoices.find((inv) => inv.id === id)
      await logDeletion({
        entityType: 'invoice',
        entityId: id,
        entityLabel: invoice?.invoice_number || 'Invoice',
        patientId: (invoice as any)?.patient_id ?? null,
        patientName: invoice ? `${(invoice as any).patients?.first_name || ''} ${(invoice as any).patients?.last_name || ''}`.trim() || null : null,
        payload: invoice || { id },
        // payments.invoice_id is ON DELETE CASCADE — any recorded payments are
        // silently dropped with the invoice, so call that out here since it's
        // otherwise the only surviving mention of the lost payment ledger.
        details: (invoice?.paid_amount || 0) > 0
          ? `Total ${formatBDT(invoice?.total_amount || 0)}; ${formatBDT(invoice?.paid_amount || 0)} in recorded payments also removed`
          : `Total ${formatBDT(invoice?.total_amount || 0)}`,
      })
      // Free the invoiced treatments so they can be billed again. Must run before the
      // delete: the FK ON DELETE SET NULL wipes treatments.invoice_id once the invoice
      // row is gone. Two paths because linkage is dual (invoice_id column + items JSON);
      // errors swallowed since is_invoiced/invoice_id may not exist on legacy schemas.
      await supabase
        .from('treatments')
        .update({ is_invoiced: false, invoice_id: null })
        .eq('invoice_id', id)
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
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) throw error
      setInvoices((prev) => prev.filter((invoice) => invoice.id !== id))
      setSelectedInvoices((prev) => prev.filter((invoiceId) => invoiceId !== id))
    } catch (error) {
      console.error('Error deleting invoice:', error)
      alert('Failed to delete invoice')
    }
  }

  async function bulkUpdateStatus(status: 'Pending' | 'Paid') {
    if (selectedInvoices.length === 0) return

    const ids = [...selectedInvoices]
    const targets = invoices.filter((invoice) => ids.includes(invoice.id) && invoice.status !== 'Merged')

    async function logInvoiceEdit(previousInvoice: Invoice) {
      await logEdit({
        entityType: 'invoice',
        entityId: previousInvoice.id,
        entityLabel: (previousInvoice as any).invoice_number || 'Invoice',
        patientId: (previousInvoice as any).patient_id ?? null,
        patientName: `${(previousInvoice as any).patients?.first_name || ''} ${(previousInvoice as any).patients?.last_name || ''}`.trim() || null,
        previousPayload: previousInvoice,
      })
    }

    if (status === 'Paid') {
      // Route through the payments ledger — never flip status without a payment record
      const dueTargets = targets.filter((invoice) => (invoice.total_amount || 0) - (invoice.paid_amount || 0) > 0)
      if (dueTargets.length === 0) {
        alert('No selected invoice has a due balance.')
        return
      }
      if (!confirm(`Record full payment (Cash) on ${dueTargets.length} invoice(s) with a due balance?`)) return

      try {
        for (const invoice of dueTargets) {
          await logInvoiceEdit(invoice)
          await recordInvoicePayment({
            invoiceId: invoice.id,
            amount: (invoice.total_amount || 0) - (invoice.paid_amount || 0),
            invoiceTotal: invoice.total_amount || 0,
            invoicePaid: invoice.paid_amount || 0,
            method: 'Cash',
            notes: 'Bulk mark paid',
          })
        }
        setSelectedInvoices([])
        loadInvoices()
      } catch (error) {
        console.error('Error updating invoices:', error)
        alert(`Failed to record payment on one of the selected invoices: ${getFriendlySupabaseErrorMessage(error)}`)
        loadInvoices()
      }
      return
    }

    // 'Pending': recompute each status from its amounts instead of blindly
    // overwriting — fixes drifted statuses without corrupting paid invoices.
    try {
      for (const invoice of targets) {
        const paid = invoice.paid_amount || 0
        const total = invoice.total_amount || 0
        const correctStatus = paid >= total && total > 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending'
        if (correctStatus === invoice.status) continue
        await logInvoiceEdit(invoice)
        const { error } = await supabase
          .from('invoices')
          .update({ status: correctStatus })
          .eq('id', invoice.id)
        if (error) throw error
      }

      setSelectedInvoices([])
      loadInvoices()
    } catch (error) {
      console.error('Error updating invoices:', error)
      alert('Failed to update selected invoices')
    }
  }

  function exportInvoices() {
    const rows = filteredInvoices.map((invoice) => ({
      invoice_number: invoice.invoice_number || '',
      patient: `${invoice.patients?.first_name || ''} ${invoice.patients?.last_name || ''}`.trim(),
      type: invoice.invoice_type,
      status: invoice.status,
      total: invoice.total_amount,
      paid: invoice.paid_amount,
      due_date: invoice.due_date || '',
    }))

    const csv = [
      Object.keys(rows[0] || { invoice_number: '', patient: '', type: '', status: '', total: '', paid: '', due_date: '' }).join(','),
      ...rows.map((row) => Object.values(row).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `invoices-${new Date().toISOString().slice(0, 10)}.csv`)
    link.click()
    URL.revokeObjectURL(url)
  }

  async function ensureDoctorProfile() {
    if (doctorProfile) return doctorProfile
    try {
      const profile = await loadDoctorProfile()
      if (profile) setDoctorProfile(profile)
      return profile
    } catch (error) {
      console.error('Error loading doctor profile for print:', error)
      return null
    }
  }

  async function startListPrint() {
    await ensureDoctorProfile()
    setShowListPrint(true)
  }

  async function startPrint(invoice: Invoice, mode: 'single' | 'all' | 'due') {
    await ensureDoctorProfile()

    const patient = invoice.patients || {
      first_name: 'Unknown',
      last_name: 'Patient',
      email: null,
      phone: null,
      patient_code: null,
    }
    const jobInvoices =
      mode === 'single'
        ? [invoice]
        : invoices
            .filter((inv) => inv.patient_id === invoice.patient_id && inv.status !== 'Merged')
            .slice()
            .reverse()
    setPrintJob({ invoices: jobInvoices, patient, initialDueOnly: mode === 'due' })
  }

  async function printAfterPayment(invoiceId: string) {
    await ensureDoctorProfile()
    const { data } = await supabase
      .from('invoices')
      .select('*, patients (first_name, last_name, email, phone, patient_code)')
      .eq('id', invoiceId)
      .maybeSingle()
    if (!data) return
    const invoice = data as Invoice
    const patient = invoice.patients || {
      first_name: 'Unknown',
      last_name: 'Patient',
      email: null,
      phone: null,
      patient_code: null,
    }
    setPrintJob({ invoices: [invoice], patient })
  }

  async function shareInvoice(invoice: Invoice, channel: 'email' | 'whatsapp') {
    const patient = invoice.patients
    const email = patient?.email
    const waNumber = patient?.phone ? toWhatsAppNumber(patient.phone) : null

    if (channel === 'email' && !email) {
      alert('Patient email is not available')
      return
    }
    if (channel === 'whatsapp' && !waNumber) {
      alert('Patient phone number is not available')
      return
    }

    const { buildInvoicePdf, invoicePdfFileName } = await import('@/lib/invoicePdf')
    const doctor = await ensureDoctorProfile()
    const logoSrc = await resolveLogoSrc(doctor, '/logo.png')
    const patientInfo = patient || { first_name: 'Unknown', last_name: 'Patient', patient_code: null, phone: null }
    const doc = buildInvoicePdf([invoice], patientInfo, doctor, { logoSrc })
    const fileName = invoicePdfFileName([invoice], patientInfo)
    const subject = `Invoice ${invoice.invoice_number || invoice.id}`
    const text = `Dear ${patientInfo.first_name || 'Patient'},\n\nPlease find attached your invoice. Total: ${formatBDT(invoice.total_amount)}.`

    await sharePdf(doc, fileName, { channel, email, waNumber, subject, text })
  }

  const billedPatients = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; phone: string | null; patient_code: string | null }>()
    for (const invoice of invoices) {
      if (!invoice.patients || seen.has(invoice.patient_id)) continue
      seen.set(invoice.patient_id, {
        id: invoice.patient_id,
        name: `${invoice.patients.first_name} ${invoice.patients.last_name}`.trim(),
        phone: invoice.patients.phone,
        patient_code: invoice.patients.patient_code,
      })
    }
    return Array.from(seen.values())
  }, [invoices])

  const recentPatients = useMemo(() => billedPatients.slice(0, 8), [billedPatients])

  const patientSuggestions = useMemo(() => {
    const query = patientSearch.trim()
    if (!query) return []
    return allPatients
      .filter((patient) => matchesPatientSearch({ name: patient.name, code: patient.patient_code, phone: patient.phone }, query))
      .slice(0, 8)
  }, [allPatients, patientSearch])

  const filteredInvoices = useMemo(() => {
    let result = invoices
    if (patientFilter) result = result.filter((invoice) => invoice.patient_id === patientFilter.id)
    const searchQuery = patientSearch.trim()
    if (!patientFilter && searchQuery) {
      const lowerQuery = searchQuery.toLowerCase()
      result = result.filter((invoice) => {
        if ((invoice.invoice_number || '').toLowerCase().includes(lowerQuery)) return true
        if (!invoice.patients) return false
        return matchesPatientSearch(
          {
            name: `${invoice.patients.first_name} ${invoice.patients.last_name}`.trim(),
            code: invoice.patients.patient_code,
            phone: invoice.patients.phone,
          },
          searchQuery
        )
      })
    }
    if (filter === 'Due') {
      result = result.filter((invoice) => invoice.status !== 'Merged' && (invoice.total_amount || 0) - (invoice.paid_amount || 0) > 0)
    } else if (filter !== 'all') {
      result = result.filter((invoice) => invoice.status === filter)
    }
    return result
  }, [filter, invoices, patientFilter, patientSearch])

  const groupedInvoices = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, Invoice[]>()
    for (const invoice of filteredInvoices) {
      if (!map.has(invoice.patient_id)) {
        map.set(invoice.patient_id, [])
        order.push(invoice.patient_id)
      }
      map.get(invoice.patient_id)!.push(invoice)
    }
    return order.map((patientId) => ({ patientId, invoices: map.get(patientId)! }))
  }, [filteredInvoices])

  // 'Merged' invoices are retired source rows kept only for audit trail (see
  // handleMergeSelectedInvoices in PatientProfile.tsx) — their amounts already
  // live on the invoice that absorbed them, so they must be excluded from every
  // money total or merges double-count. Same activeInvoices filter PatientProfile uses.
  const activeInvoices = invoices.filter((invoice) => invoice.status !== 'Merged')
  const stats = {
    total: activeInvoices.reduce((sum, invoice) => sum + (invoice.total_amount || 0), 0),
    paid: activeInvoices.filter((invoice) => invoice.status === 'Paid').reduce((sum, invoice) => sum + (invoice.paid_amount || 0), 0),
    pending: activeInvoices
      .filter((invoice) => (invoice.total_amount || 0) > (invoice.paid_amount || 0))
      .reduce((sum, invoice) => sum + ((invoice.total_amount || 0) - (invoice.paid_amount || 0)), 0),
  }

  const allVisibleSelected = filteredInvoices.length > 0 && filteredInvoices.every((invoice) => selectedInvoices.includes(invoice.id))

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Billing</h1>
          <p className="text-text-secondary mt-1">Invoices, payments, templates, and reports</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setShowBasicModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
          {pendingPatients.length > 0 && (
            <div className="relative">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPendingPatients((v) => !v)
                }}
                className="border-amber-300 text-amber-900 hover:bg-amber-50"
              >
                <Clock className="w-4 h-4 mr-1" />
                Unbilled Treatments ({pendingPatients.length})
              </Button>
              {showPendingPatients && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-amber-200 rounded-lg shadow-lg z-20 min-w-64 p-3">
                  <div className="flex flex-wrap gap-2">
                    {pendingPatients.map(({ patient_id, name, count }) => (
                      <button
                        key={patient_id}
                        type="button"
                        onClick={() => {
                          setPreselectedPatientId(patient_id)
                          setShowBasicModal(true)
                          setShowPendingPatients(false)
                        }}
                        className="px-2.5 py-1 bg-amber-50 border border-amber-300 rounded-full text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                      >
                        {name} ({count})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setShowMoreMenu((v) => !v)
              }}
              aria-label="More actions"
            >
              <MoreVertical className="w-4 h-4 mr-1" />
              More
              <ChevronDown className="w-4 h-4 ml-1" />
            </Button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-44">
                <button
                  className="w-full flex items-center text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setShowTemplateSelector(true)
                    setShowMoreMenu(false)
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  From Template
                </button>
                <button
                  className="w-full flex items-center text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setShowReports((prev) => !prev)
                    setShowMoreMenu(false)
                  }}
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Reports
                </button>
                <button
                  className="w-full flex items-center text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setShowSettings(true)
                    setShowMoreMenu(false)
                  }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </button>
                <div className="border-t border-gray-100" />
                <button
                  className="w-full flex items-center text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    exportInvoices()
                    setShowMoreMenu(false)
                  }}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export CSV
                </button>
                <button
                  className="w-full flex items-center text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    startListPrint()
                    setShowMoreMenu(false)
                  }}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print List
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showReports && <FinancialReportsPanel />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard title="Total Billed" value={formatBDT(stats.total)} icon={<DollarSign className="w-6 h-6" />} color="blue" />
        <SummaryCard title="Paid" value={formatBDT(stats.paid)} icon={<CheckCircle className="w-6 h-6" />} color="green" />
        <SummaryCard title="Pending" value={formatBDT(stats.pending)} icon={<Clock className="w-6 h-6" />} color="orange" />
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={patientSearch}
                placeholder="Search patient by name, phone, or ID..."
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-72 max-w-full focus:outline-none focus:ring-2 focus:ring-primary/30"
                onChange={(e) => {
                  setPatientSearch(e.target.value)
                  setShowPatientSuggestions(true)
                }}
                onFocus={() => setShowPatientSuggestions(true)}
              />
              {showPatientSuggestions && patientSearch.trim() !== '' && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-72 max-h-64 overflow-y-auto">
                  {patientSuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-text-secondary">No matching patients</div>
                  ) : (
                    patientSuggestions.map((patient) => (
                      <button
                        key={patient.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        onClick={() => {
                          setPatientFilter({ id: patient.id, name: patient.name })
                          setPatientSearch('')
                          setShowPatientSuggestions(false)
                        }}
                      >
                        <div className="text-sm font-medium text-text-primary">{patient.name}</div>
                        <div className="text-xs text-text-secondary">
                          {[patient.patient_code, patient.phone].filter(Boolean).join(' • ') || 'No code / phone'}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {patientFilter && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                {patientFilter.name}
                <button onClick={() => setPatientFilter(null)} aria-label="Clear patient filter" className="hover:opacity-70">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
          {recentPatients.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                <History className="w-3.5 h-3.5" /> Recent:
              </span>
              {recentPatients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => setPatientFilter({ id: patient.id, name: patient.name })}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    patientFilter?.id === patient.id
                      ? 'bg-primary text-white border-primary'
                      : 'bg-gray-100 text-text-primary border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {patient.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex gap-2">
            {['all', 'Due', 'Pending', 'Partial', 'Paid'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === status ? 'bg-primary text-white' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                }`}
              >
                {status === 'all' ? 'All' : status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) => {
                  setSelectedInvoices(e.target.checked ? filteredInvoices.map((invoice) => invoice.id) : [])
                }}
              />
              Select all
            </label>
            <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus('Pending')} disabled={selectedInvoices.length === 0}>Mark Pending</Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus('Paid')} disabled={selectedInvoices.length === 0}>Mark Paid</Button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <span className="spinner" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            {patientFilter
              ? `No ${filter === 'all' ? '' : `${filter.toLowerCase()} `}invoices for ${patientFilter.name}.`
              : patientSearch.trim()
                ? `No invoices match "${patientSearch.trim()}".`
                : filter === 'all' ? 'No invoices yet. Click "New Invoice" to get started.' : `No ${filter.toLowerCase()} invoices.`}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {groupedInvoices.map((group) => {
              const firstInvoice = group.invoices[0]
              const isExpanded = expandedPatients.has(group.patientId) || groupedInvoices.length === 1
              // Money figures must ignore retired 'Merged' rows — see activeInvoices above.
              const activeGroupInvoices = group.invoices.filter((inv) => inv.status !== 'Merged')
              const groupDueCount = activeGroupInvoices.filter(
                (inv) => (inv.total_amount || 0) > (inv.paid_amount || 0)
              ).length
              const groupTotal = activeGroupInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
              const groupDue = activeGroupInvoices.reduce(
                (sum, inv) => sum + Math.max((inv.total_amount || 0) - (inv.paid_amount || 0), 0),
                0
              )
              const togglePatient = () => {
                setExpandedPatients((prev) => {
                  const next = new Set(prev)
                  if (next.has(group.patientId)) next.delete(group.patientId)
                  else next.add(group.patientId)
                  return next
                })
              }

              const patientName = firstInvoice.patients
                ? `${firstInvoice.patients.first_name} ${firstInvoice.patients.last_name}`
                : 'Unknown Patient'
              const accent = getPatientAccent(group.patientId)

              return (
                <div key={group.patientId} className="relative">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent.bar}`} />
                  <div
                    className="pl-5 pr-4 py-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between cursor-pointer select-none hover:bg-gray-50/80 transition-colors"
                    onClick={togglePatient}
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ring-4 ${accent.avatar} ${accent.ring}`}>
                        {getPatientInitials(patientName)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{patientName}</p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {group.invoices.length} invoice{group.invoices.length !== 1 ? 's' : ''}
                          {firstInvoice.patients?.patient_code && ` • ${firstInvoice.patients.patient_code}`}
                          {` • Billed ${formatBDT(groupTotal)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap sm:pl-0 pl-12" onClick={(e) => e.stopPropagation()}>
                      <span
                        className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                          groupDue > 0 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {groupDue > 0 ? `Due ${formatBDT(groupDue)}` : 'Paid up'}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => startPrint(firstInvoice, 'all')}>
                        Print all ({activeGroupInvoices.length})
                      </Button>
                      {groupDueCount > 0 && (
                        <Button size="sm" variant="outline" onClick={() => startPrint(firstInvoice, 'due')}>
                          Print due ({groupDueCount})
                        </Button>
                      )}
                      {groupDueCount > 1 && (
                        <Button
                          size="sm"
                          onClick={() => setPayPicker({
                            patientId: group.patientId,
                            invoices: group.invoices.filter(
                              (inv) => inv.status !== 'Merged' && (inv.total_amount || 0) - (inv.paid_amount || 0) > 0
                            ),
                          })}
                        >
                          Pay all ({groupDueCount})
                        </Button>
                      )}
                      <button
                        className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                        aria-label={isExpanded ? 'Collapse invoices' : 'Expand invoices'}
                        onClick={togglePatient}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="bg-gray-50/60 border-t border-gray-200 pl-5 pr-3 py-3 space-y-2.5">
                      {group.invoices.map((invoice) => (
                        <InvoiceRow
                          key={invoice.id}
                          invoice={invoice}
                          hideName
                          accent={accent}
                          checked={selectedInvoices.includes(invoice.id)}
                          onSelect={(checked) => {
                            setSelectedInvoices((prev) => {
                              if (checked) return [...new Set([...prev, invoice.id])]
                              return prev.filter((id) => id !== invoice.id)
                            })
                          }}
                          onDelete={() => deleteInvoice(invoice.id)}
                          onEdit={() => setEditingInvoiceRecord(invoice)}
                          onPaymentRecorded={loadInvoices}
                          onPaymentPrintChain={() => printAfterPayment(invoice.id)}
                          onPrint={(mode) => startPrint(invoice, mode)}
                          onShare={(mode) => shareInvoice(invoice, mode)}
                          patientInvoiceCount={invoices.filter((inv) => inv.patient_id === invoice.patient_id).length}
                          patientDueCount={invoices.filter((inv) => inv.patient_id === invoice.patient_id && (inv.total_amount || 0) > (inv.paid_amount || 0)).length}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showTemplateSelector && (
        <InvoiceTemplateSelector
          invoiceType="basic"
          onClose={() => setShowTemplateSelector(false)}
          onSelectTemplate={(template) => {
            setSelectedTemplate(template)
            setShowTemplateSelector(false)
            setShowBasicModal(true)
          }}
        />
      )}

      {showBasicModal && (
        <InvoiceModal
          invoiceType="basic"
          template={selectedTemplate}
          defaultPatientId={preselectedPatientId}
          onClose={() => {
            setShowBasicModal(false)
            setSelectedTemplate(null)
            setPreselectedPatientId('')
          }}
          onSave={() => {
            loadInvoices()
            loadPendingPatients()
            setShowBasicModal(false)
            setSelectedTemplate(null)
            setPreselectedPatientId('')
          }}
        />
      )}

      {editingInvoiceRecord && (
        <InvoiceModal
          defaultPatientId={editingInvoiceRecord.patient_id}
          hidePatientSelect
          defaultPatientName={
            editingInvoiceRecord.patients
              ? `${editingInvoiceRecord.patients.first_name} ${editingInvoiceRecord.patients.last_name}`.trim()
              : null
          }
          editingInvoice={editingInvoiceRecord}
          onClose={() => setEditingInvoiceRecord(null)}
          onSave={async (invoiceId) => {
            setEditingInvoiceRecord(null)
            loadInvoices()
            loadPendingPatients()
            if (invoiceId && confirm('Invoice updated. Print or share it now?')) {
              await printAfterPayment(invoiceId)
            }
          }}
        />
      )}

      {showSettings && <InvoiceSettingsModal onClose={() => setShowSettings(false)} />}

      {payPicker && (
        <PayInvoicePickerModal
          patientId={payPicker.patientId}
          invoices={payPicker.invoices}
          onClose={() => setPayPicker(null)}
          onChanged={() => {
            loadInvoices()
            loadPendingPatients()
          }}
        />
      )}

      {printJob && (
        <InvoicePrint
          invoices={printJob.invoices}
          patient={printJob.patient}
          doctor={doctorProfile}
          initialDueOnly={printJob.initialDueOnly}
          onClose={() => setPrintJob(null)}
        />
      )}

      {showListPrint && (
        <InvoiceListPrint
          invoices={filteredInvoices}
          doctor={doctorProfile}
          label={
            patientFilter
              ? `${filter === 'all' ? 'All' : filter} invoices for ${patientFilter.name}`
              : filter === 'all'
              ? 'All invoices'
              : `${filter} invoices`
          }
          onClose={() => setShowListPrint(false)}
        />
      )}
    </div>
  )
}

function SummaryCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: 'blue' | 'green' | 'orange' }) {
  const colorMap: Record<'blue' | 'green' | 'orange', string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  }

  return (
    <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-lg ${colorMap[color]} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function InvoiceRow({
  invoice,
  hideName,
  accent,
  checked,
  onSelect,
  onDelete,
  onEdit,
  onPaymentRecorded,
  onPaymentPrintChain,
  onPrint,
  onShare,
  patientInvoiceCount,
  patientDueCount,
}: {
  invoice: Invoice
  hideName?: boolean
  accent?: { bar: string; avatar: string; ring: string; chip: string }
  checked: boolean
  onSelect: (checked: boolean) => void
  onDelete: () => void
  onEdit: () => void
  onPaymentRecorded: () => void
  onPaymentPrintChain: () => void
  onPrint: (mode: 'single' | 'all' | 'due') => void
  onShare: (channel: 'email' | 'whatsapp') => void
  patientInvoiceCount: number
  patientDueCount: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showPrintMenu, setShowPrintMenu] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)

  useEffect(() => {
    if (!showPrintMenu) return
    const handler = () => setShowPrintMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showPrintMenu])

  useEffect(() => {
    if (!showShareMenu) return
    const handler = () => setShowShareMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showShareMenu])

  const items = Array.isArray(invoice.items) ? invoice.items : []
  const subtotal = getInvoiceItemSubtotal(items)
  const remainingBalance = Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)
  const itemPreview = buildInvoiceItemPreview(items)

  const statusColors: Record<string, string> = {
    Pending: 'pill-warning',
    Partial: 'pill-warning',
    Paid: 'pill-success',
    Overdue: 'pill-error',
  }

  const overdueDays = invoice.due_date && invoice.status !== 'Paid'
    ? Math.max(Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)), 0)
    : 0
  const lateInterest = overdueDays > 0 ? (remainingBalance * 0.01 * Math.ceil(overdueDays / 30)) : 0
  const chipClass = accent?.chip || 'bg-gray-50 text-text-secondary border-gray-200'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-4 cursor-pointer select-none" onClick={() => setExpanded((prev) => !prev)}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onSelect(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${chipClass}`}>
                  {hideName
                    ? `#${invoice.invoice_number || invoice.id.slice(0, 8).toUpperCase()}`
                    : `${invoice.patients?.first_name} ${invoice.patients?.last_name}`}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[invoice.status] || 'bg-gray-100'}`}>
                  {invoice.status}
                </span>
              </div>
              <p className="text-sm text-text-secondary mt-1.5">
                {safeFormat(invoice.created_at, 'MMM d, yyyy')}
                {invoice.due_date && ` • Due: ${safeFormat(invoice.due_date, 'MMM d, yyyy')}`}
                {items.length > 0 && ` • ${items.length} item${items.length !== 1 ? 's' : ''}`}
                {invoice.recurring_enabled && ` • Recurring (${invoice.recurring_frequency || 'monthly'})`}
              </p>
              {itemPreview && (
                <p className="text-sm text-text-secondary mt-1 truncate">{itemPreview}</p>
              )}
              <p className="text-xl font-bold text-primary mt-1.5">{formatBDT(invoice.total_amount)}</p>
              {overdueDays > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  Overdue by {overdueDays} day(s) • Est. late interest: {formatBDT(lateInterest)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap sm:shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" onClick={() => setShowPaymentModal(true)} disabled={remainingBalance <= 0}>
              <span className="hidden sm:inline">Record </span>Payment
            </Button>
            {invoice.status !== 'Merged' && (
              <Button variant="outline" size="sm" onClick={onEdit} title="Add or remove items on this invoice">
                Edit
              </Button>
            )}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPrintMenu((v) => !v)
                }}
                aria-label="Print invoice"
              >
                <Printer className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Print</span>
              </Button>
              {showPrintMenu && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-52 max-w-[calc(100vw-2rem)]">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      onPrint('single')
                      setShowPrintMenu(false)
                    }}
                  >
                    This invoice
                  </button>
                  {invoice.patients && patientInvoiceCount > 1 && (
                    <button
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                      onClick={() => {
                        onPrint('all')
                        setShowPrintMenu(false)
                      }}
                    >
                      All invoices for patient ({patientInvoiceCount})
                    </button>
                  )}
                  {invoice.patients && patientInvoiceCount > 1 && patientDueCount > 0 && (
                    <button
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                      onClick={() => {
                        onPrint('due')
                        setShowPrintMenu(false)
                      }}
                    >
                      Due invoices for patient ({patientDueCount})
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                aria-label="Email or WhatsApp invoice"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowShareMenu((v) => !v)
                }}
              >
                <Mail className="w-4 h-4" /><MessageCircle className="w-4 h-4 -ml-1 text-green-600" />
                <span className="hidden sm:inline ml-1">Share</span>
              </Button>
              {showShareMenu && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-44 max-w-[calc(100vw-2rem)]">
                  <button
                    className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      onShare('email')
                      setShowShareMenu(false)
                    }}
                  >
                    <Mail className="w-4 h-4" /> Email
                  </button>
                  <button
                    className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      onShare('whatsapp')
                      setShowShareMenu(false)
                    }}
                  >
                    <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
                  </button>
                </div>
              )}
            </div>
            {canDelete() && (
              <Button variant="outline" size="sm" onClick={onDelete}>Delete</Button>
            )}
            <button className="p-1 text-text-secondary hover:text-text-primary transition-colors" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {items.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Line Items</p>
              {items.map((item, idx) => (
                <div key={`${invoice.id}-${idx}`} className="flex justify-between items-center text-sm">
                  <div className="min-w-0 pr-3">
                    <span className="text-text-primary">{formatInvoiceItemLabel(item)}</span>
                    {getInvoiceItemLineTotal(item) > 0 && (
                      <p className="text-xs text-text-secondary">
                        {formatBDT(getInvoiceItemLineTotal(item) / Math.max(Number(item.quantity) || 1, 1))} each
                      </p>
                    )}
                  </div>
                  <span className="font-medium text-primary">{formatBDT(getInvoiceItemLineTotal(item))}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-200 space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Subtotal</span>
                  <span>{formatBDT(subtotal)}</span>
                </div>
                {(invoice.discount_amount || 0) > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-secondary">Discount</span>
                    <span className="text-green-600">-{formatBDT(invoice.discount_amount || 0)}</span>
                  </div>
                )}
                {(invoice.tax_amount || 0) > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-secondary">Tax ({invoice.tax_rate || 0}%)</span>
                    <span>{formatBDT(invoice.tax_amount || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center font-semibold pt-1 border-t border-gray-200">
                  <span>Total</span>
                  <span className="font-bold text-primary">{formatBDT(invoice.total_amount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Paid</span>
                  <span>{formatBDT(invoice.paid_amount || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Remaining</span>
                  <span className="font-medium">{formatBDT(remainingBalance)}</span>
                </div>
                {!!invoice.notes && <p className="text-xs text-text-secondary pt-2">Notes: {invoice.notes}</p>}
                {!!invoice.payment_terms && <p className="text-xs text-text-secondary">Terms: {invoice.payment_terms}</p>}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Payment History</p>
            <PaymentHistoryPanel invoiceId={invoice.id} invoice={invoice} patient={invoice.patients ?? undefined} patientId={invoice.patient_id} onChanged={onPaymentRecorded} />
          </div>

          <InvoiceTimelinePanel invoiceId={invoice.id} />
        </div>
      )}

      {showPaymentModal && (
        <PaymentEntryModal
          invoiceId={invoice.id}
          invoiceTotal={invoice.total_amount}
          invoicePaid={invoice.paid_amount}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => {
            setShowPaymentModal(false)
            onPaymentRecorded()
            if (confirm('Payment recorded. Print the updated invoice?')) {
              onPaymentPrintChain()
            }
          }}
        />
      )}
    </div>
  )
}
