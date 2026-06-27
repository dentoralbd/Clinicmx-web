import { useState, useEffect } from 'react'
import { UserCircle, Stethoscope, Save, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { loadDoctorProfile, saveDoctorProfile, isDoctorProfileAuthError, type DoctorProfileData } from '@/lib/doctorProfile'

const empty: DoctorProfileData = {
  full_name: '',
  degrees: '',
  designation: '',
  workplace: '',
  clinic_address: '',
  phone: '',
  email: '',
  bmdc_reg: '',
}

export function DoctorProfile() {
  const [form, setForm] = useState<DoctorProfileData>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    try {
      const data = await loadDoctorProfile()
      if (data) setForm(data)
    } catch (err) {
      console.error('Error loading doctor profile:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = await saveDoctorProfile(form)
      if (data) setForm(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      console.error('Error saving doctor profile:', err)
      if (isDoctorProfileAuthError(err)) {
        alert('You must be logged in to save your profile.')
        return
      }
      alert(`Failed to save profile: ${err?.message || String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const field = (
    label: string,
    key: keyof DoctorProfileData,
    placeholder = '',
    type: 'input' | 'textarea' = 'input'
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea
          rows={2}
          value={form[key] as string}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
        />
      ) : (
        <input
          type="text"
          value={form[key] as string}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 page-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-primary via-[#1b4e70] to-slate-900 rounded-3xl p-6 flex items-center gap-4 text-white">
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Doctor Profile</h1>
          <p className="text-blue-200 text-sm mt-0.5">Your credentials appear on every prescription</p>
        </div>
        {saved && (
          <div className="ml-auto flex items-center gap-2 bg-green-500/30 text-green-100 px-3 py-2 rounded-xl text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Saved!
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Personal Information */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCircle className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-gray-800">Personal Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Full Name', 'full_name', 'Dr. Jane Smith')}
            {field('BMDC Registration No.', 'bmdc_reg', 'e.g., A-12345')}
          </div>
        </div>

        {/* Credentials */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Credentials</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Degrees / Qualifications', 'degrees', 'e.g., BDS, FCPS (Oral Surgery)', 'textarea')}
            {field('Designation', 'designation', 'e.g., Senior Dental Surgeon')}
          </div>
        </div>

        {/* Practice Information */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Practice Information</h2>
          <div className="grid grid-cols-1 gap-4">
            {field('Workplace / Clinic Name', 'workplace', 'e.g., City Dental Hospital, Dhaka')}
            {field('Clinic Address', 'clinic_address', 'Full address', 'textarea')}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Phone', 'phone', '+880 1xxx-xxxxxx')}
              {field('Email', 'email', 'doctor@clinic.com')}
            </div>
          </div>
        </div>

        {/* Prescription Header Preview */}
        {(form.full_name || form.degrees || form.designation || form.workplace) && (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Prescription Header Preview</h2>
            <div className="border border-gray-300 rounded-xl p-4 bg-gray-50">
              <PrescriptionHeaderPreview doctor={form} />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="flex items-center gap-2 px-6">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function PrescriptionHeaderPreview({ doctor }: { doctor: DoctorProfileData }) {
  return (
    <div className="font-serif text-sm text-gray-900">
      <div className="flex justify-between items-start">
        <div>
          {doctor.full_name && (
            <div className="text-lg font-bold text-primary">Dr. {doctor.full_name.replace(/^Dr\.?\s*/i, '')}</div>
          )}
          {doctor.degrees && <div className="text-gray-600 text-xs">{doctor.degrees}</div>}
          {doctor.designation && <div className="text-gray-700 text-sm font-medium">{doctor.designation}</div>}
          {doctor.workplace && <div className="text-gray-600 text-xs">{doctor.workplace}</div>}
          {doctor.clinic_address && <div className="text-gray-500 text-xs">{doctor.clinic_address}</div>}
          {(doctor.bmdc_reg || doctor.phone) && (
            <div className="text-gray-500 text-xs mt-1">
              {doctor.bmdc_reg && <span>BMDC: {doctor.bmdc_reg}</span>}
              {doctor.bmdc_reg && doctor.phone && <span> · </span>}
              {doctor.phone && <span>Ph: {doctor.phone}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
