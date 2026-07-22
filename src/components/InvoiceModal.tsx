import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckSquare, ChevronDown, ChevronUp, Plus, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  buildLegacySafeInvoicePayload,
  buildTreatmentInvoiceItems,
  createInvoiceItem,
  extractTreatmentIdsFromInvoiceItems,
  getFriendlySupabaseErrorMessage,
  getInvoiceItemLineTotal,
  getInvoiceItemSubtotal,
  getTreatmentPlanDiscountTotal,
  isSchemaCompatibilityError,
  logBillingError,
  normalizeInvoiceItems,
  QUICK_TREATMENT_OPTIONS,
  type BillingLineItem,
} from '@/lib/billing'
import { supabase } from '@/lib/supabase'
import { recordInvoicePayment } from '@/lib/payments'
import { formatBDT } from '@/lib/utils'
import { logActivity } from '@/lib/activityLog'
import { logEdit } from '@/lib/editHistory'
import type { InvoiceTemplateData } from '@/components/InvoiceTemplateSelector'
import { PaymentThanksPrompt } from '@/components/PaymentThanksPrompt'

export interface EditableInvoice {
  id: string
  items: BillingLineItem[] | null
  total_amount: number
  paid_amount: number
  discount_amount?: number | null
  discount_type?: string | null
  discount_value?: number | null
  tax_rate?: number | null
  credit_amount?: number | null
  notes?: string | null
  payment_terms?: string | null
  invoice_number?: string | null
  due_date?: string | null
  recurring_enabled?: boolean | null
  recurring_frequency?: string | null
}

interface InvoiceModalProps {
  onClose: () => void
  onSave: (invoiceId?: string) => void
  defaultPatientId?: string
  hidePatientSelect?: boolean
  /** Fallback patient name for audit logging when hidePatientSelect skips
   *  fetching the full patient list (so `patients.find` below can't resolve
   *  one) — pass the already-known patient's name so edit/delete log entries
   *  and the admin notification bell can still identify the patient. */
  defaultPatientName?: string | null
  invoiceType?: 'basic' | 'advanced'
  template?: InvoiceTemplateData | null
  /** Preselect only this treatment plan's items (falls back to all pending if the group is empty) */
  preferredPlanGroupId?: string | null
  /** Edit an existing invoice instead of creating a new one — add/remove line
   *  items and treatments on it directly ("re-write" an invoice after a
   *  mistaken treatment deletion, rather than only being able to create a new one). */
  editingInvoice?: EditableInvoice | null
}

interface PatientRow {
  id: string
  first_name: string
  last_name: string
  patient_code: string | null
  phone?: string | null
}

interface PendingTreatment {
  id: string
  treatment_type: string
  description: string | null
  tooth_number: number | null
  status: string
  cost: number
  original_cost?: number | null
  is_invoiced?: boolean
  invoice_id?: string | null
  treatment_plan_group_id?: string | null
}

const PAYMENT_METHODS = ['Cash', 'Card', 'Cheque', 'Transfer'] as const

export function InvoiceModal({
  onClose,
  onSave,
  defaultPatientId = '',
  hidePatientSelect = false,
  defaultPatientName = null,
  invoiceType = 'basic',
  template = null,
  preferredPlanGroupId = null,
  editingInvoice = null,
}: InvoiceModalProps) {
  const isEditMode = !!editingInvoice
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [thanksPrompt, setThanksPrompt] = useState<{ firstName: string; phone: string | null; amount: number; invoiceId: string } | null>(null)
  const [formData, setFormData] = useState({
    patient_id: defaultPatientId,
    due_date: editingInvoice?.due_date || '',
    status: 'Pending',
    notes: editingInvoice?.notes || '',
    payment_terms: editingInvoice?.payment_terms || template?.payment_terms || '',
    tax_rate: String(editingInvoice?.tax_rate ?? template?.tax_rate ?? 0),
    recurring_enabled: editingInvoice?.recurring_enabled || false,
    recurring_frequency: editingInvoice?.recurring_frequency || 'monthly',
    discount_type: (editingInvoice?.discount_type as 'fixed' | 'percentage') || 'fixed',
    credit_amount: editingInvoice?.credit_amount ? String(editingInvoice.credit_amount) : '',
    invoice_number: editingInvoice?.invoice_number || '',
    installment_count: '1',
  })
  const [items, setItems] = useState<BillingLineItem[]>(
    editingInvoice?.items?.length
      ? editingInvoice.items.map((item) => ({
          description: item.description,
          quantity: String(item.quantity || 1),
          unit_price: String(item.unit_price ?? item.amount ?? ''),
          amount: String(item.line_total ?? item.amount ?? ''),
          source_treatment_id: item.source_treatment_id,
          source_treatment_ids: item.source_treatment_ids,
        }))
      : template?.items?.length
        ? template.items.map((item) => ({
            description: item.description,
            quantity: String(item.quantity || 1),
            unit_price: String(item.unit_price ?? item.amount ?? ''),
            amount: String(item.line_total ?? item.amount ?? ''),
          }))
        : [createInvoiceItem()]
  )
  const [discountValue, setDiscountValue] = useState(
    editingInvoice
      ? String((editingInvoice.discount_type === 'percentage' ? editingInvoice.discount_value : editingInvoice.discount_amount) || '')
      : String(template?.discount_amount || '')
  )
  // Tracks the last discount value we auto-filled from imported treatments' baked-in
  // plan discount, so re-syncing on tick/untick never clobbers a value the user typed themselves.
  const [autoAppliedDiscount, setAutoAppliedDiscount] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)

  // Pending treatments
  const [pendingTreatments, setPendingTreatments] = useState<PendingTreatment[]>([])
  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<Set<string>>(new Set())
  // True while items mirror the ticked treatments; cleared once the user edits items manually
  const [autoImported, setAutoImported] = useState(false)

  // Collect payment now
  const [collectPayment, setCollectPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('Cash')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    setFormData((prev) => ({ ...prev, patient_id: defaultPatientId || prev.patient_id }))

    if (!hidePatientSelect) {
      loadPatients()
    }
  }, [defaultPatientId, hidePatientSelect])

  // Auto invoice number from invoice_settings — legacy/missing settings leave the field blank as before
  const autoNumberRef = useRef<{ prefix: string; next: number } | null>(null)
  useEffect(() => {
    if (isEditMode) return // editing keeps the invoice's existing number; never auto-assigned
    supabase
      .from('invoice_settings')
      .select('invoice_prefix, next_invoice_number')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        const next = Number(data?.next_invoice_number)
        if (error || !data || !Number.isFinite(next) || next <= 0) return
        autoNumberRef.current = { prefix: data.invoice_prefix || 'INV', next }
        setFormData((prev) => prev.invoice_number
          ? prev // never clobber a template/user-provided number
          : { ...prev, invoice_number: `${autoNumberRef.current!.prefix}-${next}` })
      }, () => {})
  }, [])

  // Load uninvoiced treatments whenever patient changes, pre-select all and import as line items.
  // Edit mode never auto-selects/auto-imports — the form's items already come from the existing
  // invoice; the pending-treatments list here is purely an "add more" affordance.
  useEffect(() => {
    const pid = formData.patient_id
    if (pid) {
      loadPendingTreatments(pid).then((loaded) => {
        if (isEditMode) {
          setSelectedTreatmentIds(new Set())
          return
        }
        const preferred = preferredPlanGroupId
          ? loaded.filter((t) => t.treatment_plan_group_id === preferredPlanGroupId)
          : []
        const initial = preferred.length > 0 ? preferred : loaded
        setSelectedTreatmentIds(new Set(initial.map((t) => t.id)))
        if (template) return
        setItems((prev) => {
          const blank = !prev.some((item) => item.description.trim() || item.unit_price || item.amount)
          if (!blank && !autoImported) return prev
          if (initial.length > 0) {
            setAutoImported(true)
            applyPlanDiscount(initial)
            return buildTreatmentInvoiceItems(initial, { useOriginalCost: true })
          }
          setAutoImported(false)
          return blank ? prev : [createInvoiceItem()]
        })
      })
    } else {
      setPendingTreatments([])
      setSelectedTreatmentIds(new Set())
    }
  }, [formData.patient_id])

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, patient_code, phone')
      .neq('patient_type', 'consultation')
      .order('last_name')
    setPatients((data as PatientRow[]) || [])
  }

  async function loadPendingTreatments(patientId: string): Promise<PendingTreatment[]> {
    try {
      const [{ data, error }, { data: invoicesData, error: invoicesError }] = await Promise.all([
        supabase
          .from('treatments')
          .select('id, treatment_type, description, tooth_number, status, cost, original_cost, is_invoiced, invoice_id, treatment_plan_group_id')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('items')
          .eq('patient_id', patientId)
          .neq('status', 'Merged'),
      ])
      if (error) throw error
      if (invoicesError) throw invoicesError

      // invoice_id (not is_invoiced) is normally the source of truth — the FK's ON DELETE
      // SET NULL keeps it accurate even if an invoice was deleted by an older app version
      // that left is_invoiced stuck true. But invoice_id can still go stale on its own (a
      // restored invoice doesn't always re-link every treatment it lists) — cross-check
      // against live invoices' items JSON too before offering something as billable again.
      const linkedTreatmentIds = extractTreatmentIdsFromInvoiceItems(
        (invoicesData || []).flatMap((invoice: { items?: unknown }) => (Array.isArray(invoice.items) ? invoice.items : []))
      )
      const safeTreatments = ((data as PendingTreatment[]) || []).filter(
        (treatment) => treatment.status !== 'Cancelled' && !treatment.invoice_id && !linkedTreatmentIds.has(treatment.id)
      )
      setPendingTreatments(safeTreatments)
      return safeTreatments
    } catch (error) {
      try {
        const [{ data: treatmentsData, error: treatmentsError }, { data: invoicesData, error: invoicesError }] = await Promise.all([
          supabase
            .from('treatments')
            .select('id, treatment_type, description, tooth_number, status, cost, treatment_plan_group_id')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false }),
          supabase
            .from('invoices')
            .select('items')
            .eq('patient_id', patientId)
            .neq('status', 'Merged'),
        ])

        if (treatmentsError) throw treatmentsError
        if (invoicesError) throw invoicesError

        const linkedTreatmentIds = extractTreatmentIdsFromInvoiceItems(
          (invoicesData || []).flatMap((invoice: { items?: unknown }) => (Array.isArray(invoice.items) ? invoice.items : []))
        )

        const fallbackTreatments = ((treatmentsData as PendingTreatment[]) || []).filter(
          (treatment) => treatment.status !== 'Cancelled' && !linkedTreatmentIds.has(treatment.id)
        )
        setPendingTreatments(fallbackTreatments)
        return fallbackTreatments
      } catch (fallbackError) {
        logBillingError('Failed to load pending treatments', fallbackError, { patientId, initialError: error })
        setPendingTreatments([])
        return []
      }
    }
  }

  /** Prefills the Discount field from imported treatments' baked-in plan discount, without
   *  clobbering a value the user has since typed in themselves. */
  function applyPlanDiscount(selected: PendingTreatment[]) {
    const discountTotal = getTreatmentPlanDiscountTotal(selected)
    const nextValue = discountTotal > 0 ? String(discountTotal) : ''
    const userOwnsField = discountValue !== '' && discountValue !== autoAppliedDiscount
    setAutoAppliedDiscount(nextValue)
    if (userOwnsField) return
    setDiscountValue(nextValue)
    if (discountTotal > 0 && formData.discount_type !== 'percentage') {
      setFormData((prev) => ({ ...prev, discount_type: 'fixed' }))
    }
  }

  /** While in auto-import mode, ticked treatments and invoice items stay in sync */
  function applyTreatmentSelection(next: Set<string>) {
    setSelectedTreatmentIds(next)
    if (autoImported) {
      const selected = pendingTreatments.filter((t) => next.has(t.id))
      setItems(selected.length > 0 ? buildTreatmentInvoiceItems(selected, { useOriginalCost: true }) : [createInvoiceItem()])
      applyPlanDiscount(selected)
    }
  }

  function toggleTreatment(id: string) {
    const next = new Set(selectedTreatmentIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    applyTreatmentSelection(next)
  }

  function selectAllTreatments() {
    applyTreatmentSelection(new Set(pendingTreatments.map((t) => t.id)))
  }

  function selectPlanGroup(groupId: string) {
    const groupIds = pendingTreatments.filter((t) => t.treatment_plan_group_id === groupId).map((t) => t.id)
    applyTreatmentSelection(new Set([...selectedTreatmentIds, ...groupIds]))
  }

  function clearTreatmentSelection() {
    applyTreatmentSelection(new Set())
  }

  function appendItems(nextItems: BillingLineItem[]) {
    if (nextItems.length === 0) return

    setItems((prev) => {
      const nonEmpty = prev.filter((item) => item.description.trim() || item.unit_price || item.amount)
      return nonEmpty.length > 0 ? [...nonEmpty, ...nextItems] : nextItems
    })
  }

  /** Convert selected pending treatments into invoice line items */
  function importTreatmentsAsItems(treatmentIds = Array.from(selectedTreatmentIds)) {
    const selected = pendingTreatments.filter((t) => treatmentIds.includes(t.id))
    if (selected.length === 0) return

    appendItems(buildTreatmentInvoiceItems(selected, { useOriginalCost: true }))
    setSelectedTreatmentIds(new Set(treatmentIds))
  }

  function addItem() {
    setAutoImported(false)
    setItems((prev) => [...prev, createInvoiceItem()])
  }

  function addQuickTreatment(description: string) {
    setAutoImported(false)
    appendItems([createInvoiceItem(description)])
  }

  function removeItem(index: number) {
    setAutoImported(false)
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof BillingLineItem, value: string) {
    setAutoImported(false)
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const subtotal = useMemo(() => getInvoiceItemSubtotal(items), [items])
  const discountValueNum = parseFloat(discountValue) || 0
  const discountCalcAmount = formData.discount_type === 'percentage'
    ? subtotal * (discountValueNum / 100)
    : discountValueNum
  const taxRate = parseFloat(formData.tax_rate) || 0
  const taxAmount = Math.max(subtotal - discountCalcAmount, 0) * (taxRate / 100)
  const creditAmount = parseFloat(formData.credit_amount) || 0
  const totalAmount = Math.max(subtotal - discountCalcAmount + taxAmount - creditAmount, 0)

  function handleCollectPaymentToggle(checked: boolean) {
    setCollectPayment(checked)
    if (checked) {
      setPaymentAmount(totalAmount > 0 ? String(totalAmount) : '')
    }
  }

  async function handleEditSubmit(normalizedItems: BillingLineItem[]) {
    if (!editingInvoice) return

    const paidAmount = editingInvoice.paid_amount || 0
    const status = paidAmount >= totalAmount && totalAmount > 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending'

    const invoicePatient = patients.find((p) => p.id === formData.patient_id)
    // Snapshot before the write (log-first, edit-second) so the pre-edit
    // version is always recoverable.
    await logEdit({
      entityType: 'invoice',
      entityId: editingInvoice.id,
      entityLabel: formData.invoice_number || null,
      patientId: formData.patient_id,
      patientName: invoicePatient ? `${invoicePatient.first_name} ${invoicePatient.last_name}` : defaultPatientName,
      previousPayload: editingInvoice,
      details: `Updated total ${formatBDT(totalAmount)}`,
    })

    const basePayload = buildLegacySafeInvoicePayload({
      patientId: formData.patient_id,
      items: normalizedItems,
      totalAmount,
      paidAmount,
      status,
      dueDate: formData.due_date,
    })

    const extendedPayload = {
      ...basePayload,
      notes: formData.notes || null,
      payment_terms: formData.payment_terms || null,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount_amount: discountCalcAmount,
      discount_type: formData.discount_type,
      discount_value: discountValueNum,
      credit_amount: creditAmount,
      invoice_number: formData.invoice_number || null,
    }

    let updateResult = await supabase.from('invoices').update(extendedPayload).eq('id', editingInvoice.id)
    if (updateResult.error && isSchemaCompatibilityError(updateResult.error)) {
      updateResult = await supabase.from('invoices').update(basePayload).eq('id', editingInvoice.id)
    }
    if (updateResult.error) throw updateResult.error

    // Reconcile treatment linkage: free any treatment removed from the items, link any newly added
    const originalLinkedIds = extractTreatmentIdsFromInvoiceItems(editingInvoice.items || [])
    const remainingLinkedIds = extractTreatmentIdsFromInvoiceItems(normalizedItems)
    const idsToUnlink = [...originalLinkedIds].filter((id) => !remainingLinkedIds.has(id))
    const idsToLink = Array.from(selectedTreatmentIds)

    if (idsToUnlink.length > 0) {
      await supabase.from('treatments').update({ is_invoiced: false, invoice_id: null }).in('id', idsToUnlink).then(() => {}, () => {})
    }
    if (idsToLink.length > 0) {
      await supabase.from('treatments').update({ is_invoiced: true, invoice_id: editingInvoice.id }).in('id', idsToLink).then(() => {}, () => {})
    }

    await supabase.from('invoice_history').insert({
      invoice_id: editingInvoice.id,
      event_type: 'invoice_edited',
      event_data: { added_treatment_ids: idsToLink, removed_treatment_ids: idsToUnlink },
    }).then(() => {}, () => {})

    onSave(editingInvoice.id)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const normalizedItems = normalizeInvoiceItems(items)
    if (!formData.patient_id) {
      alert('Please select a patient')
      return
    }
    if (normalizedItems.length === 0) {
      alert('Please add at least one valid item')
      return
    }

    if (isEditMode) {
      setSaving(true)
      try {
        await handleEditSubmit(normalizedItems)
      } catch (error) {
        logBillingError('Failed to update invoice', error, {
          invoiceId: editingInvoice?.id,
          itemCount: normalizedItems.length,
          totalAmount,
        })
        alert(`Failed to update invoice: ${getFriendlySupabaseErrorMessage(error)}`)
      } finally {
        setSaving(false)
      }
      return
    }

    const parsedPaymentAmount = parseFloat(paymentAmount) || 0
    if (collectPayment) {
      if (parsedPaymentAmount <= 0) {
        alert('Payment amount must be greater than 0')
        return
      }
      if (parsedPaymentAmount > totalAmount) {
        alert('Payment amount cannot be greater than the invoice total')
        return
      }
      if (!paymentDate) {
        alert('Please select a payment date')
        return
      }
    }

    setSaving(true)
    try {
      const basePayload = buildLegacySafeInvoicePayload({
        patientId: formData.patient_id,
        items: normalizedItems,
        totalAmount,
        paidAmount: 0,
        status: formData.status,
        dueDate: formData.due_date,
      })

      // Extended columns exist since migration 008 — fall back to the legacy-safe payload on older schemas
      const extendedPayload = {
        ...basePayload,
        notes: formData.notes || null,
        payment_terms: formData.payment_terms || null,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountCalcAmount,
        discount_type: formData.discount_type,
        discount_value: discountValueNum,
        credit_amount: creditAmount,
        invoice_number: formData.invoice_number || null,
        recurring_enabled: formData.recurring_enabled,
        recurring_frequency: formData.recurring_enabled ? formData.recurring_frequency : null,
      }

      const isUniqueViolation = (error: unknown) =>
        (error as { code?: string })?.code === '23505' ||
        /duplicate key|unique constraint/i.test(getFriendlySupabaseErrorMessage(error))

      let usedInvoiceNumber = formData.invoice_number || null
      const auto = autoNumberRef.current
      const autoValue = auto ? `${auto.prefix}-${auto.next}` : null

      let insertResult = await supabase
        .from('invoices')
        .insert([extendedPayload])
        .select('id')
        .single()

      // Only auto-generated numbers retry on a duplicate; user-typed ones surface the error
      if (insertResult.error && isUniqueViolation(insertResult.error) && auto && usedInvoiceNumber === autoValue) {
        usedInvoiceNumber = `${auto.prefix}-${auto.next + 1}`
        insertResult = await supabase
          .from('invoices')
          .insert([{ ...extendedPayload, invoice_number: usedInvoiceNumber }])
          .select('id')
          .single()

        if (insertResult.error && isUniqueViolation(insertResult.error)) {
          usedInvoiceNumber = null
          insertResult = await supabase
            .from('invoices')
            .insert([{ ...extendedPayload, invoice_number: null }])
            .select('id')
            .single()
        }
      }

      if (insertResult.error && isSchemaCompatibilityError(insertResult.error)) {
        usedInvoiceNumber = null
        insertResult = await supabase
          .from('invoices')
          .insert([basePayload])
          .select('id')
          .single()
      }

      const { data, error } = insertResult
      if (error) throw error

      // Advance the counter only when the auto number (or its +1 retry) was actually used
      if (auto && usedInvoiceNumber && (usedInvoiceNumber === autoValue || usedInvoiceNumber === `${auto.prefix}-${auto.next + 1}`)) {
        const usedN = Number(usedInvoiceNumber.slice(auto.prefix.length + 1))
        await supabase
          .from('invoice_settings')
          .update({ next_invoice_number: usedN + 1 })
          .eq('id', 1)
          .then(() => {}, () => {})
      }

      const invoicePatient = patients.find((p) => p.id === formData.patient_id)
      logActivity({
        action: 'create',
        entityType: 'invoice',
        entityId: data?.id ?? null,
        entityLabel: usedInvoiceNumber,
        patientId: formData.patient_id,
        patientName: invoicePatient ? `${invoicePatient.first_name} ${invoicePatient.last_name}` : null,
        details: `Total ${formatBDT(totalAmount)}`,
      })

      if (data?.id) {
        // invoice_history table is added by a later migration — ignore if missing
        await supabase.from('invoice_history').insert({
          invoice_id: data.id,
          event_type: 'invoice_created',
          event_data: {
            invoice_type: invoiceType,
            template_id: template?.id || null,
          },
        }).then(() => {}, () => {})

        // treatments.is_invoiced / invoice_id are added by a later migration — ignore if missing
        if (selectedTreatmentIds.size > 0) {
          await supabase
            .from('treatments')
            .update({ is_invoiced: true, invoice_id: data.id })
            .in('id', Array.from(selectedTreatmentIds))
            .then(() => {}, () => {})
        }

        // payment_plans table is added by a later migration — ignore if missing
        const installments = Math.max(parseInt(formData.installment_count, 10) || 1, 1)
        if (installments > 1 && formData.due_date) {
          const installmentAmount = Number((totalAmount / installments).toFixed(2))
          const planRows = Array.from({ length: installments }).map((_, index) => {
            const dueDate = new Date(formData.due_date)
            dueDate.setMonth(dueDate.getMonth() + index)
            return {
              invoice_id: data.id,
              installment_no: index + 1,
              due_date: dueDate.toISOString().slice(0, 10),
              amount: installmentAmount,
              status: 'Pending',
            }
          })

          await supabase.from('payment_plans').insert(planRows).then(() => {}, () => {})
        }

        if (collectPayment && parsedPaymentAmount > 0) {
          await recordImmediatePayment(data.id, parsedPaymentAmount)
          const paymentPatient = patients.find((p) => p.id === formData.patient_id)
          if (paymentPatient?.phone) {
            setThanksPrompt({
              firstName: paymentPatient.first_name,
              phone: paymentPatient.phone,
              amount: parsedPaymentAmount,
              invoiceId: data.id,
            })
            return
          }
        }
      }

      onSave(data?.id)
    } catch (error) {
      logBillingError('Failed to create invoice', error, {
        patientId: formData.patient_id,
        itemCount: normalizedItems.length,
        totalAmount,
      })
      const message = getFriendlySupabaseErrorMessage(error)
      alert(`Failed to create invoice: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  /** Same fallback chain as PaymentEntryModal so older payments schemas keep working */
  async function recordImmediatePayment(invoiceId: string, amount: number) {
    const paymentDateIso = new Date(`${paymentDate}T00:00:00`).toISOString()
    const result = await recordInvoicePayment({
      invoiceId,
      amount,
      invoiceTotal: totalAmount,
      invoicePaid: 0,
      method: paymentMethod,
      paymentDateIso,
    })

    if (result.paymentStored) {
      const paymentPatient = patients.find((p) => p.id === formData.patient_id)
      logActivity({
        action: 'create',
        entityType: 'payment',
        patientId: formData.patient_id,
        patientName: paymentPatient ? `${paymentPatient.first_name} ${paymentPatient.last_name}` : null,
        details: `${formatBDT(amount)} (${paymentMethod}) on new invoice`,
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="modal-content bg-white rounded-lg shadow-xl max-w-full sm:max-w-2xl w-full my-4 sm:my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-3 sm:p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{isEditMode ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hidePatientSelect && (
              <div>
                <label className="block text-sm font-medium mb-1">Patient *</label>
                <select
                  required
                  value={formData.patient_id}
                  onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select patient...</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.patient_code ? `${patient.patient_code} - ` : ''}{patient.first_name} {patient.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={hidePatientSelect ? 'sm:col-span-2' : ''}>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* ── From Patient Treatments ── */}
          {pendingTreatments.length > 0 && (
            <div className="border border-blue-200 rounded-lg overflow-hidden">
              <div className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 text-blue-800 text-sm font-medium">
                <span>
                  Pending Treatments
                  <span className="ml-2 px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-xs">
                    {pendingTreatments.length}
                  </span>
                </span>
                <span className="flex gap-2 text-xs font-normal">
                  <button
                    type="button"
                    onClick={selectAllTreatments}
                    className="text-blue-600 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-gray-400">·</span>
                  <button
                    type="button"
                    onClick={clearTreatmentSelection}
                    className="text-gray-500 hover:underline"
                  >
                    Clear
                  </button>
                </span>
              </div>

              <div className="p-3 space-y-2">
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {(() => {
                    const planGroupCounts = new Map<string, number>()
                    pendingTreatments.forEach((t) => {
                      if (t.treatment_plan_group_id) {
                        planGroupCounts.set(t.treatment_plan_group_id, (planGroupCounts.get(t.treatment_plan_group_id) || 0) + 1)
                      }
                    })
                    const seenGroupIds = new Set<string>()
                    return pendingTreatments.map((t) => {
                      const checked = selectedTreatmentIds.has(t.id)
                      const groupId = t.treatment_plan_group_id
                      const groupCount = groupId ? planGroupCounts.get(groupId) || 0 : 0
                      const showGroupHeader = !!groupId && groupCount > 1 && !seenGroupIds.has(groupId)
                      if (groupId && showGroupHeader) seenGroupIds.add(groupId)
                      return (
                        <li key={t.id}>
                          {showGroupHeader && (
                            <div className="flex items-center justify-between px-2 pt-1">
                              <span className="text-xs font-medium text-blue-700">Plan ({groupCount} items)</span>
                              <button
                                type="button"
                                onClick={() => selectPlanGroup(groupId!)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Select all
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleTreatment(t.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                              checked ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            {checked
                              ? <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              : <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                            <span className="flex-1 min-w-0 truncate">
                              {t.treatment_type}
                              {t.tooth_number ? ` (T${t.tooth_number})` : ''}
                              {t.description ? ` – ${t.description}` : ''}
                            </span>
                            <span className="text-gray-500 font-medium flex-shrink-0">
                              {formatBDT(t.cost || 0)}
                            </span>
                          </button>
                        </li>
                      )
                    })
                  })()}
                </ul>

                {autoImported ? (
                  <p className="text-xs text-blue-700">
                    Ticked treatments are added to the invoice automatically. Untick any you don't want to bill now.
                  </p>
                ) : (
                  selectedTreatmentIds.size > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => importTreatmentsAsItems()}
                      className="w-full sm:w-auto text-xs"
                    >
                      Add {selectedTreatmentIds.size} selected to invoice
                    </Button>
                  )
                )}
              </div>
            </div>
          )}

          {formData.patient_id && pendingTreatments.length === 0 && (
            <p className="text-xs text-text-secondary">
              No unbilled treatments for this patient — add items below.
            </p>
          )}

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <label className="block text-sm font-medium">Items</label>
              <Button type="button" size="sm" onClick={addItem} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK_TREATMENT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => addQuickTreatment(option)}
                  className="px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10"
                >
                  + {option}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_90px_120px_110px_auto] gap-2 items-start">
                  <input
                    type="text"
                    placeholder="Description *"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Qty"
                    value={item.quantity || '1'}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Unit price *"
                    value={item.unit_price || ''}
                    onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium text-right">
                    {formatBDT(getInvoiceItemLineTotal(item))}
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="w-full sm:w-auto px-3 py-2 text-red-600 hover:text-red-700 rounded-lg border border-red-200 hover:border-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <label className="text-sm text-text-secondary whitespace-nowrap">
                  Discount{formData.discount_type === 'percentage' ? ' (%)' : ''}:
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={formData.discount_type === 'percentage' ? '0' : '0.00'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full sm:w-32 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* ── More options ── */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowMoreOptions((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm text-text-secondary hover:bg-gray-100"
                >
                  <span>More options (tax, notes, payment terms, recurring)</span>
                  {showMoreOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showMoreOptions && (
                  <div className="p-3 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                      <label className="text-sm text-text-secondary whitespace-nowrap">Tax %:</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={formData.tax_rate}
                        onChange={(e) => setFormData((prev) => ({ ...prev, tax_rate: e.target.value }))}
                        className="w-full sm:w-32 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <textarea
                      rows={2}
                      placeholder="Internal notes"
                      value={formData.notes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />

                    <input
                      type="text"
                      placeholder="Payment terms (e.g. Due in 7 days)"
                      value={formData.payment_terms}
                      onChange={(e) => setFormData((prev) => ({ ...prev, payment_terms: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formData.recurring_enabled}
                        onChange={(e) => setFormData((prev) => ({ ...prev, recurring_enabled: e.target.checked }))}
                      />
                      Recurring invoice
                    </label>

                    {formData.recurring_enabled && (
                      <select
                        value={formData.recurring_frequency}
                        onChange={(e) => setFormData((prev) => ({ ...prev, recurring_frequency: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* ── Advanced options ── */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm text-text-secondary hover:bg-gray-100"
                >
                  <span>Advanced (discount type, credit, invoice #, installments)</span>
                  {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showAdvancedOptions && (
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Discount Type</label>
                      <select
                        value={formData.discount_type}
                        onChange={(e) => setFormData((prev) => ({ ...prev, discount_type: e.target.value as 'fixed' | 'percentage' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="fixed">Fixed amount</option>
                        <option value="percentage">Percentage (%)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Credit Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.credit_amount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, credit_amount: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Invoice # (optional)</label>
                      <input
                        type="text"
                        placeholder="Auto"
                        value={formData.invoice_number}
                        onChange={(e) => setFormData((prev) => ({ ...prev, invoice_number: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    {!isEditMode && (
                      <div>
                        <label className="block text-xs font-medium mb-1">Installments</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={formData.installment_count}
                          onChange={(e) => setFormData((prev) => ({ ...prev, installment_count: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <p className="text-[11px] text-text-secondary mt-1">Needs a due date; creates a monthly payment plan.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Subtotal:</span>
                  <span>{formatBDT(subtotal)}</span>
                </div>
                {discountCalcAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-secondary">Discount:</span>
                    <span>-{formatBDT(discountCalcAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary">Tax:</span>
                  <span>{formatBDT(taxAmount)}</span>
                </div>
                {creditAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-secondary">Credit:</span>
                    <span>-{formatBDT(creditAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center font-medium pt-1 border-t border-gray-200">
                  <span>Total:</span>
                  <span className="text-xl font-bold text-primary">{formatBDT(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Collect payment now (create mode only — edit mode uses the dedicated Record Payment action) ── */}
          {!isEditMode && (
            <div className="border border-green-200 rounded-lg overflow-hidden">
              <label className="flex items-center gap-3 px-3 py-2 bg-green-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={collectPayment}
                  onChange={(e) => handleCollectPaymentToggle(e.target.checked)}
                />
                <span className="text-sm font-medium text-green-800">Collect payment now</span>
              </label>
              {collectPayment && (
                <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Date</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button type="submit" disabled={saving} className="w-full sm:flex-1">
              {saving ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Invoice')}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:flex-1">
              Cancel
            </Button>
          </div>
        </form>
      </div>

      {thanksPrompt && (
        <PaymentThanksPrompt
          firstName={thanksPrompt.firstName}
          phone={thanksPrompt.phone}
          amount={thanksPrompt.amount}
          totalPaid={thanksPrompt.amount}
          onClose={() => {
            const invoiceId = thanksPrompt.invoiceId
            setThanksPrompt(null)
            onSave(invoiceId)
          }}
        />
      )}
    </div>
  )
}
