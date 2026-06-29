import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Eye, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { createPatient } from '@/lib/patients'
import { format } from 'date-fns'
import { MedicalHistoryFields } from '@/components/MedicalHistoryFields'
import { getMedicalHistoryChecks, buildMedicalHistoryString } from '@/lib/medicalHistory'

const avatarColors = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
]

function getAvatarColor(id: string) {
  return avatarColors[id.charCodeAt(0) % avatarColors.length]
}

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
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
    address: '',
    medical_history: '',
    notes: '',
  })

  useEffect(() => {
    loadPatients()
  }, [])

  async function loadPatients() {
    try {
      setLoading(true)
      const { data } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })
      setPatients(data || [])
    } catch (error) {
      console.error('Error loading patients:', error)
    } finally {
      setLoading(false)
    }
  }

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

    const { age: _age, ...patientPayload } = {
      ...formData,
      date_of_birth: dateOfBirth,
    }

    try {
      if (editingId) {
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

  async function handleDelete(id: string) {
    if (confirm('Are you sure you want to delete this patient?')) {
      try {
        await supabase.from('patients').delete().eq('id', id)
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
      address: '',
      medical_history: '',
      notes: '',
    })
    setEditingPatientCode(null)
  }

  const filteredPatients = patients.filter((patient) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      patient.first_name.toLowerCase().includes(searchLower) ||
      patient.last_name.toLowerCase().includes(searchLower) ||
      (patient.phone ?? '').includes(searchTerm) ||
      (patient.email ?? '').toLowerCase().includes(searchLower) ||
      (patient.patient_code && patient.patient_code.toLowerCase().includes(searchLower))
    )
  })

  return (
    <div className="space-y-6 page-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="text-text-secondary">Manage patient records</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Patient
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" />
        <input
          type="text"
          placeholder="Search by name, phone, email, or patient ID..."
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
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-text-secondary font-medium mb-3">No patients yet</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add First Patient
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredPatients.length === 0 ? (
            <p className="text-center text-text-secondary py-8">No patients match your search</p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">DOB</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Gender</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {patient.patient_code ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                          {patient.patient_code}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 ${getAvatarColor(patient.id)} rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                          {patient.first_name?.[0] || '?'}
                        </div>
                        <span className="font-medium group-hover:text-primary transition-colors">
                          {patient.first_name} {patient.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div>{patient.phone}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {patient.date_of_birth ? format(new Date(patient.date_of_birth), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">{patient.gender}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
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
                        <button
                          onClick={() => handleDelete(patient.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold">{editingId ? 'Edit Patient' : 'Add New Patient'}</h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {editingId && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="text-sm text-text-secondary font-medium">Patient ID:</span>
                  {editingPatientCode ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-primary/10 text-primary border border-primary/20">
                      {editingPatientCode}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Not yet assigned</span>
                  )}
                </div>
              )}
              {!editingId && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
                  A unique Patient ID (e.g. PT-00042) will be auto-assigned when this patient is saved.
                </div>
              )}
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
                  <label className="block text-sm font-medium mb-1">Phone *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    required={!formData.age}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Age</label>
                  <input
                    type="number"
                    min={0}
                    max={130}
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    required={!formData.date_of_birth}
                    placeholder="Enter age if DOB is unknown"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Gender *</label>
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

                <p className="text-sm text-text-secondary">Provide either Date of Birth or Age.</p>
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

              <div>
                <label className="block text-sm font-medium mb-1">Medical History</label>
                <MedicalHistoryFields
                  checked={getMedicalHistoryChecks(formData.medical_history).items.filter((i) => i.checked).map((i) => i.label)}
                  other={getMedicalHistoryChecks(formData.medical_history).other}
                  onChange={({ checked, other }) =>
                    setFormData({ ...formData, medical_history: buildMedicalHistoryString(checked, other) })
                  }
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
                <Button type="submit" className="flex-1">
                  {editingId ? 'Update Patient' : 'Add Patient'}
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
    </div>
  )
}
