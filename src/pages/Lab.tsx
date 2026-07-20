import { useState, useEffect } from 'react'
import { Plus, Search, FlaskConical, ChevronDown, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { canDelete } from '@/lib/appSession'
import { logDeletion } from '@/lib/deleteHistory'
import { logEdit } from '@/lib/editHistory'
import { logActivity } from '@/lib/activityLog'
import { ToothSelector } from '@/components/ToothSelector'
import { getDentitionTypeFromDOB } from '@/lib/ageTier'
import { formatBDT } from '@/lib/utils'
import {
  LAB_WORK_TYPES,
  LAB_STATUSES,
  LAB_STATUS_TRANSITIONS,
  labWorkTotal,
  sumLabTotals,
  parseTeeth,
  type LabWorkRecord,
} from '@/lib/labWork'

type FilterMode = 'all' | 'unpaid' | 'overdue'

function isOverdue(record: LabWorkRecord): boolean {
  if (!record.expected_date) return false
  if (record.status === 'Delivered' || record.status === 'Cancelled') return false
  return record.expected_date < new Date().toISOString().slice(0, 10)
}

function needsDetails(record: LabWorkRecord): boolean {
  return record.lab_name.trim() === '' || labWorkTotal(record) === 0
}

export function Lab() {
  const [records, setRecords] = useState<LabWorkRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [editingRecord, setEditingRecord] = useState<LabWorkRecord | null>(null)

  useEffect(() => {
    loadLabWork()
  }, [])

  async function loadLabWork() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('lab_work')
        .select(`
          *,
          patients (first_name, last_name, date_of_birth)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      const parsed = (data || []).map((row: any) => ({ ...row, teeth: parseTeeth(row.teeth) }))
      setRecords(parsed)
    } catch (error) {
      console.error('Error loading lab work:', error)
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus(record: LabWorkRecord, newStatus: string) {
    try {
      const patientName = `${record.patients?.first_name ?? ''} ${record.patients?.last_name ?? ''}`.trim()
      await logEdit({
        entityType: 'lab_work',
        entityId: record.id,
        entityLabel: record.work_type,
        patientId: record.patient_id,
        patientName: patientName || null,
        previousPayload: record,
      })
      const { error } = await supabase.from('lab_work').update({ status: newStatus }).eq('id', record.id)
      if (error) throw error
      setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, status: newStatus } : r)))
    } catch (error) {
      console.error('Error updating lab work status:', error)
      alert('Failed to update status')
    }
  }

  async function togglePaid(record: LabWorkRecord) {
    try {
      const patientName = `${record.patients?.first_name ?? ''} ${record.patients?.last_name ?? ''}`.trim()
      await logEdit({
        entityType: 'lab_work',
        entityId: record.id,
        entityLabel: record.work_type,
        patientId: record.patient_id,
        patientName: patientName || null,
        previousPayload: record,
      })
      const { error } = await supabase.from('lab_work').update({ is_paid: !record.is_paid }).eq('id', record.id)
      if (error) throw error
      setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, is_paid: !r.is_paid } : r)))
    } catch (error) {
      console.error('Error updating lab work payment status:', error)
      alert('Failed to update payment status')
    }
  }

  async function deleteRecord(record: LabWorkRecord) {
    if (!canDelete()) return
    if (!confirm('Delete this lab work record?')) return

    try {
      const patientName = `${record.patients?.first_name ?? ''} ${record.patients?.last_name ?? ''}`.trim()
      await logDeletion({
        entityType: 'lab_work',
        entityId: record.id,
        entityLabel: record.work_type,
        patientId: record.patient_id,
        patientName: patientName || null,
        payload: record,
      })
      const { error } = await supabase.from('lab_work').delete().eq('id', record.id)
      if (error) throw error
      setRecords((prev) => prev.filter((r) => r.id !== record.id))
    } catch (error) {
      console.error('Error deleting lab work record:', error)
      alert('Failed to delete lab work record')
    }
  }

  const filteredRecords = records
    .filter((r) => {
      const q = searchQuery.toLowerCase()
      if (!q) return true
      return (
        (r.patients?.first_name ?? '').toLowerCase().includes(q) ||
        (r.patients?.last_name ?? '').toLowerCase().includes(q) ||
        r.lab_name.toLowerCase().includes(q) ||
        r.work_type.toLowerCase().includes(q)
      )
    })
    .filter((r) => {
      if (filterMode === 'unpaid') return !r.is_paid && r.status !== 'Cancelled'
      if (filterMode === 'overdue') return isOverdue(r)
      return true
    })

  const totals = sumLabTotals(filteredRecords)
  const isFiltered = searchQuery.trim() !== '' || filterMode !== 'all'

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Lab</h1>
          <p className="text-text-secondary mt-1">Track labwork sent out — crowns, bridges, dentures, ortho appliances</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Lab Work
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-text-secondary">
            Total billed by lab{isFiltered ? ' (matching current filter)' : ''}
          </p>
          <p className="text-xl font-bold mt-1">{formatBDT(totals.total)}</p>
        </div>
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-text-secondary">
            Paid to lab{isFiltered ? ' (matching current filter)' : ''}
          </p>
          <p className="text-xl font-bold mt-1 text-success">{formatBDT(totals.paid)}</p>
        </div>
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-text-secondary">
            Due to lab{isFiltered ? ' (matching current filter)' : ''}
          </p>
          <p className="text-xl font-bold mt-1 text-error">{formatBDT(totals.due)}</p>
        </div>
      </div>

      <div className="bg-card rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
            <input
              type="text"
              placeholder="Search lab work..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'unpaid', 'overdue'] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filterMode === mode ? 'bg-primary text-white' : 'text-text-secondary hover:bg-gray-100'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <span className="spinner" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            <FlaskConical className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p>{isFiltered ? 'No lab work found' : 'No lab work yet. Click "New Lab Work" to get started.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {groupLabWorkByPatient(filteredRecords).map((group) => (
              <PatientLabGroup
                key={group.patientId}
                patientName={group.patientName}
                records={group.records}
                onDelete={deleteRecord}
                onStatusChange={toggleStatus}
                onTogglePaid={togglePaid}
                onEdit={setEditingRecord}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <LabWorkModal
          onClose={() => setShowModal(false)}
          onSave={() => {
            loadLabWork()
            setShowModal(false)
          }}
        />
      )}

      {editingRecord && (
        <LabWorkModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={() => {
            loadLabWork()
            setEditingRecord(null)
          }}
        />
      )}
    </div>
  )
}

function groupLabWorkByPatient(records: LabWorkRecord[]) {
  const order: string[] = []
  const groups = new Map<string, { patientId: string; patientName: string; records: LabWorkRecord[] }>()

  for (const record of records) {
    const patientId = record.patient_id
    if (!groups.has(patientId)) {
      order.push(patientId)
      const patientName = `${record.patients?.first_name ?? ''} ${record.patients?.last_name ?? ''}`.trim()
      groups.set(patientId, { patientId, patientName: patientName || 'Unknown patient', records: [] })
    }
    groups.get(patientId)!.records.push(record)
  }

  return order.map((patientId) => groups.get(patientId)!)
}

const statusColors: Record<string, string> = {
  Pending: 'pill-info',
  Sent: 'pill-warning',
  Received: 'pill-warning',
  Delivered: 'pill-success',
  Cancelled: 'pill-error',
}

function PatientLabGroup({ patientName, records, onDelete, onStatusChange, onTogglePaid, onEdit }: {
  patientName: string
  records: LabWorkRecord[]
  onDelete: (record: LabWorkRecord) => void
  onStatusChange: (record: LabWorkRecord, status: string) => void
  onTogglePaid: (record: LabWorkRecord) => void
  onEdit: (record: LabWorkRecord) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const subtotal = sumLabTotals(records)

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
          {records.length} case{records.length > 1 ? 's' : ''}
        </span>
        <span className="text-xs text-text-secondary ml-auto">{formatBDT(subtotal.due)} due</span>
      </button>
      {expanded && (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {records.map((record) => (
            <LabRecordRow
              key={record.id}
              record={record}
              onDelete={() => onDelete(record)}
              onStatusChange={(status) => onStatusChange(record, status)}
              onTogglePaid={() => onTogglePaid(record)}
              onEdit={() => onEdit(record)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LabRecordRow({ record, onDelete, onStatusChange, onTogglePaid, onEdit }: {
  record: LabWorkRecord
  onDelete: () => void
  onStatusChange: (status: string) => void
  onTogglePaid: () => void
  onEdit: () => void
}) {
  const nextStatus = LAB_STATUS_TRANSITIONS[record.status]
  const total = labWorkTotal(record)

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">
              {record.work_type}
              {record.teeth.length > 0 && ` - Teeth #${record.teeth.join(', ')}`}
            </p>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[record.status] || 'bg-gray-100'}`}>
              {record.status}
            </span>
            {record.is_paid ? (
              <span className="pill-success text-xs">Paid</span>
            ) : (
              <span className="pill-warning text-xs">Unpaid</span>
            )}
            {needsDetails(record) && (
              <span className="pill-warning text-xs">Needs details</span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {record.lab_name || 'No lab/vendor set'} · {record.unit_count} unit{record.unit_count === 1 ? '' : 's'}
            {record.pricing_mode === 'flat' ? ' · Flat price' : ''}
          </p>
          {record.notes && <p className="text-sm text-text-secondary mt-1">{record.notes}</p>}
          <p className="text-sm font-medium text-primary mt-2">{formatBDT(total)}</p>
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
          <button
            onClick={onTogglePaid}
            className="px-2 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
            title={record.is_paid ? 'Mark unpaid' : 'Mark paid'}
          >
            {record.is_paid ? 'Mark unpaid' : 'Mark paid'}
          </button>
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

interface LabWorkFormState {
  patient_id: string
  lab_name: string
  work_type: string
  teeth: number[]
  unit_count: string
  shade: string
  material: string
  pricing_mode: 'per_unit' | 'flat'
  unit_price: string
  flat_price: string
  status: string
  date_sent: string
  expected_date: string
  date_received: string
  is_paid: boolean
  notes: string
}

function LabWorkModal({ record, onClose, onSave }: {
  record?: LabWorkRecord
  onClose: () => void
  onSave: () => void
}) {
  const [patients, setPatients] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [unitsTouched, setUnitsTouched] = useState(!!record)
  const [form, setForm] = useState<LabWorkFormState>(() => ({
    patient_id: record?.patient_id || '',
    lab_name: record?.lab_name || '',
    work_type: record?.work_type || '',
    teeth: record?.teeth || [],
    unit_count: String(record?.unit_count ?? 0),
    shade: record?.shade || '',
    material: record?.material || '',
    pricing_mode: record?.pricing_mode || 'per_unit',
    unit_price: String(record?.unit_price ?? ''),
    flat_price: String(record?.flat_price ?? ''),
    status: record?.status || 'Pending',
    date_sent: record?.date_sent || '',
    expected_date: record?.expected_date || '',
    date_received: record?.date_received || '',
    is_paid: record?.is_paid ?? false,
    notes: record?.notes || '',
  }))

  useEffect(() => {
    if (!record) loadPatients()
  }, [record])

  async function loadPatients() {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, date_of_birth')
      .order('last_name')
    setPatients(data || [])
  }

  const dentitionType = record
    ? getDentitionTypeFromDOB(record.patients?.date_of_birth)
    : getDentitionTypeFromDOB(patients.find((p) => p.id === form.patient_id)?.date_of_birth)

  function handleTeethChange(teeth: number[]) {
    setForm((prev) => ({
      ...prev,
      teeth,
      unit_count: unitsTouched ? prev.unit_count : String(teeth.length),
    }))
  }

  function handleUnitsChange(value: string) {
    setUnitsTouched(true)
    setForm((prev) => ({ ...prev, unit_count: value }))
  }

  const liveTotal = labWorkTotal({
    pricing_mode: form.pricing_mode,
    unit_price: parseFloat(form.unit_price) || 0,
    unit_count: parseInt(form.unit_count, 10) || 0,
    flat_price: parseFloat(form.flat_price) || 0,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const payload = {
        patient_id: form.patient_id,
        lab_name: form.lab_name.trim(),
        work_type: form.work_type,
        teeth: form.teeth,
        unit_count: parseInt(form.unit_count, 10) || 0,
        shade: form.shade.trim() || null,
        material: form.material.trim() || null,
        pricing_mode: form.pricing_mode,
        unit_price: parseFloat(form.unit_price) || 0,
        flat_price: parseFloat(form.flat_price) || 0,
        status: form.status,
        date_sent: form.date_sent || null,
        expected_date: form.expected_date || null,
        date_received: form.date_received || null,
        is_paid: form.is_paid,
        notes: form.notes.trim() || null,
      }

      const selectedPatient = record ? null : patients.find((p) => p.id === form.patient_id)
      const patientName = record
        ? `${record.patients?.first_name ?? ''} ${record.patients?.last_name ?? ''}`.trim()
        : selectedPatient
          ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
          : null

      if (record) {
        await logEdit({
          entityType: 'lab_work',
          entityId: record.id,
          entityLabel: record.work_type,
          patientId: record.patient_id,
          patientName: patientName || null,
          previousPayload: record,
        })
        const { error } = await supabase.from('lab_work').update(payload).eq('id', record.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('lab_work').insert(payload)
        if (error) throw error
        logActivity({
          action: 'create',
          entityType: 'lab_work',
          entityLabel: form.work_type,
          patientId: form.patient_id,
          patientName,
          details: `${payload.unit_count} unit(s), ${formatBDT(liveTotal)}`,
        })
      }

      onSave()
    } catch (error) {
      console.error('Error saving lab work:', error)
      alert('Failed to save lab work record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{record ? 'Edit Lab Work' : 'New Lab Work'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {record ? (
            <div>
              <label className="block text-sm font-medium mb-1">Patient</label>
              <p className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-text-secondary">
                {record.patients?.first_name} {record.patients?.last_name}
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Patient *</label>
              <select
                required
                value={form.patient_id}
                onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
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
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Lab / Vendor</label>
            <input
              type="text"
              value={form.lab_name}
              onChange={(e) => setForm({ ...form, lab_name: e.target.value })}
              placeholder="e.g. Apex Dental Lab"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Work Type *</label>
            <select
              required
              value={form.work_type}
              onChange={(e) => setForm({ ...form, work_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select...</option>
              {LAB_WORK_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Teeth</label>
            <ToothSelector selectedTeeth={form.teeth} onChange={handleTeethChange} dentitionType={dentitionType} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Units</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.unit_count}
              onChange={(e) => handleUnitsChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-text-secondary mt-1">Defaults to the number of teeth selected — override for cases like a single ortho appliance.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Shade</label>
              <input
                type="text"
                value={form.shade}
                onChange={(e) => setForm({ ...form, shade: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Material</label>
              <input
                type="text"
                value={form.material}
                onChange={(e) => setForm({ ...form, material: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Pricing</label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={form.pricing_mode === 'per_unit'}
                  onChange={() => setForm({ ...form, pricing_mode: 'per_unit' })}
                />
                Per unit
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={form.pricing_mode === 'flat'}
                  onChange={() => setForm({ ...form, pricing_mode: 'flat' })}
                />
                Flat / whole case
              </label>
            </div>
            {form.pricing_mode === 'per_unit' ? (
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                placeholder="Price per unit"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.flat_price}
                onChange={(e) => setForm({ ...form, flat_price: e.target.value })}
                placeholder="Flat price for the whole case"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
            <p className="text-sm font-medium text-primary mt-2">Total: {formatBDT(liveTotal)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LAB_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Sent</label>
              <input
                type="date"
                value={form.date_sent}
                onChange={(e) => setForm({ ...form, date_sent: e.target.value })}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expected</label>
              <input
                type="date"
                value={form.expected_date}
                onChange={(e) => setForm({ ...form, expected_date: e.target.value })}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Received</label>
              <input
                type="date"
                value={form.date_received}
                onChange={(e) => setForm({ ...form, date_received: e.target.value })}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_paid}
              onChange={(e) => setForm({ ...form, is_paid: e.target.checked })}
            />
            Paid to lab
          </label>

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
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : record ? 'Save Changes' : 'Create Lab Work'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
