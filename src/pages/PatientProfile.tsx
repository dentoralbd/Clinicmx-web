import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Calendar as CalendarIcon, FileText, Activity, DollarSign, Pill, Trash2, Edit } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

export function PatientProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<any>(null)
  const [visits, setVisits] = useState<any[]>([])
  const [dentalRecords, setDentalRecords] = useState<any[]>([])
  const [treatments, setTreatments] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'visits' | 'dental-chart' | 'treatments' | 'prescriptions' | 'appointments' | 'billing'>('overview')
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false)

  const [visitForm, setVisitForm] = useState({
    chief_complaint: '',
    examination_findings: '',
    diagnosis: '',
    treatment_plan: '',
    notes: '',
  })

  const [prescriptionForm, setPrescriptionForm] = useState({
    diagnosis: '',
    medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }],
    investigations: [{ name: '', description: '' }],
    notes: '',
  })

  useEffect(() => {
    if (id) {
      loadPatientData()
    }
  }, [id])

  async function loadPatientData() {
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

      setPatient(patientData)
      setVisits(visitsData || [])
      setDentalRecords(dentalData || [])
      setTreatments(treatmentsData || [])
      setPrescriptions(prescriptionsData || [])
      setAppointments(appointmentsData || [])
      setInvoices(invoicesData || [])
    } catch (error) {
      console.error('Error loading patient:', error)
    } finally {
      setLoading(false)
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
      await supabase.from('prescriptions').insert([{
        patient_id: id,
        prescribed_date: format(new Date(), 'yyyy-MM-dd'),
        diagnosis: prescriptionForm.diagnosis,
        medications: prescriptionForm.medications.filter(m => m.name.trim()),
        investigations: prescriptionForm.investigations.filter(i => i.name.trim()),
        notes: prescriptionForm.notes,
      }])
      setShowPrescriptionForm(false)
      setPrescriptionForm({
        diagnosis: '',
        medications: [{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }],
        investigations: [{ name: '', description: '' }],
        notes: '',
      })
      loadPatientData()
    } catch (error) {
      console.error('Error saving prescription:', error)
      alert('Failed to save prescription')
    }
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

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  if (!patient) {
    return <div className="p-6">Patient not found</div>
  }

  const totalBilled = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0)
  const totalDue = totalBilled - totalPaid

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/patients')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {patient.first_name} {patient.last_name}
          </h1>
          <p className="text-text-secondary">{patient.phone || 'No phone provided'}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</TabButton>
        <TabButton active={activeTab === 'visits'} onClick={() => setActiveTab('visits')}>Visits ({visits.length})</TabButton>
        <TabButton active={activeTab === 'dental-chart'} onClick={() => setActiveTab('dental-chart')}>Dental Chart</TabButton>
        <TabButton active={activeTab === 'treatments'} onClick={() => setActiveTab('treatments')}>Treatments ({treatments.length})</TabButton>
        <TabButton active={activeTab === 'prescriptions'} onClick={() => setActiveTab('prescriptions')}>Prescriptions ({prescriptions.length})</TabButton>
        <TabButton active={activeTab === 'appointments'} onClick={() => setActiveTab('appointments')}>Appointments ({appointments.length})</TabButton>
        <TabButton active={activeTab === 'billing'} onClick={() => setActiveTab('billing')}>Billing</TabButton>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <InfoCard title="Patient Information">
            <InfoRow label="DOB" value={format(new Date(patient.date_of_birth), 'MMM d, yyyy')} />
            <InfoRow label="Gender" value={patient.gender} />
            <InfoRow label="Address" value={patient.address || 'N/A'} />
            {patient.medical_history && <InfoRow label="Medical History" value={patient.medical_history} />}
          </InfoCard>

          <InfoCard title="Treatment Summary">
            <InfoRow label="Total Treatments" value={treatments.length.toString()} />
            <InfoRow label="Completed" value={treatments.filter(t => t.status === 'Completed').length.toString()} />
            <InfoRow label="In Progress" value={treatments.filter(t => t.status === 'In Progress').length.toString()} />
            <InfoRow label="Planned" value={treatments.filter(t => t.status === 'Planned').length.toString()} />
          </InfoCard>

          <InfoCard title="Billing Summary">
            <InfoRow label="Total Billed" value={`৳${totalBilled.toFixed(2)}`} />
            <InfoRow label="Total Paid" value={`৳${totalPaid.toFixed(2)}`} />
            <InfoRow label="Balance Due" value={`৳${totalDue.toFixed(2)}`} className={totalDue > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'} />
          </InfoCard>

          <div className="md:col-span-2 lg:col-span-3">
            <InfoCard title="Recent Activity">
              <div className="space-y-3">
                {visits.slice(0, 3).map((visit) => (
                  <div key={visit.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <CalendarIcon className="w-5 h-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">{format(new Date(visit.visit_date), 'MMM d, yyyy')}</div>
                      <div className="text-sm text-text-secondary">{visit.chief_complaint || 'No complaint'}</div>
                      {visit.diagnosis && <div className="text-sm"><span className="font-medium">Diagnosis:</span> {visit.diagnosis}</div>}
                    </div>
                  </div>
                ))}
                {visits.length === 0 && <p className="text-text-secondary text-sm">No visits recorded</p>}
              </div>
            </InfoCard>
          </div>
        </div>
      )}

      {activeTab === 'visits' && (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200">
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
                    <span className="font-medium">{format(new Date(visit.visit_date), 'MMMM d, yyyy h:mm a')}</span>
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
      )}

      {activeTab === 'dental-chart' && (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold mb-6 text-center">Dental Chart</h3>
          <div className="space-y-8">
            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-4 text-center">Upper Teeth</h4>
              <div className="flex justify-center gap-2 flex-wrap">
                {[...Array(16)].map((_, i) => {
                  const toothNum = i + 1
                  const condition = getToothCondition(toothNum)
                  return (
                    <Tooth
                      key={toothNum}
                      number={toothNum}
                      condition={condition}
                      color={getToothColor(condition)}
                      onClick={() => setSelectedTooth(toothNum)}
                    />
                  )
                })}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text-secondary mb-4 text-center">Lower Teeth</h4>
              <div className="flex justify-center gap-2 flex-wrap">
                {[...Array(16)].map((_, i) => {
                  const toothNum = i + 17
                  const condition = getToothCondition(toothNum)
                  return (
                    <Tooth
                      key={toothNum}
                      number={toothNum}
                      condition={condition}
                      color={getToothColor(condition)}
                      onClick={() => setSelectedTooth(toothNum)}
                    />
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-center pt-4 border-t border-gray-200">
              <Legend color="fill-white stroke-gray-400" label="Healthy" />
              <Legend color="fill-red-200 stroke-red-500" label="Cavity" />
              <Legend color="fill-blue-200 stroke-blue-500" label="Filled" />
              <Legend color="fill-purple-200 stroke-purple-500" label="Root Canal" />
              <Legend color="fill-yellow-200 stroke-yellow-600" label="Crown" />
              <Legend color="fill-gray-300 stroke-gray-500" label="Missing" />
              <Legend color="fill-green-200 stroke-green-500" label="Implant" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'treatments' && (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold">Treatment History</h3>
          </div>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {treatments.map((treatment) => (
                    <tr key={treatment.id}>
                      <td className="px-4 py-3 text-sm">{format(new Date(treatment.created_at), 'MMM d, yyyy')}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{treatment.treatment_type}</div>
                        {treatment.description && <div className="text-sm text-text-secondary">{treatment.description}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm">{treatment.tooth_number || 'N/A'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          treatment.status === 'Completed' ? 'bg-green-100 text-green-800' :
                          treatment.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {treatment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">৳{treatment.cost?.toFixed(2) || '0.00'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'prescriptions' && (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold">Prescription History</h3>
            <Button size="sm" onClick={() => setShowPrescriptionForm(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Prescription
            </Button>
          </div>
          {prescriptions.length === 0 ? (
            <div className="p-8 text-center text-text-secondary">No prescriptions recorded</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {prescriptions.map((prescription) => (
                <div key={prescription.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">{format(new Date(prescription.prescribed_date), 'MMMM d, yyyy')}</div>
                  </div>
                  {prescription.diagnosis && (
                    <div className="mb-3">
                      <span className="text-sm font-medium text-text-secondary">Diagnosis: </span>
                      <span className="text-sm">{prescription.diagnosis}</span>
                    </div>
                  )}
                  {Array.isArray(prescription.medications) && prescription.medications.length > 0 && (
                    <div className="mb-3">
                      <div className="text-sm font-medium text-text-secondary mb-2">Medications:</div>
                      <div className="space-y-2">
                        {prescription.medications.map((med: any, idx: number) => (
                          <div key={idx} className="text-sm bg-blue-50 p-2 rounded">
                            <div className="font-medium">{med.name}</div>
                            <div className="text-text-secondary">
                              {med.dosage} • {med.frequency} • {med.duration}
                              {med.instructions && ` • ${med.instructions}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(prescription.investigations) && prescription.investigations.length > 0 && (
                    <div className="mb-3">
                      <div className="text-sm font-medium text-text-secondary mb-2">Investigations:</div>
                      <div className="space-y-1">
                        {prescription.investigations.map((inv: any, idx: number) => (
                          <div key={idx} className="text-sm bg-green-50 p-2 rounded">
                            <span className="font-medium">{inv.name}</span>
                            {inv.description && <span className="text-text-secondary"> - {inv.description}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {prescription.notes && (
                    <div className="text-sm">
                      <span className="font-medium text-text-secondary">Notes: </span>
                      {prescription.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'appointments' && (
        <div className="bg-card rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold">Appointment History</h3>
          </div>
          {appointments.length === 0 ? (
            <div className="p-8 text-center text-text-secondary">No appointments recorded</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {appointments.map((appointment) => (
                <div key={appointment.id} className="p-4 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{format(new Date(appointment.date_time), 'MMMM d, yyyy h:mm a')}</div>
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
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm text-blue-600 font-medium">Total Billed</div>
              <div className="text-2xl font-bold text-blue-900">৳{totalBilled.toFixed(2)}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-sm text-green-600 font-medium">Total Paid</div>
              <div className="text-2xl font-bold text-green-900">৳{totalPaid.toFixed(2)}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm text-red-600 font-medium">Balance Due</div>
              <div className="text-2xl font-bold text-red-900">৳{totalDue.toFixed(2)}</div>
            </div>
          </div>

          <div className="bg-card rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold">Invoice History</h3>
            </div>
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">No invoices recorded</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Paid</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Due</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="px-4 py-3 text-sm">{format(new Date(invoice.created_at), 'MMM d, yyyy')}</td>
                        <td className="px-4 py-3 text-sm">
                          {Array.isArray(invoice.items) ? invoice.items.length : 0} item(s)
                        </td>
                        <td className="px-4 py-3 text-sm">৳{invoice.total_amount?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">৳{invoice.paid_amount?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">৳{(invoice.total_amount - invoice.paid_amount)?.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            invoice.status === 'Paid' ? 'bg-green-100 text-green-800' :
                            invoice.status === 'Partial' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
          onClose={() => setShowPrescriptionForm(false)}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
        active
          ? 'border-b-2 border-primary text-primary'
          : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}

function InfoCard({ title, children }: any) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-gray-200 p-6">
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

function Tooth({ number, condition, color, onClick }: any) {
  return (
    <div className="flex flex-col items-center cursor-pointer group" onClick={onClick}>
      <svg width="32" height="48" viewBox="0 0 32 48" className={`${color} group-hover:opacity-75 transition-opacity`}>
        <path
          d="M16 2 C10 2, 6 6, 6 12 C6 18, 8 24, 10 32 C11 36, 12 42, 16 46 C20 42, 21 36, 22 32 C24 24, 26 18, 26 12 C26 6, 22 2, 16 2 Z"
          strokeWidth="2"
        />
      </svg>
      <span className="text-xs font-medium mt-1">{number}</span>
    </div>
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

function PrescriptionFormModal({ formData, setFormData, onSubmit, onClose }: any) {
  function addMedication() {
    setFormData({
      ...formData,
      medications: [...formData.medications, { name: '', dosage: '', frequency: '', duration: '', instructions: '' }],
    })
  }

  function addInvestigation() {
    setFormData({
      ...formData,
      investigations: [...formData.investigations, { name: '', description: '' }],
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold">Add Prescription</h2>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Medications</label>
              <Button type="button" size="sm" onClick={addMedication}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {formData.medications.map((med: any, index: number) => (
                <div key={index} className="grid grid-cols-5 gap-2 p-2 bg-gray-50 rounded">
                  <input
                    type="text"
                    placeholder="Name"
                    value={med.name}
                    onChange={(e) => {
                      const newMeds = [...formData.medications]
                      newMeds[index].name = e.target.value
                      setFormData({ ...formData, medications: newMeds })
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Dosage"
                    value={med.dosage}
                    onChange={(e) => {
                      const newMeds = [...formData.medications]
                      newMeds[index].dosage = e.target.value
                      setFormData({ ...formData, medications: newMeds })
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Frequency"
                    value={med.frequency}
                    onChange={(e) => {
                      const newMeds = [...formData.medications]
                      newMeds[index].frequency = e.target.value
                      setFormData({ ...formData, medications: newMeds })
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Duration"
                    value={med.duration}
                    onChange={(e) => {
                      const newMeds = [...formData.medications]
                      newMeds[index].duration = e.target.value
                      setFormData({ ...formData, medications: newMeds })
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Instructions"
                    value={med.instructions}
                    onChange={(e) => {
                      const newMeds = [...formData.medications]
                      newMeds[index].instructions = e.target.value
                      setFormData({ ...formData, medications: newMeds })
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Investigations</label>
              <Button type="button" size="sm" onClick={addInvestigation}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {formData.investigations.map((inv: any, index: number) => (
                <div key={index} className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded">
                  <input
                    type="text"
                    placeholder="Investigation name"
                    value={inv.name}
                    onChange={(e) => {
                      const newInvs = [...formData.investigations]
                      newInvs[index].name = e.target.value
                      setFormData({ ...formData, investigations: newInvs })
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={inv.description}
                    onChange={(e) => {
                      const newInvs = [...formData.investigations]
                      newInvs[index].description = e.target.value
                      setFormData({ ...formData, investigations: newInvs })
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              ))}
            </div>
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
            <Button type="submit" className="flex-1">Save Prescription</Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
