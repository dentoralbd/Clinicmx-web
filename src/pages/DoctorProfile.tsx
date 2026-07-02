import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import {
  Stethoscope,
  Save,
  CheckCircle,
  UserCircle,
  GraduationCap,
  Award,
  Building2,
  Phone,
  Mail,
  BadgeCheck,
  FileText,
  Plus,
  X,
  Upload,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { loadDoctorProfile, saveDoctorProfile, isDoctorProfileAuthError, type DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource, stripLightBackground } from '@/lib/logoImage'

const DEFAULT_LOGO = '/logo.png'

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

const PROFILE_FIELDS: (keyof DoctorProfileData)[] = [
  'full_name',
  'degrees',
  'designation',
  'workplace',
  'clinic_address',
  'phone',
  'email',
  'bmdc_reg',
]

function stripDrPrefix(name: string) {
  return name.replace(/^Dr\.?\s*/i, '').trim()
}

function initialsOf(name: string) {
  const clean = stripDrPrefix(name)
  if (!clean) return ''
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function splitDegrees(degrees: string): string[] {
  return degrees.split('\n').map((line) => line.trim()).filter(Boolean)
}

export function DoctorProfile() {
  const [form, setForm] = useState<DoctorProfileData>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [defaultLogo, setDefaultLogo] = useState(DEFAULT_LOGO)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProfile()
    let cancelled = false
    cleanLogoSource(DEFAULT_LOGO).then((src) => {
      if (!cancelled) setDefaultLogo(src)
    })
    return () => {
      cancelled = true
    }
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
      const cleaned: DoctorProfileData = { ...form, degrees: splitDegrees(form.degrees).join('\n') }
      const data = await saveDoctorProfile(cleaned)
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

  // Degrees are stored newline-joined in the single `degrees` column;
  // each line prints separately on the prescription letterhead.
  const degreeRows = form.degrees === '' ? [''] : form.degrees.split('\n')

  function setDegreeRows(rows: string[]) {
    setForm({ ...form, degrees: rows.join('\n') })
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        // Downscale so the data URL stays small enough for local storage
        const scale = Math.min(1, 240 / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        stripLightBackground(canvas)
        setForm((f) => ({ ...f, logo_data: canvas.toDataURL('image/png') }))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const filledCount = PROFILE_FIELDS.filter((k) => ((form[k] as string) || '').trim() !== '').length
  const completeness = Math.round((filledCount / PROFILE_FIELDS.length) * 100)
  const initials = initialsOf(form.full_name)

  const field = (
    label: string,
    key: keyof DoctorProfileData,
    placeholder = '',
    opts: { textarea?: boolean; icon?: typeof UserCircle; hint?: string } = {}
  ) => {
    const Icon = opts.icon
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        {opts.textarea ? (
          <textarea
            rows={2}
            value={form[key] as string}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
          />
        ) : (
          <div className="relative">
            {Icon && (
              <Icon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            )}
            <input
              type="text"
              value={form[key] as string}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              placeholder={placeholder}
              className={`w-full ${Icon ? 'pl-9' : 'px-3'} pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm`}
            />
          </div>
        )}
        {opts.hint && <p className="text-xs text-gray-400 mt-1">{opts.hint}</p>}
      </div>
    )
  }

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
    <form onSubmit={handleSave} className="max-w-6xl mx-auto space-y-6 page-fade-in">
      {/* Hero banner — live identity card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-primary via-[#1b4e70] to-slate-900 rounded-3xl p-6 text-white">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 right-24 w-36 h-36 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center flex-shrink-0 text-xl font-bold tracking-wide">
            {initials || <Stethoscope className="w-8 h-8" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold truncate">
              {form.full_name ? `Dr. ${stripDrPrefix(form.full_name)}` : 'Doctor Profile'}
            </h1>
            <p className="text-blue-200 text-sm mt-0.5 truncate">
              {form.designation || 'Your credentials appear on every prescription'}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 max-w-[220px] rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <span className="text-xs text-blue-100 whitespace-nowrap">
                {completeness === 100 ? 'Profile complete' : `${completeness}% complete`}
              </span>
            </div>
          </div>
          {saved ? (
            <div className="flex items-center gap-2 bg-green-500/30 text-green-100 px-3 py-2 rounded-xl text-sm font-medium flex-shrink-0">
              <CheckCircle className="w-4 h-4" />
              Saved!
            </div>
          ) : (
            form.bmdc_reg && (
              <div className="hidden sm:flex items-center gap-1.5 bg-white/10 border border-white/20 px-3 py-1.5 rounded-full text-xs flex-shrink-0">
                <BadgeCheck className="w-4 h-4 text-emerald-300" />
                BMDC {form.bmdc_reg}
              </div>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
        {/* Left column — form sections */}
        <div className="space-y-5">
          {/* Personal Information */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <UserCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-800">Personal Information</h2>
                <p className="text-xs text-gray-400">Prints on the left side of the prescription header</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Full Name', 'full_name', 'Dr. Jane Smith', { icon: UserCircle })}
              {field('BMDC Registration No.', 'bmdc_reg', 'e.g., A-12345', {
                icon: BadgeCheck,
                hint: 'Printed under your credentials for verification',
              })}
            </div>
          </div>

          {/* Credentials — multiple degrees */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-800">Credentials</h2>
                <p className="text-xs text-gray-400">Each degree prints on its own line under your name</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Degrees / Qualifications</label>
              <div className="space-y-2">
                {degreeRows.map((deg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <GraduationCap className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={deg}
                        onChange={(e) => {
                          const rows = [...degreeRows]
                          rows[i] = e.target.value
                          setDegreeRows(rows)
                        }}
                        placeholder={i === 0 ? 'e.g., BDS (Dhaka Dental College)' : 'e.g., FCPS (Oral & Maxillofacial Surgery)'}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                      />
                    </div>
                    {degreeRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDegreeRows(degreeRows.filter((_, idx) => idx !== i))}
                        className="w-8 h-8 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center flex-shrink-0 transition-colors"
                        title="Remove this degree"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDegreeRows([...degreeRows, ''])}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Plus className="w-4 h-4" />
                Add another degree
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Designation', 'designation', 'e.g., Senior Dental Surgeon', { icon: Award })}
            </div>
          </div>

          {/* Practice Information + logo */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-800">Practice Information</h2>
                <p className="text-xs text-gray-400">Prints on the right side of the prescription header</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {field('Workplace / Clinic Name', 'workplace', 'e.g., City Dental Hospital, Dhaka', {
                icon: Building2,
              })}
              {field('Clinic Address', 'clinic_address', 'Full address', { textarea: true })}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {field('Phone', 'phone', '+880 1xxx-xxxxxx', { icon: Phone })}
                {field('Email', 'email', 'doctor@clinic.com', { icon: Mail })}
              </div>
            </div>

            {/* Logo — centered on the prescription header */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Prescription Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img
                    src={form.logo_data || defaultLogo}
                    alt="Prescription logo"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      {form.logo_data ? 'Change logo' : 'Upload custom logo'}
                    </button>
                    {form.logo_data && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, logo_data: undefined })}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset to clinic logo
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    Shown at the center of the prescription header. Stored on this device.
                  </p>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column — live letterhead preview + save */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                <h2 className="font-semibold text-gray-800 text-sm truncate">Prescription Header</h2>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium whitespace-nowrap">
                Live preview
              </span>
            </div>
            <div className="p-4 bg-gray-100">
              <LetterheadPreview doctor={form} defaultLogo={defaultLogo} />
            </div>
            <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
              Doctor info at left, logo centered, practice info at right — exactly as it prints.
            </p>
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-6"
          >
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Profile'}
          </Button>
        </div>
      </div>
    </form>
  )
}

/**
 * Mirrors the letterhead block in PrescriptionPrint.tsx — keep the two in sync
 * so this preview stays faithful to the printed output.
 */
function LetterheadPreview({ doctor, defaultLogo }: { doctor: DoctorProfileData; defaultLogo: string }) {
  const degreeLines = splitDegrees(doctor.degrees)
  return (
    <div
      className="bg-white shadow-md rounded-sm p-4 text-gray-900"
      style={{ fontFamily: "'Times New Roman', Times, serif" }}
    >
      <div className="border-b-2 border-gray-800 pb-3">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
          {/* Left — doctor information */}
          <div className="min-w-0">
            <div
              className={`text-sm font-bold leading-tight ${
                doctor.full_name ? 'text-gray-900' : 'text-gray-300'
              }`}
            >
              {doctor.full_name ? `Dr. ${stripDrPrefix(doctor.full_name)}` : 'Doctor Name'}
            </div>
            {degreeLines.map((line, idx) => (
              <div key={idx} className="text-[11px] text-gray-600 mt-0.5">{line}</div>
            ))}
            {doctor.designation && (
              <div className="text-[11px] font-semibold text-gray-700 mt-0.5">{doctor.designation}</div>
            )}
            {doctor.bmdc_reg && (
              <div className="text-[10px] text-gray-500 mt-1">BMDC Reg: {doctor.bmdc_reg}</div>
            )}
          </div>
          {/* Center — logo */}
          <div className="self-center px-1">
            <img
              src={doctor.logo_data || defaultLogo}
              alt="Clinic logo"
              style={{ height: 60, width: 'auto', maxWidth: 110, objectFit: 'contain', mixBlendMode: 'multiply' }}
            />
          </div>
          {/* Right — practice information */}
          <div className="text-right min-w-0">
            {doctor.workplace ? (
              <div className="text-xs font-bold text-gray-800 leading-tight">{doctor.workplace}</div>
            ) : (
              <div className="text-xs font-bold text-gray-300 leading-tight">Clinic Name</div>
            )}
            {doctor.clinic_address && (
              <div className="text-[10px] text-gray-500 mt-0.5 whitespace-pre-line">{doctor.clinic_address}</div>
            )}
            {doctor.phone && (
              <div className="text-[10px] font-semibold text-gray-700 mt-1">Ph: {doctor.phone}</div>
            )}
            {doctor.email && (
              <div className="text-[10px] text-gray-500 mt-0.5">Email: {doctor.email}</div>
            )}
          </div>
        </div>
      </div>
      {/* Faux patient bar + body, to suggest the printed page */}
      <div className="mt-2 border border-gray-200 rounded px-2 py-1 bg-gray-50 flex justify-between text-[10px] text-gray-400">
        <span>Patient · Age · ID</span>
        <span>Date: {format(new Date(), 'dd MMM yyyy')}</span>
      </div>
      <div className="pt-3">
        <div className="text-2xl text-gray-300 leading-none">&#8478;</div>
        <div className="mt-3 space-y-3">
          <div className="border-b border-dashed border-gray-200" />
          <div className="border-b border-dashed border-gray-200" />
          <div className="border-b border-dashed border-gray-200 w-2/3" />
        </div>
      </div>
    </div>
  )
}
