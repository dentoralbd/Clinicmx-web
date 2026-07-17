import { useState, useEffect } from 'react'
import { Plus, Search, Activity, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { canDelete } from '@/lib/appSession'
import { logDeletion } from '@/lib/deleteHistory'
import { logEdit } from '@/lib/editHistory'
import { logActivity } from '@/lib/activityLog'
import { ToothSelector } from '@/components/ToothSelector'
import { getDentitionTypeFromDOB } from '@/lib/ageTier'
import { formatBDT } from '@/lib/utils'
import { getFriendlySupabaseErrorMessage, logBillingError } from '@/lib/billing'
import { syncInvoiceForTreatmentChange } from '@/lib/invoiceSync'
import { InvoiceModal } from '@/components/InvoiceModal'
import { InvoicePrint } from '@/components/InvoicePrint'
import { loadDoctorProfile, type DoctorProfileData } from '@/lib/doctorProfile'

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
  treatment_plan_group_id: string | null
  is_invoiced?: boolean | null
  invoice_id?: string | null
  patients: {
    first_name: string
    last_name: string
    date_of_birth?: string | null
  }
}

export function Treatments() {
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [groupSimilarTreatments, setGroupSimilarTreatments] = useState(false)
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null)
  const [invoiceContext, setInvoiceContext] = useState<{ patientId: string; planGroupId?: string } | null>(null)
  const [printJob, setPrintJob] = useState<{ invoices: any[]; patient: any } | null>(null)
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileData | null>(null)

  useEffect(() => {
    loadDoctorProfile().then(setDoctorProfile, () => {})
  }, [])

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
          patients (first_name, last_name, date_of_birth)
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

  /** After a linked treatment changes, rebuild its invoice. The treatment change
   *  is already committed — failures here must not roll it back. */
  async function handleInvoiceSyncForTreatment(treatment: Treatment, change: 'edited' | 'deleted') {
    try {
      const result = await syncInvoiceForTreatmentChange(treatment, change)
      if (!result) return
      const patientName = `${treatment.patients?.first_name ?? ''} ${treatment.patients?.last_name ?? ''}`.trim()
      logActivity({
        action: 'edit',
        entityType: 'invoice',
        entityId: result.invoiceId,
        entityLabel: result.invoiceNumber,
        patientId: treatment.patient_id,
        patientName: patientName || null,
        details: `Recalculated after treatment ${change}`,
      })
    } catch (error) {
      logBillingError('Failed to sync invoice after treatment change', error, { treatmentId: treatment.id })
      alert(`The treatment was ${change === 'edited' ? 'saved' : 'deleted'}, but the linked invoice could not be updated: ${getFriendlySupabaseErrorMessage(error)}`)
    }
  }

  async function deleteTreatment(treatment: Treatment) {
    if (!canDelete()) return
    const linkedToInvoice = !!treatment.invoice_id
    if (!confirm(linkedToInvoice
      ? 'Delete this treatment? Its invoice will be updated to remove it.'
      : 'Delete this treatment?')) return

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
      await handleInvoiceSyncForTreatment(treatment, 'deleted')
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

      const unbilled = previous && !previous.invoice_id
      if (newStatus === 'Completed' && previous?.status !== 'Completed' && unbilled && (previous.cost || 0) > 0) {
        if (confirm('Treatment completed but not billed yet. Create the invoice now?')) {
          setInvoiceContext({ patientId: previous.patient_id })
        }
      }
    } catch (error) {
      console.error('Error updating treatment status:', error)
      alert('Failed to update treatment')
    }
  }

  /** Bulk status change for every treatment in a plan group at once. */
  async function updateGroupTreatmentsStatus(members: Treatment[], newStatus: string) {
    try {
      const ids = members.map((m) => m.id)
      await Promise.all(members.map((m) => {
        const patientName = `${m.patients?.first_name ?? ''} ${m.patients?.last_name ?? ''}`.trim()
        return logEdit({
          entityType: 'treatment',
          entityId: m.id,
          entityLabel: m.treatment_type,
          patientId: m.patient_id,
          patientName: patientName || null,
          previousPayload: m,
        })
      }))
      const { error } = await supabase.from('treatments').update({ status: newStatus }).in('id', ids)
      if (error) throw error
      setTreatments((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, status: newStatus } : t)))

      if (newStatus === 'Completed') {
        const unbilledCostly = members.filter((m) => m.status !== 'Completed' && !m.invoice_id && (Number(m.cost) || 0) > 0)
        if (unbilledCostly.length > 0 && confirm(`${unbilledCostly.length} treatment(s) completed but not billed yet. Create the invoice now?`)) {
          setInvoiceContext({ patientId: members[0].patient_id })
        }
      }
    } catch (error) {
      console.error('Error updating treatment statuses:', error)
      alert('Failed to update treatment statuses')
    }
  }

  async function updateTreatmentFields(id: string, patch: {
    treatment_type: string
    tooth_number: number | null
    description: string | null
    cost: number
    status: string
    notes: string | null
  }) {
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
      const { error } = await supabase.from('treatments').update(patch).eq('id', id)
      if (error) throw error
      setTreatments((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      const billingFieldsChanged = previous && (
        previous.treatment_type !== patch.treatment_type ||
        (previous.tooth_number ?? null) !== (patch.tooth_number ?? null) ||
        (previous.description ?? '') !== (patch.description ?? '') ||
        Number(previous.cost ?? 0) !== Number(patch.cost ?? 0)
      )
      if (previous && billingFieldsChanged) {
        await handleInvoiceSyncForTreatment({ ...previous, ...patch, id }, 'edited')
      }
      setEditingTreatment(null)
    } catch (error) {
      console.error('Error updating treatment:', error)
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
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <input
              type="text"
              placeholder="Search treatments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={groupSimilarTreatments}
              onChange={(e) => setGroupSimilarTreatments(e.target.checked)}
            />
            Group similar
          </label>
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
            {groupTreatmentsByPatient(filteredTreatments).map((group) => (
              <PatientTreatmentGroup
                key={group.patientId}
                patientName={group.patientName}
                treatments={group.treatments}
                groupSimilar={groupSimilarTreatments}
                onDelete={deleteTreatment}
                onStatusChange={updateTreatmentStatus}
                onGroupStatusChange={updateGroupTreatmentsStatus}
                onEdit={setEditingTreatment}
                onBill={(patientId) => setInvoiceContext({ patientId })}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <TreatmentModal
          onClose={() => setShowModal(false)}
          onSave={(billing) => {
            loadTreatments()
            setShowModal(false)
            if (billing) setInvoiceContext(billing)
          }}
        />
      )}

      {invoiceContext && (
        <InvoiceModal
          defaultPatientId={invoiceContext.patientId}
          hidePatientSelect
          preferredPlanGroupId={invoiceContext.planGroupId ?? null}
          onClose={() => setInvoiceContext(null)}
          onSave={async (invoiceId) => {
            const patientId = invoiceContext.patientId
            setInvoiceContext(null)
            loadTreatments()
            if (invoiceId) {
              const [{ data: invoice }, { data: patient }] = await Promise.all([
                supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle(),
                supabase.from('patients').select('first_name, last_name, phone, email, patient_code').eq('id', patientId).maybeSingle(),
              ])
              if (invoice && patient && confirm('Invoice created. Print or share it now?')) {
                setPrintJob({ invoices: [invoice], patient })
              }
            }
          }}
        />
      )}

      {printJob && (
        <InvoicePrint
          invoices={printJob.invoices}
          patient={printJob.patient}
          doctor={doctorProfile}
          onClose={() => setPrintJob(null)}
        />
      )}

      {editingTreatment && (
        <EditTreatmentModal
          treatment={editingTreatment}
          dentitionType={getDentitionTypeFromDOB(editingTreatment.patients?.date_of_birth)}
          onSave={updateTreatmentFields}
          onClose={() => setEditingTreatment(null)}
        />
      )}
    </div>
  )
}

function groupTreatmentsByPatient(treatments: Treatment[]) {
  const order: string[] = []
  const groups = new Map<string, { patientId: string; patientName: string; treatments: Treatment[] }>()

  for (const treatment of treatments) {
    const patientId = treatment.patient_id
    if (!groups.has(patientId)) {
      order.push(patientId)
      const patientName = `${treatment.patients?.first_name ?? ''} ${treatment.patients?.last_name ?? ''}`.trim()
      groups.set(patientId, { patientId, patientName: patientName || 'Unknown patient', treatments: [] })
    }
    groups.get(patientId)!.treatments.push(treatment)
  }

  return order.map((patientId) => groups.get(patientId)!)
}

function PatientTreatmentGroup({ patientName, treatments, groupSimilar, onDelete, onStatusChange, onGroupStatusChange, onEdit, onBill }: {
  patientName: string
  treatments: Treatment[]
  groupSimilar: boolean
  onDelete: (treatment: Treatment) => void
  onStatusChange: (id: string, status: string) => void
  onGroupStatusChange: (members: Treatment[], status: string) => void
  onEdit: (treatment: Treatment) => void
  onBill: (patientId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set())
  const toggleSubGroup = (key: string) => {
    setExpandedSubGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const planGroupCounts = new Map<string, number>()
  treatments.forEach((t) => {
    if (t.treatment_plan_group_id) {
      planGroupCounts.set(t.treatment_plan_group_id, (planGroupCounts.get(t.treatment_plan_group_id) || 0) + 1)
    }
  })

  // Opt-in grouping: only merges rows identical apart from tooth number
  // (same type, description, cost) — variants like GI vs LC filling stay separate.
  const groupRowKey = (t: Treatment) =>
    t.treatment_plan_group_id
      ? `${t.treatment_plan_group_id}::${t.treatment_type}::${(t.description || '').trim()}::${t.cost || 0}`
      : null
  const buckets = new Map<string, Treatment[]>()
  if (groupSimilar) {
    treatments.forEach((t) => {
      const key = groupRowKey(t)
      if (!key) return
      buckets.set(key, [...(buckets.get(key) || []), t])
    })
  }
  const displayRows: Array<{ kind: 'single'; treatment: Treatment } | { kind: 'group'; key: string; members: Treatment[] }> = []
  const emitted = new Set<string>()
  treatments.forEach((t) => {
    const key = groupSimilar ? groupRowKey(t) : null
    const members = key ? buckets.get(key) || [] : []
    if (!key || members.length < 2) {
      displayRows.push({ kind: 'single', treatment: t })
    } else if (!emitted.has(key)) {
      emitted.add(key)
      displayRows.push({ kind: 'group', key, members })
    }
  })

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <ChevronDown className={`w-4 h-4 text-text-secondary flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} />
        <p className="font-semibold">{patientName}</p>
        <span className="text-xs text-text-secondary">
          {treatments.length} treatment{treatments.length > 1 ? 's' : ''}
        </span>
      </button>
      {expanded && (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {displayRows.map((row) =>
            row.kind === 'single' ? (
              <TreatmentRow
                key={row.treatment.id}
                treatment={row.treatment}
                planItemCount={row.treatment.treatment_plan_group_id ? planGroupCounts.get(row.treatment.treatment_plan_group_id) || 0 : 0}
                onDelete={() => onDelete(row.treatment)}
                onStatusChange={(status) => onStatusChange(row.treatment.id, status)}
                onEdit={() => onEdit(row.treatment)}
                onBill={() => onBill(row.treatment.patient_id)}
              />
            ) : (
              <GroupTreatmentRow
                key={`group-${row.key}`}
                members={row.members}
                expanded={expandedSubGroups.has(row.key)}
                onToggle={() => toggleSubGroup(row.key)}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
                onGroupStatusChange={onGroupStatusChange}
                onEdit={onEdit}
                onBill={onBill}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_TRANSITIONS: Record<string, string> = {
  Planned: 'In Progress',
  'In Progress': 'Completed',
}

const statusColors: Record<string, string> = {
  Planned: 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-yellow-100 text-yellow-700',
  Completed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
}

function GroupTreatmentRow({ members, expanded, onToggle, onDelete, onStatusChange, onGroupStatusChange, onEdit, onBill }: {
  members: Treatment[]
  expanded: boolean
  onToggle: () => void
  onDelete: (treatment: Treatment) => void
  onStatusChange: (id: string, status: string) => void
  onGroupStatusChange: (members: Treatment[], status: string) => void
  onEdit: (treatment: Treatment) => void
  onBill: (patientId: string) => void
}) {
  const first = members[0]
  const teeth = members
    .map((m) => m.tooth_number)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)
  const statusCounts = new Map<string, number>()
  members.forEach((m) => statusCounts.set(m.status, (statusCounts.get(m.status) || 0) + 1))
  const totalCost = members.reduce((sum, m) => sum + (Number(m.cost) || 0), 0)

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle() }}
        className="w-full p-4 hover:bg-gray-50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">
                {first.treatment_type}
                {teeth.length > 0 && ` - Teeth #${teeth.join(', ')}`}
              </p>
              <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                Plan &middot; {members.length} items
              </span>
              {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {Array.from(statusCounts.entries()).map(([status, count]) => (
                <span key={status} className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[status] || 'bg-gray-100'}`}>
                  {count} {status}
                </span>
              ))}
              <select
                value=""
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const value = e.target.value
                  if (value) onGroupStatusChange(members, value)
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
            </div>
            {first.description && (
              <p className="text-sm text-text-secondary mt-1">{first.description}</p>
            )}
            <p className="text-sm font-medium text-primary mt-2">{formatBDT(totalCost)}</p>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50">
          {members.map((treatment) => (
            <TreatmentRow
              key={treatment.id}
              treatment={treatment}
              onDelete={() => onDelete(treatment)}
              onStatusChange={(status) => onStatusChange(treatment.id, status)}
              onEdit={() => onEdit(treatment)}
              onBill={() => onBill(treatment.patient_id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TreatmentRow({ treatment, planItemCount = 0, onDelete, onStatusChange, onEdit, onBill }: {
  treatment: Treatment
  planItemCount?: number
  onDelete: () => void
  onStatusChange: (status: string) => void
  onEdit: () => void
  onBill: () => void
}) {
  const nextStatus = STATUS_TRANSITIONS[treatment.status]
  const linked = !!treatment.invoice_id
  const readyToBill = !linked && treatment.status !== 'Cancelled' && (Number(treatment.cost) || 0) > 0

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">
              {treatment.treatment_type}
              {treatment.tooth_number && ` - Tooth #${treatment.tooth_number}`}
            </p>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[treatment.status] || 'bg-gray-100'}`}>
              {treatment.status}
            </span>
            {planItemCount > 1 && (
              <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                Plan &middot; {planItemCount} items
              </span>
            )}
            {linked ? (
              <span className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">Invoiced</span>
            ) : readyToBill ? (
              <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Ready to bill</span>
            ) : null}
          </div>
          {treatment.description && (
            <p className="text-sm text-text-secondary mt-1">{treatment.description}</p>
          )}
          <p className="text-sm font-medium text-primary mt-2">{formatBDT(Number(treatment.cost) || 0)}</p>
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
          {readyToBill && (
            <button
              onClick={onBill}
              className="px-2 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              title="Create an invoice for this patient"
            >
              Bill
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
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

function EditTreatmentModal({ treatment, dentitionType, onSave, onClose }: {
  treatment: Treatment
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

function emptyTreatmentItem() {
  return { teeth: [] as number[], treatment_type: '', description: '', status: 'Planned', cost: '', notes: '' }
}

function TreatmentModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (billing?: { patientId: string; planGroupId: string }) => void
}) {
  const [patients, setPatients] = useState<any[]>([])
  const [formData, setFormData] = useState({
    patient_id: '',
    items: [emptyTreatmentItem()],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadPatients()
  }, [])

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, date_of_birth')
      .order('last_name')
    setPatients(data || [])
  }

  const dentitionType = getDentitionTypeFromDOB(
    patients.find((p) => p.id === formData.patient_id)?.date_of_birth
  )

  function updateItem(index: number, patch: Record<string, any>) {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], ...patch }
    setFormData({ ...formData, items: newItems })
  }

  function addItem() {
    setFormData({ ...formData, items: [...formData.items, emptyTreatmentItem()] })
  }

  function removeItem(index: number) {
    setFormData({ ...formData, items: formData.items.filter((_, i) => i !== index) })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      // One treatments row per (item x tooth) so each is labelled and billed individually,
      // matching the prescription treatment-plan flow. Cost is per item.
      // Items created in the same submission share a planGroupId so they can be
      // displayed/selected together later (Treatment History grouping, invoice picker).
      const planGroupId = crypto.randomUUID()
      const rows = formData.items.flatMap((item) => {
        const teethList: Array<number | null> = item.teeth.length > 0 ? item.teeth : [null]
        return teethList.map((tooth) => ({
          patient_id: formData.patient_id,
          tooth_number: tooth,
          treatment_type: item.treatment_type,
          description: item.description || null,
          status: item.status,
          cost: parseFloat(item.cost) || 0,
          notes: item.notes || null,
          treatment_plan_group_id: planGroupId,
        }))
      })
      const { error } = await supabase.from('treatments').insert(rows)

      if (error) throw error

      const selectedPatient = patients.find((p) => p.id === formData.patient_id)
      const totalCost = rows.reduce((sum, row) => sum + (row.cost || 0), 0)
      logActivity({
        action: 'create',
        entityType: 'treatment',
        entityLabel: formData.items.map((item) => item.treatment_type).filter(Boolean).join(', '),
        patientId: formData.patient_id,
        patientName: selectedPatient
          ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
          : null,
        details: `${rows.length} item(s), total ${formatBDT(totalCost)}`,
      })

      const billable = rows.some((row) => (row.cost || 0) > 0 && row.status !== 'Cancelled')
      if (billable && confirm('Treatment plan saved. Create an invoice for these treatments now?')) {
        onSave({ patientId: formData.patient_id, planGroupId })
      } else {
        onSave()
      }
    } catch (error) {
      console.error('Error creating treatment:', error)
      alert('Failed to create treatment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10 flex items-center justify-between">
          <h2 className="text-xl font-bold">New Treatment</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
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

          <div className="space-y-3">
            {formData.items.map((item, index) => (
              <div key={index} className="relative rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
                <div className="absolute -left-3 top-4 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow">
                  {index + 1}
                </div>
                {formData.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Treatment Type *</label>
                    <select
                      required
                      value={item.treatment_type}
                      onChange={(e) => updateItem(index, { treatment_type: e.target.value })}
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
                    <label className="block text-sm font-medium mb-1">Tooth / Teeth</label>
                    <ToothSelector
                      selectedTeeth={item.teeth}
                      onChange={(teeth) => updateItem(index, { teeth })}
                      dentitionType={dentitionType}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={item.description}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-sm font-medium mb-1">Cost *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={item.cost}
                      onChange={(e) => updateItem(index, { cost: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={item.notes}
                    onChange={(e) => updateItem(index, { notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="w-full text-sm font-medium text-primary border border-dashed border-primary/40 rounded-lg py-2 hover:bg-primary/5"
          >
            + Add Treatment Item
          </button>

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
