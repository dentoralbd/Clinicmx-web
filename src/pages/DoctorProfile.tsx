import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
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
  Pencil,
  History,
  ChevronDown,
  ChevronUp,
  Trash2,
  Users,
  ScrollText,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { UsersTab } from '@/components/admin/UsersTab'
import { ActivityLogTab } from '@/components/admin/ActivityLogTab'
import { AccessRequestsTab } from '@/components/admin/AccessRequestsTab'
import { countPendingIpRequests } from '@/lib/ipAccess'
import { loadDoctorProfile, saveDoctorProfile, isDoctorProfileAuthError, type DoctorProfileData } from '@/lib/doctorProfile'
import { cleanLogoSource, stripLightBackground } from '@/lib/logoImage'
import { canDelete, canEditClinicProfile, canRevert, formatAuditActor, getAppRole } from '@/lib/appSession'
import { supabase } from '@/lib/supabase'
import { restoreDeletion, isRestorableEntityType } from '@/lib/deleteHistory'
import { revertEdit } from '@/lib/editHistory'
import { logActivity } from '@/lib/activityLog'

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

const HISTORY_PAGE_SIZE = 50

interface DeleteHistoryRow {
  id: string
  deleted_at: string
  entity_type: string
  entity_id: string
  entity_label: string | null
  patient_id: string | null
  patient_name: string | null
  payload: unknown
  deleted_by: string
  restored_at: string | null
}

interface EditHistoryRow {
  id: string
  edited_at: string
  entity_type: string
  entity_id: string
  entity_label: string | null
  patient_id: string | null
  patient_name: string | null
  previous_payload: unknown
  edited_by: string
  reverted_at: string | null
}

type EditHistoryFilter = 'all' | 'patient' | 'prescription' | 'treatment' | 'invoice' | 'inventory_item' | 'lab_work'

const EDIT_HISTORY_FILTERS: Array<{ value: EditHistoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'patient', label: 'Pt. Profile' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'treatment', label: 'Treatments' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'inventory_item', label: 'Inventory' },
  { value: 'lab_work', label: 'Lab' },
]

const ENTITY_TYPE_LABELS: Record<string, string> = {
  patient: 'Patient',
  treatment: 'Treatment',
  prescription: 'Prescription',
  invoice: 'Invoice',
  patient_file: 'Patient File',
  inventory_item: 'Inventory Item',
  patient_visit: 'Visit',
  lab_work: 'Lab Work',
}

type HistoryFilter = 'all' | 'patient' | 'prescription' | 'treatment' | 'invoice' | 'patient_file' | 'inventory_item' | 'lab_work'

const HISTORY_FILTERS: Array<{ value: HistoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'patient', label: 'Pt. Profile' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'treatment', label: 'Treatments' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'patient_file', label: 'Pt. Files' },
  { value: 'inventory_item', label: 'Inventory' },
  { value: 'lab_work', label: 'Lab' },
]

function humanizeKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/

function isIdKey(key: string) {
  return key === 'id' || key.endsWith('_id')
}

function formatSnapshotScalar(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) {
        return value.includes('T') ? format(date, 'MMM d, yyyy h:mm a') : format(date, 'MMM d, yyyy')
      }
    }
    return value
  }
  return null
}

function summarizeSnapshotItem(item: unknown): string {
  if (item === null || item === undefined) return ''
  if (typeof item !== 'object') return formatSnapshotScalar(item) ?? ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (isIdKey(key)) continue
    if (Array.isArray(value)) {
      const joined = value.map((v) => formatSnapshotScalar(v)).filter(Boolean).join(', ')
      if (joined) parts.push(joined)
      continue
    }
    const formatted = formatSnapshotScalar(value)
    if (formatted) parts.push(formatted)
  }
  return parts.join(' — ')
}

function SnapshotDetails({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== 'object') {
    return <p className="text-xs text-gray-400">No details recorded.</p>
  }

  const entries = Object.entries(payload as Record<string, unknown>)
  const idEntries = entries.filter(([key]) => isIdKey(key))
  const detailEntries = entries.filter(([key]) => !isIdKey(key))

  return (
    <div className="space-y-1.5">
      {detailEntries.map(([key, value]) => {
        let rendered: React.ReactNode = null
        if (Array.isArray(value)) {
          const lines = value.map(summarizeSnapshotItem).filter(Boolean)
          if (lines.length === 0) return null
          rendered = (
            <span className="space-y-0.5">
              {lines.map((line, idx) => (
                <span key={idx} className="block">{lines.length > 1 ? `${idx + 1}. ` : ''}{line}</span>
              ))}
            </span>
          )
        } else if (value !== null && typeof value === 'object') {
          const summary = summarizeSnapshotItem(value)
          if (!summary) return null
          rendered = summary
        } else {
          const formatted = formatSnapshotScalar(value)
          if (formatted === null) return null
          rendered = <span className="whitespace-pre-line">{formatted}</span>
        }
        return (
          <div key={key} className="flex gap-3 text-xs">
            <span className="w-36 flex-shrink-0 font-medium text-gray-500">{humanizeKey(key)}</span>
            <span className="text-gray-800 min-w-0 flex-1">{rendered}</span>
          </div>
        )
      })}
      {idEntries.length > 0 && (
        <p className="pt-2 mt-2 border-t border-gray-200 text-[10px] text-gray-400 break-all">
          {idEntries.map(([key, value]) => `${humanizeKey(key)}: ${String(value)}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

type ZoneTab = 'profile' | 'edits' | 'history' | 'users' | 'network' | 'logs'

interface ZoneTabDef {
  id: ZoneTab
  label: string
  icon: typeof Pencil
}

/** Tabs the current session may see — drives both the tab bar and the page guard. */
function getAvailableTabs(): ZoneTabDef[] {
  const tabs: ZoneTabDef[] = []
  if (canEditClinicProfile()) tabs.push({ id: 'profile', label: 'Edit Profile', icon: Pencil })
  if (canRevert()) tabs.push({ id: 'edits', label: 'Edit History', icon: RotateCcw })
  if (canDelete()) tabs.push({ id: 'history', label: 'Delete History', icon: History })
  if (getAppRole() === 'admin') tabs.push({ id: 'users', label: 'Users', icon: Users })
  if (getAppRole() === 'admin') tabs.push({ id: 'network', label: 'Network Access', icon: Wifi })
  if (getAppRole() === 'admin') tabs.push({ id: 'logs', label: 'Activity Log', icon: ScrollText })
  return tabs
}

const TAB_GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3',
}

export function DoctorProfile() {
  const [form, setForm] = useState<DoctorProfileData>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [defaultLogo, setDefaultLogo] = useState(DEFAULT_LOGO)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const availableTabs = getAvailableTabs()
  const [activeTab, setActiveTab] = useState<ZoneTab>(() => getAvailableTabs()[0]?.id ?? 'profile')
  const [pendingIpCount, setPendingIpCount] = useState(0)
  const [deleteHistory, setDeleteHistory] = useState<DeleteHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(0)
  const [historyHasMore, setHistoryHasMore] = useState(true)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const [editHistory, setEditHistory] = useState<EditHistoryRow[]>([])
  const [editHistoryLoading, setEditHistoryLoading] = useState(false)
  const [editHistoryPage, setEditHistoryPage] = useState(0)
  const [editHistoryHasMore, setEditHistoryHasMore] = useState(true)
  const [editHistoryFilter, setEditHistoryFilter] = useState<EditHistoryFilter>('all')
  const [expandedEditId, setExpandedEditId] = useState<string | null>(null)
  const [revertingId, setRevertingId] = useState<string | null>(null)

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

  useEffect(() => {
    if (getAppRole() !== 'admin') return
    countPendingIpRequests()
      .then(setPendingIpCount)
      .catch(() => {
        // Badge is informational only — a failed count must not break the page.
      })
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      setExpandedHistoryId(null)
      loadDeleteHistory(0, historyFilter)
    }
  }, [activeTab, historyFilter])

  useEffect(() => {
    if (activeTab === 'edits') {
      setExpandedEditId(null)
      loadEditHistory(0, editHistoryFilter)
    }
  }, [activeTab, editHistoryFilter])

  async function loadDeleteHistory(page: number, filter: HistoryFilter) {
    setHistoryLoading(true)
    try {
      const from = page * HISTORY_PAGE_SIZE
      const to = from + HISTORY_PAGE_SIZE - 1
      let query = supabase
        .from('delete_history')
        .select('*')
        .order('deleted_at', { ascending: false })
        .range(from, to)
      if (filter !== 'all') {
        query = query.eq('entity_type', filter)
      }
      const { data, error } = await query
      if (error) throw error
      const rows = (data || []) as DeleteHistoryRow[]
      setDeleteHistory((prev) => (page === 0 ? rows : [...prev, ...rows]))
      setHistoryHasMore(rows.length === HISTORY_PAGE_SIZE)
      setHistoryPage(page)
    } catch (err) {
      console.error('Error loading delete history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleRestore(entry: DeleteHistoryRow) {
    const typeLabel = ENTITY_TYPE_LABELS[entry.entity_type] || entry.entity_type
    if (!confirm(`Restore this ${typeLabel.toLowerCase()} to its previous state?`)) return
    setRestoringId(entry.id)
    try {
      const result = await restoreDeletion(entry)
      if (result.ok) {
        const restoredAt = new Date().toISOString()
        setDeleteHistory((prev) =>
          prev.map((row) => (row.id === entry.id ? { ...row, restored_at: restoredAt } : row))
        )
      } else {
        alert(result.reason)
      }
    } catch (err) {
      console.error('Error restoring record:', err)
      alert('Restore failed. Please try again.')
    } finally {
      setRestoringId(null)
    }
  }

  async function loadEditHistory(page: number, filter: EditHistoryFilter) {
    setEditHistoryLoading(true)
    try {
      const from = page * HISTORY_PAGE_SIZE
      const to = from + HISTORY_PAGE_SIZE - 1
      let query = supabase
        .from('edit_history')
        .select('*')
        .order('edited_at', { ascending: false })
        .range(from, to)
      if (filter !== 'all') {
        query = query.eq('entity_type', filter)
      }
      const { data, error } = await query
      if (error) throw error
      const rows = (data || []) as EditHistoryRow[]
      setEditHistory((prev) => (page === 0 ? rows : [...prev, ...rows]))
      setEditHistoryHasMore(rows.length === HISTORY_PAGE_SIZE)
      setEditHistoryPage(page)
    } catch (err) {
      console.error('Error loading edit history:', err)
    } finally {
      setEditHistoryLoading(false)
    }
  }

  async function handleRevert(entry: EditHistoryRow) {
    const typeLabel = ENTITY_TYPE_LABELS[entry.entity_type] || entry.entity_type
    if (!confirm(`Revert this ${typeLabel.toLowerCase()} to its previous state? This will undo the edit made after this point.`)) return
    setRevertingId(entry.id)
    try {
      const result = await revertEdit(entry)
      if (result.ok) {
        const revertedAt = new Date().toISOString()
        setEditHistory((prev) =>
          prev.map((row) => (row.id === entry.id ? { ...row, reverted_at: revertedAt } : row))
        )
      } else {
        alert(result.reason)
      }
    } catch (err) {
      console.error('Error reverting edit:', err)
      alert('Revert failed. Please try again.')
    } finally {
      setRevertingId(null)
    }
  }

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
      logActivity({
        action: 'edit',
        entityType: 'doctor_profile',
        entityLabel: 'Clinic profile',
        details: cleaned.full_name || null,
      })
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

  if (availableTabs.length === 0) {
    return <Navigate to="/dashboard" replace />
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
    <div className="max-w-6xl mx-auto space-y-6 page-fade-in">
      {/* Hero banner — live identity card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-primary via-[#1b4e70] to-slate-900 rounded-3xl p-6 text-white">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 right-24 w-36 h-36 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center flex-shrink-0 text-xl font-bold tracking-wide">
            {initials || <Stethoscope className="w-8 h-8" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold truncate">
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

      {/* Main action tabs — which tabs exist depends on the session's permissions */}
      <div className={`grid ${TAB_GRID_COLS[availableTabs.length] ?? 'grid-cols-3'} gap-3`}>
        {availableTabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border-2 font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-gray-200 bg-white text-text-secondary hover:border-gray-300 hover:text-gray-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
              {tab.id === 'network' && pendingIpCount > 0 && (
                <span className="min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                  {pendingIpCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'users' && <UsersTab />}

      {activeTab === 'network' && <AccessRequestsTab onPendingCountChange={setPendingIpCount} />}

      {activeTab === 'logs' && <ActivityLogTab />}

      {activeTab === 'profile' && (
      <form onSubmit={handleSave} className="space-y-6">
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
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <History className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Delete History</h2>
              <p className="text-xs text-gray-400">Every record ever deleted, with full details — for audit purposes</p>
            </div>
          </div>

          {/* Category filters */}
          <div className="flex flex-wrap gap-2">
            {HISTORY_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setHistoryFilter(filter.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  historyFilter === filter.value
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-secondary border-gray-200 hover:border-gray-300'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {deleteHistory.length === 0 && !historyLoading ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              {historyFilter === 'all' ? 'No deletions recorded yet.' : 'No deletions in this category yet.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {deleteHistory.map((entry) => {
                const isExpanded = expandedHistoryId === entry.id
                return (
                  <div key={entry.id} className="py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedHistoryId(isExpanded ? null : entry.id)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {ENTITY_TYPE_LABELS[entry.entity_type] || entry.entity_type}
                            {entry.entity_label ? `: ${entry.entity_label}` : ''}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {format(new Date(entry.deleted_at), 'MMM d, yyyy h:mm a')}
                            {entry.patient_name ? ` · ${entry.patient_name}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          {formatAuditActor(entry.deleted_by)}
                        </span>
                        {entry.restored_at && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            <CheckCircle className="w-3 h-3" />
                            Restored
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                        <SnapshotDetails payload={entry.payload} />
                        <div className="pt-2 border-t border-gray-200">
                          {entry.restored_at ? (
                            <p className="text-xs text-green-700 flex items-center gap-1.5">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Restored on {format(new Date(entry.restored_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          ) : isRestorableEntityType(entry.entity_type) ? (
                            <button
                              type="button"
                              onClick={() => handleRestore(entry)}
                              disabled={restoringId === entry.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              {restoringId === entry.id ? 'Restoring…' : 'Restore this record'}
                            </button>
                          ) : (
                            <p className="text-xs text-gray-400">
                              File content can't be recovered — the file itself was permanently removed from storage when deleted.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {historyHasMore && (
            <button
              type="button"
              onClick={() => loadDeleteHistory(historyPage + 1, historyFilter)}
              disabled={historyLoading}
              className="w-full text-sm font-medium text-primary hover:underline py-2 text-center disabled:opacity-50"
            >
              {historyLoading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {activeTab === 'edits' && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Edit History</h2>
              <p className="text-xs text-gray-400">Every change made after a record's first save — revert any of them back</p>
            </div>
          </div>

          {/* Category filters */}
          <div className="flex flex-wrap gap-2">
            {EDIT_HISTORY_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setEditHistoryFilter(filter.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  editHistoryFilter === filter.value
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-secondary border-gray-200 hover:border-gray-300'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {editHistory.length === 0 && !editHistoryLoading ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              {editHistoryFilter === 'all' ? 'No edits recorded yet.' : 'No edits in this category yet.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {editHistory.map((entry) => {
                const isExpanded = expandedEditId === entry.id
                return (
                  <div key={entry.id} className="py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedEditId(isExpanded ? null : entry.id)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Pencil className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {ENTITY_TYPE_LABELS[entry.entity_type] || entry.entity_type}
                            {entry.entity_label ? `: ${entry.entity_label}` : ''}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {format(new Date(entry.edited_at), 'MMM d, yyyy h:mm a')}
                            {entry.patient_name ? ` · ${entry.patient_name}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          {formatAuditActor(entry.edited_by)}
                        </span>
                        {entry.reverted_at && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            <CheckCircle className="w-3 h-3" />
                            Reverted
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Version before this edit</p>
                        <SnapshotDetails payload={entry.previous_payload} />
                        <div className="pt-2 border-t border-gray-200">
                          {entry.reverted_at ? (
                            <p className="text-xs text-green-700 flex items-center gap-1.5">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Reverted on {format(new Date(entry.reverted_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRevert(entry)}
                              disabled={revertingId === entry.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              {revertingId === entry.id ? 'Reverting…' : 'Revert to this version'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {editHistoryHasMore && (
            <button
              type="button"
              onClick={() => loadEditHistory(editHistoryPage + 1, editHistoryFilter)}
              disabled={editHistoryLoading}
              className="w-full text-sm font-medium text-primary hover:underline py-2 text-center disabled:opacity-50"
            >
              {editHistoryLoading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
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
