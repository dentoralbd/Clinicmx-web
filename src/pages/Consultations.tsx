import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Eye, Stethoscope, X, ChevronDown, ArrowUpRight, ReceiptText, Pill } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { InvoiceModal } from '@/components/InvoiceModal'
import type { InvoiceTemplateData } from '@/components/InvoiceTemplateSelector'
import { supabase } from '@/lib/supabase'
import { createPatient, matchesPatientSearch } from '@/lib/patients'
import { canDelete } from '@/lib/appSession'
import { logDeletion } from '@/lib/deleteHistory'
import { logEdit } from '@/lib/editHistory'
import { logActivity } from '@/lib/activityLog'
import { formatBDT } from '@/lib/utils'
import { format } from 'date-fns'

function deriveDateOfBirthFromAge(age: number) {
  const today = new Date()
  const approximateBirthDate = new Date(today.getFullYear() - age, today.getMonth(), today.getDate())
  return format(approximateBirthDate, 'yyyy-MM-dd')
}

interface ConsultationPatient {
  id: string
  patient_code: string | null
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  date_of_birth: string | null
  gender: string | null
  address: string | null
  notes: string | null
  created_at: string
}

interface ConsultationInvoiceSummary {
  id: string
  invoice_number: string | null
  status: string | null
  total_amount: number
  paid_amount: number
  created_at: string
}

function invoiceStatusChip(invoice: ConsultationInvoiceSummary | undefined) {
  if (!invoice) return <span className="text-xs text-gray-400 italic">Not invoiced</span>
  const due = Math.max((invoice.total_amount || 0) - (invoice.paid_amount || 0), 0)
  if (due <= 0) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Paid</span>
  }
  if ((invoice.paid_amount || 0) > 0) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Partial · Due {formatBDT(due)}</span>
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Due {formatBDT(due)}</span>
}

export function Consultations() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<ConsultationPatient[]>([])
  const [invoicesByPatient, setInvoicesByPatient] = useState<Record<string, ConsultationInvoiceSummary>>({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    age: '',
    gender: 'Male',
    fee: '',
    phone: '',
    email: '',
    date_of_birth: '',
    address: '',
    notes: '',
  })

  // Opens InvoiceModal for a given patient, optionally prefilled with a
  // single "Consultation" line item (used right after intake and from the
  // "Invoice fee" row action for a follow-up consultation).
  const [invoiceTarget, setInvoiceTarget] = useState<{ patientId: string; patientName: string; fee?: number } | null>(null)
  // Asked once the invoice step (save or skip) for a freshly-created
  // consultation is done — offers to jump straight to writing a prescription.
  const [prescriptionPrompt, setPrescriptionPrompt] = useState<{ patientId: string; patientName: string } | null>(null)

  useEffect(() => {
    loadConsultations()
  }, [])

  async function loadConsultations() {
    try {
      setLoading(true)
      const { data: patientRows, error } = await supabase
        .from('patients')
        .select('*')
        .eq('patient_type', 'consultation')
        .order('created_at', { ascending: false })
      if (error) throw error
      const consultationPatients = (patientRows || []) as ConsultationPatient[]
      setPatients(consultationPatients)

      if (consultationPatients.length > 0) {
        const { data: invoiceRows } = await supabase
          .from('invoices')
          .select('id, patient_id, invoice_number, status, total_amount, paid_amount, created_at')
          .in('patient_id', consultationPatients.map((p) => p.id))
          .neq('status', 'Merged')
          .order('created_at', { ascending: false })

        const latestByPatient: Record<string, ConsultationInvoiceSummary> = {}
        for (const inv of invoiceRows || []) {
          if (!latestByPatient[inv.patient_id]) {
            latestByPatient[inv.patient_id] = {
              id: inv.id,
              invoice_number: inv.invoice_number,
              status: inv.status,
              total_amount: inv.total_amount || 0,
              paid_amount: inv.paid_amount || 0,
              created_at: inv.created_at,
            }
          }
        }
        setInvoicesByPatient(latestByPatient)
      } else {
        setInvoicesByPatient({})
      }
    } catch (error) {
      console.error('Error loading consultations:', error)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setFormData({
      first_name: '',
      last_name: '',
      age: '',
      gender: 'Male',
      fee: '',
      phone: '',
      email: '',
      date_of_birth: '',
      address: '',
      notes: '',
    })
    setShowMore(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedAge = Number.parseInt(formData.age, 10)
    const hasValidAge = !Number.isNaN(parsedAge) && parsedAge >= 0
    const dateOfBirth = formData.date_of_birth || (hasValidAge ? deriveDateOfBirthFromAge(parsedAge) : '')
    if (!dateOfBirth) {
      alert('Please provide Age (or Date of Birth in More details)')
      return
    }
    const parsedFee = Number.parseFloat(formData.fee)
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      alert('Please enter a valid consultation fee')
      return
    }

    const payload = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      phone: formData.phone,
      email: formData.email || null,
      date_of_birth: dateOfBirth,
      gender: formData.gender,
      address: formData.address || null,
      notes: formData.notes || null,
      patient_type: 'consultation' as const,
    }

    try {
      if (editingId) {
        const previous = patients.find((p) => p.id === editingId)
        if (previous) {
          await logEdit({
            entityType: 'patient',
            entityId: editingId,
            entityLabel: `${previous.first_name} ${previous.last_name}`.trim(),
            patientId: editingId,
            patientName: `${previous.first_name} ${previous.last_name}`.trim(),
            previousPayload: previous,
          })
        }
        const { error: updateError } = await supabase
          .from('patients')
          .update(payload as any)
          .eq('id', editingId)
        if (updateError) throw updateError
        setShowForm(false)
        setEditingId(null)
        resetForm()
        loadConsultations()
      } else {
        const created = await createPatient(payload)
        setShowForm(false)
        resetForm()
        loadConsultations()
        if (created?.id) {
          setInvoiceTarget({
            patientId: created.id,
            patientName: `${payload.first_name} ${payload.last_name}`.trim(),
            fee: parsedFee,
          })
        }
      }
    } catch (error) {
      console.error('Error saving consultation:', error)
      alert('Failed to save consultation')
    }
  }

  function handleEdit(patient: ConsultationPatient) {
    setFormData({
      first_name: patient.first_name,
      last_name: patient.last_name,
      age: '',
      gender: patient.gender || 'Male',
      fee: '',
      phone: patient.phone || '',
      email: patient.email || '',
      date_of_birth: patient.date_of_birth || '',
      address: patient.address || '',
      notes: patient.notes || '',
    })
    setEditingId(patient.id)
    setShowMore(true)
    setShowForm(true)
  }

  async function handleDelete(patient: ConsultationPatient) {
    if (!canDelete()) return
    if (!confirm('Are you sure you want to delete this consultation entry?')) return
    try {
      await logDeletion({
        entityType: 'patient',
        entityId: patient.id,
        entityLabel: `${patient.first_name} ${patient.last_name}`.trim(),
        patientId: patient.id,
        patientName: `${patient.first_name} ${patient.last_name}`.trim(),
        payload: patient,
      })
      await supabase.from('patients').delete().eq('id', patient.id)
      loadConsultations()
    } catch (error) {
      console.error('Error deleting consultation:', error)
      alert('Failed to delete consultation entry')
    }
  }

  async function handleConvert(patient: ConsultationPatient) {
    if (!confirm(`Convert ${patient.first_name} ${patient.last_name} to a full patient record?`)) return
    try {
      const patientName = `${patient.first_name} ${patient.last_name}`.trim()
      await logEdit({
        entityType: 'patient',
        entityId: patient.id,
        entityLabel: patientName,
        patientId: patient.id,
        patientName,
        previousPayload: patient,
      })
      const { data: newCode, error: codeError } = await (supabase as any).rpc('generate_patient_code')
      if (codeError || !newCode) throw codeError || new Error('Failed to assign a patient code')
      const { error } = await supabase
        .from('patients')
        .update({ patient_type: 'full', patient_code: newCode })
        .eq('id', patient.id)
      if (error) throw error
      logActivity({
        action: 'edit',
        entityType: 'patient',
        entityId: patient.id,
        entityLabel: patientName,
        patientId: patient.id,
        patientName,
        details: `Converted from consultation to full patient (${patient.patient_code || 'CO-?'} → ${newCode})`,
      })
      loadConsultations()
    } catch (error) {
      console.error('Error converting consultation to patient:', error)
      alert('Failed to convert to full patient')
    }
  }

  const filteredPatients = patients.filter((patient) =>
    matchesPatientSearch(
      { name: `${patient.first_name} ${patient.last_name}`, code: patient.patient_code, phone: patient.phone },
      searchTerm
    ) || !searchTerm
  )

  const consultationTemplate: InvoiceTemplateData | null = invoiceTarget?.fee
    ? {
        id: '',
        name: 'Consultation',
        description: null,
        invoice_type: 'basic',
        items: [
          {
            description: 'Consultation',
            amount: invoiceTarget.fee,
            quantity: 1,
            unit_price: invoiceTarget.fee,
            line_total: invoiceTarget.fee,
          },
        ],
        discount_amount: 0,
        tax_rate: 0,
        payment_terms: null,
      }
    : null

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Consultation</h1>
          <p className="text-text-secondary">Walk-in consultations, before they become full patient records</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Consultation
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
        <input
          type="text"
          placeholder="Search by name, phone, or patient ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="spinner" />
        </div>
      ) : filteredPatients.length === 0 && !searchTerm ? (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Stethoscope className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-text-secondary font-medium mb-3">No consultations yet</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add First Consultation
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredPatients.length === 0 ? (
            <p className="text-center text-text-secondary py-8">No consultations match your search</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Gender</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Fee</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPatients.map((patient) => {
                    const invoice = invoicesByPatient[patient.id]
                    return (
                      <tr key={patient.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => navigate(`/patients/${patient.id}`)}
                          >
                            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-bright rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                              {patient.first_name?.[0] || '?'}
                            </div>
                            <span className="font-medium group-hover:text-primary transition-colors">
                              {patient.first_name} {patient.last_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm">{patient.phone || <span className="text-gray-400">—</span>}</td>
                        <td className="px-6 py-4 text-sm">{patient.gender || '—'}</td>
                        <td className="px-6 py-4 text-sm">{format(new Date(patient.created_at), 'MMM d, yyyy')}</td>
                        <td className="px-6 py-4 text-sm">{invoiceStatusChip(invoice)}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() =>
                                setInvoiceTarget({
                                  patientId: patient.id,
                                  patientName: `${patient.first_name} ${patient.last_name}`.trim(),
                                })
                              }
                              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="Invoice fee"
                            >
                              <ReceiptText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                navigate('/prescriptions', { state: { newPrescriptionPatientId: patient.id } })
                              }
                              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="Write prescription"
                            >
                              <Pill className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleConvert(patient)}
                              className="p-2 text-highlight hover:bg-highlight/10 rounded-lg transition-colors"
                              title="Convert to patient"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => navigate(`/patients/${patient.id}`)}
                              className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              title="View Profile"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEdit(patient)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {canDelete() && (
                              <button
                                onClick={() => handleDelete(patient)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">{editingId ? 'Edit Consultation' : 'Add Consultation'}</h2>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); resetForm() }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
                Only name, age, and sex are required. Everything else is optional and can be filled in later.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Age *</label>
                  <input
                    type="number"
                    min={0}
                    max={130}
                    required={!editingId}
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    placeholder={editingId ? 'Leave blank to keep existing DOB' : ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Sex *</label>
                  <select
                    required
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>

                {!editingId && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Consultation Fee (BDT) *</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={formData.fee}
                      onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowMore((prev) => !prev)}
                className="flex items-center gap-1 text-sm font-medium text-primary"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
                More details (optional)
              </button>

              {showMore && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Notes</label>
                    <textarea
                      rows={2}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1">
                  {editingId ? 'Update Consultation' : 'Add & Invoice Fee'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                    resetForm()
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {invoiceTarget && (
        <InvoiceModal
          invoiceType="basic"
          defaultPatientId={invoiceTarget.patientId}
          defaultPatientName={invoiceTarget.patientName}
          hidePatientSelect
          template={consultationTemplate}
          onClose={() => {
            const { patientId, patientName } = invoiceTarget
            setInvoiceTarget(null)
            setPrescriptionPrompt({ patientId, patientName })
          }}
          onSave={() => {
            const { patientId, patientName } = invoiceTarget
            setInvoiceTarget(null)
            loadConsultations()
            setPrescriptionPrompt({ patientId, patientName })
          }}
        />
      )}

      {prescriptionPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">Write a prescription?</h3>
            <p className="text-sm text-text-secondary">
              Write a prescription for {prescriptionPrompt.patientName} now?
            </p>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={() => {
                  const { patientId } = prescriptionPrompt
                  setPrescriptionPrompt(null)
                  navigate('/prescriptions', { state: { newPrescriptionPatientId: patientId } })
                }}
              >
                Write Prescription
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setPrescriptionPrompt(null)}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
