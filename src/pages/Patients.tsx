import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

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

    const patientPayload = {
      ...formData,
      date_of_birth: dateOfBirth,
    }

    delete patientPayload.age

    try {
      if (editingId) {
        await supabase
          .from('patients')
          .update(patientPayload)
          .eq('id', editingId)
      } else {
        await supabase.from('patients').insert([patientPayload])
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
  }

  const filteredPatients = patients.filter((patient) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      patient.first_name.toLowerCase().includes(searchLower) ||
      patient.last_name.toLowerCase().includes(searchLower) ||
      patient.phone.includes(searchTerm) ||
      patient.email.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="space-y-6">
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
          placeholder="Search patients..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">DOB</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Gender</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium">
                        {patient.first_name} {patient.last_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div>{patient.phone}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {format(new Date(patient.date_of_birth), 'MMM d, yyyy')}
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
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(patient.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">{editingId ? 'Edit Patient' : 'Add New Patient'}</h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                <textarea
                  rows={3}
                  value={formData.medical_history}
                  onChange={(e) => setFormData({ ...formData, medical_history: e.target.value })}
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
