import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Edit, Trash2, Eye, Users, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { MEMORY_KEYS } from '@/lib/prescriptionMemory'
import { SuggestTextarea } from '@/components/SuggestField'
import { supabase } from '@/lib/supabase'
import { qk } from '@/repositories/keys'
import { fetchPatientsList } from '@/repositories/patientsRepo'
import { createPatient, matchesPatientSearch } from '@/lib/patients'
import { canDelete } from '@/lib/appSession'
import { logDeletion } from '@/lib/deleteHistory'
import { logEdit } from '@/lib/editHistory'
import { format } from 'date-fns'
import { MedicalHistoryFields } from '@/components/MedicalHistoryFields'
import { getMedicalHistoryChecks, buildMedicalHistoryString } from '@/lib/medicalHistory'
import { extractPatientAnniversary } from '@/lib/celebrationReminders'

function deriveDateOfBirthFromAge(age: number) {
  const today = new Date()
  const approximateBirthDate = new Date(today.getFullYear() - age, today.getMonth(), today.getDate())
  return format(approximateBirthDate, 'yyyy-MM-dd')
}

function calculateAgeFromDate(dateOfBirth: string) {
  const birthDate = new Date(dateOfBirth)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDifference = today.getMonth() - birthDate.getMonth()

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

export function Patients() {
  const navigate = useNavigate()
  const { data: patients = [], isLoading: loading, refetch: loadPatients } = useQuery({
    queryKey: qk.patients.list,
    queryFn: fetchPatientsList,
  })
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPatientCode, setEditingPatientCode] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    date_of_birth: '',
    age: '',
    gender: 'Male',
    weight: '',
    anniversary_date: '',
    address: '',
    medical_history: '',
    notes: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedAge = Number.parseInt(formData.age, 10)
    const hasValidAge = !Number.isNaN(parsedAge) && parsedAge >= 0
    const dateOfBirth =
      formData.date_of_birth || (hasValidAge ? deriveDateOfBirthFromAge(parsedAge) : '')

    if (!dateOfBirth) {
      alert('Please provide Date of Birth or Age')
      return
    }

    const parsedWeight = formData.weight.trim() ? Number.parseFloat(formData.weight) : null

    const previous = editingId ? patients.find((p) => p.id === editingId) : null

    // Anniversary date isn't a real column — it rides inside notes as an
    // [anniversary: YYYY-MM-DD] tag. Only rewrite notes when the value
    // actually changed, so saving a patient without touching this field
    // leaves notes byte-identical to what was already saved.
    const existingAnniversary = previous ? extractPatientAnniversary(previous) : null
    const newAnniversary = formData.anniversary_date.trim() || null
    let notesValue = formData.notes
    if (newAnniversary !== existingAnniversary) {
      const stripped = notesValue.replace(/\[anniversary:\s*[^\]]+\]/gi, '').trim()
      notesValue = newAnniversary ? `${stripped ? `${stripped}\n` : ''}[anniversary: ${newAnniversary}]` : stripped
    }

    const { age: _age, anniversary_date: _anniversaryDate, ...patientPayload } = {
      ...formData,
      phone: formData.phone.replace(/\D/g, ''),
      date_of_birth: dateOfBirth,
      weight: parsedWeight,
      notes: notesValue,
    }

    try {
      if (editingId) {
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
          .update(patientPayload as any)
          .eq('id', editingId)
        if (updateError) throw updateError
      } else {
        await createPatient(patientPayload)
      }
      setShowForm(false)
      setEditingId(null)
      resetForm()
      loadPatients()
    } catch (error) {
      console.error('Error saving patient:', error)
      alert('Failed to save patient')
    }
  }

  async function handleDelete(patient: any) {
    if (!canDelete()) return
    if (confirm('Are you sure you want to delete this patient?')) {
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
        loadPatients()
      } catch (error) {
        console.error('Error deleting patient:', error)
        alert('Failed to delete patient')
      }
    }
  }

  function handleEdit(patient: any) {
    setFormData({
      first_name: patient.first_name,
      last_name: patient.last_name,
      phone: patient.phone,
      email: patient.email,
      date_of_birth: patient.date_of_birth,
      age: patient.date_of_birth ? String(calculateAgeFromDate(patient.date_of_birth)) : '',
      gender: patient.gender,
      weight: patient.weight != null ? String(patient.weight) : '',
      anniversary_date: extractPatientAnniversary(patient) || '',
      address: patient.address || '',
      medical_history: patient.medical_history || '',
      notes: patient.notes || '',
    })
    setEditingId(patient.id)
    setEditingPatientCode(patient.patient_code || null)
    setShowForm(true)
  }

  function resetForm() {
    setFormData({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      date_of_birth: '',
      age: '',
      gender: 'Male',
      weight: '',
      anniversary_date: '',
      address: '',
      medical_history: '',
      notes: '',
    })
    setEditingPatientCode(null)
  }

  const filteredPatients = patients.filter((patient) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      matchesPatientSearch(
        { name: `${patient.first_name} ${patient.last_name}`, code: patient.patient_code, phone: patient.phone },
        searchTerm
      ) || (patient.email ?? '').toLowerCase().includes(searchLower)
    )
  })

  const medicalHistoryChecks = getMedicalHistoryChecks(formData.medical_history)

  return (
    <div className="space-y-6 page-fade-in pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-primary/10 shadow-elevation-low">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary">Patients Directory</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {patients.length} Registered
            </span>
          </div>
          <p className="text-sm text-text-secondary">Search, view, and manage complete patient profiles.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="rounded-xl shadow-elevation-md px-5 py-2.5">
          <Plus className="w-4 h-4 mr-2" />
          Add New Patient
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative glass-card bg-white/90 rounded-2xl p-2 shadow-elevation-low border border-primary/10">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-text-muted" />
          <input
            type="text"
            placeholder="Search by patient name, phone number, email, or Patient ID (e.g. PT-00042)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-surface-subtle/80 border border-gray-200/80 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 text-text-muted hover:text-text-primary p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="spinner" />
        </div>
      ) : filteredPatients.length === 0 && !searchTerm ? (
        <div className="glass-card bg-white/90 rounded-3xl shadow-elevation-low border border-primary/10 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-subtle text-text-muted mx-auto flex items-center justify-center mb-4">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-text-primary mb-1">No Patients Registered Yet</h3>
          <p className="text-xs text-text-secondary mb-5 max-w-sm mx-auto">Get started by creating your first patient record to begin tracking appointments, treatments, and prescriptions.</p>
          <Button onClick={() => setShowForm(true)} className="rounded-xl shadow-elevation-md">
            <Plus className="w-4 h-4 mr-2" />
            Add First Patient
          </Button>
        </div>
      ) : (
        <div className="glass-card bg-white/90 rounded-3xl shadow-elevation-low border border-primary/10 overflow-hidden">
          {filteredPatients.length === 0 ? (
            <div className="p-12 text-center">
              <Search className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-text-primary mb-1">No Patients Found</p>
              <p className="text-xs text-text-secondary">No records match <span className="font-mono font-bold text-primary">"{searchTerm}"</span></p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-subtle/80 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">Patient Code</th>
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">Patient Name</th>
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">Contact Info</th>
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">Date of Birth / Age</th>
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">Gender</th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/80">
                  {filteredPatients.map((patient) => {
                    const dobFormatted = patient.date_of_birth ? format(new Date(patient.date_of_birth), 'MMM d, yyyy') : '—'
                    const ageCalculated = patient.date_of_birth ? calculateAgeFromDate(patient.date_of_birth) : null

                    return (
                      <tr key={patient.id} className="hover:bg-primary-surface/60 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {patient.patient_code ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold font-mono bg-primary/10 text-primary border border-primary/20">
                              {patient.patient_code}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div
                            className="flex items-center gap-3.5 cursor-pointer"
                            onClick={() => navigate(`/patients/${patient.id}`)}
                          >
                            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-bright rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-elevation-low shrink-0">
                              {patient.first_name?.[0] || '?'}
                            </div>
                            <div>
                              <span className="font-semibold text-text-primary text-sm group-hover:text-primary transition-colors">
                                {patient.first_name} {patient.last_name}
                              </span>
                              {patient.address && (
                                <p className="text-xs text-text-secondary truncate max-w-xs">{patient.address}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-text-primary">
                          <div className="font-mono">{patient.phone}</div>
                          {patient.email && <div className="text-text-secondary text-[11px] mt-0.5">{patient.email}</div>}
                        </td>
                        <td className="px-6 py-4 text-xs text-text-primary">
                          <span className="font-medium">{dobFormatted}</span>
                          {ageCalculated !== null && (
                            <span className="ml-2 text-[11px] font-semibold text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full">
                              {ageCalculated} yrs
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            patient.gender === 'Female'
                              ? 'bg-highlight/10 text-highlight border border-highlight/20'
                              : 'bg-teal-50 text-teal-700 border border-teal-200'
                          }`}>
                            {patient.gender}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/patients/${patient.id}`)}
                              className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-colors"
                              title="View Patient Profile"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEdit(patient)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Edit Patient Details"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {canDelete() && (
                              <button
                                onClick={() => handleDelete(patient)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                title="Delete Record"
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

      {/* Patient Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card bg-white rounded-3xl shadow-elevation-high max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-primary/15">
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md flex items-center justify-between z-10">
              <div>
                <h2 className="font-display text-xl font-bold text-text-primary">
                  {editingId ? 'Edit Patient Record' : 'Register New Patient'}
                </h2>
                <p className="text-xs text-text-secondary">Fill in patient identification and clinical details</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm() }}
                className="p-2 text-text-muted hover:text-text-primary hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
              {editingId ? (
                <div className="flex items-center gap-3 p-3.5 bg-primary/5 rounded-2xl border border-primary/15">
                  <span className="text-xs font-semibold text-text-secondary">Assigned Patient ID:</span>
                  {editingPatientCode ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold font-mono bg-primary text-white shadow-sm">
                      {editingPatientCode}
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted italic">Assigned automatically on save</span>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-blue-50/70 rounded-2xl border border-blue-100 text-xs font-medium text-blue-800">
                  Patient Code (e.g. <span className="font-mono font-bold">PT-00042</span>) will be generated automatically upon saving.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    placeholder="Enter first name"
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder="Enter last name"
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="01700000000"
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    required={!formData.age}
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Age (Years)</label>
                  <input
                    type="number"
                    min={0}
                    max={130}
                    value={formData.age}
                    onChange={(e) => {
                      const value = e.target.value
                      const parsed = Number.parseInt(value, 10)
                      const derivedDob =
                        value.trim() && !Number.isNaN(parsed) && parsed >= 0
                          ? deriveDateOfBirthFromAge(parsed)
                          : formData.date_of_birth
                      setFormData({ ...formData, age: value, date_of_birth: derivedDob })
                    }}
                    required={!formData.date_of_birth}
                    placeholder="Age if DOB is unknown"
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Gender *</label>
                  <select
                    required
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Weight (kg)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    placeholder="Optional (e.g. 65.5)"
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Anniversary Date</label>
                  <input
                    type="date"
                    value={formData.anniversary_date}
                    onChange={(e) => setFormData({ ...formData, anniversary_date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                  />
                  <p className="mt-1 text-[11px] text-text-secondary">Optional — powers the Celebrations reminder on the Dashboard</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street address or city"
                  className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Medical History</label>
                <MedicalHistoryFields
                  checked={medicalHistoryChecks.items.filter((i) => i.checked).map((i) => i.label)}
                  other={medicalHistoryChecks.other}
                  drugHistoryNote={medicalHistoryChecks.drugHistoryNote}
                  onChange={({ checked, other, drugHistoryNote }) =>
                    setFormData({ ...formData, medical_history: buildMedicalHistoryString(checked, other, drugHistoryNote) })
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wider">Clinical Notes</label>
                <SuggestTextarea
                  memoryKey={MEMORY_KEYS.PATIENT_NOTES}
                  sectionLabel="Patient Notes"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 bg-surface-subtle rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <Button type="submit" className="flex-1 py-3 rounded-xl font-semibold shadow-elevation-md">
                  {editingId ? 'Save Patient Changes' : 'Save Patient Record'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                    resetForm()
                  }}
                  className="flex-1 py-3 rounded-xl font-semibold"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
