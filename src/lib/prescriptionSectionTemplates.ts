import { getScopedStorageKey } from './appSession'

type TemplateSection = 'chief_complaint' | 'on_examination' | 'medications' | 'investigations'

export interface MedicationTemplateItem {
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
  route?: string
}

export interface InvestigationTemplateItem {
  name: string
  description: string
  urgency?: string
}

export interface SectionTemplate<T> {
  id: string
  label: string
  value: T
  created_at: string
}

const TEMPLATE_LIMIT = 12
const STORAGE_PREFIX = 'clinicmx_prescription_templates'

function storageKey(section: TemplateSection) {
  return getScopedStorageKey(`${STORAGE_PREFIX}:${section}`)
}

function readTemplates<T>(section: TemplateSection) {
  if (typeof window === 'undefined') return [] as Array<SectionTemplate<T>>

  try {
    const raw = localStorage.getItem(storageKey(section))
    if (!raw) return [] as Array<SectionTemplate<T>>
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] as Array<SectionTemplate<T>>
  }
}

function writeTemplates<T>(section: TemplateSection, templates: Array<SectionTemplate<T>>) {
  if (typeof window === 'undefined') return templates
  localStorage.setItem(storageKey(section), JSON.stringify(templates))
  return templates
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function getFilledMedicationItems(items: MedicationTemplateItem[]) {
  return items
    .map((item) => ({
      name: item.name?.trim() || '',
      dosage: item.dosage?.trim() || '',
      frequency: item.frequency?.trim() || '',
      duration: item.duration?.trim() || '',
      instructions: item.instructions?.trim() || '',
      route: item.route?.trim() || '',
    }))
    .filter((item) => item.name || item.dosage || item.frequency || item.duration || item.instructions || item.route)
}

export function getFilledInvestigationItems(items: InvestigationTemplateItem[]) {
  return items
    .map((item) => ({
      name: item.name?.trim() || '',
      description: item.description?.trim() || '',
      urgency: item.urgency?.trim() || 'Routine',
    }))
    .filter((item) => item.name || item.description)
}

function upsertTemplate<T>(
  section: TemplateSection,
  nextValue: T,
  label: string,
  isSameValue: (template: SectionTemplate<T>) => boolean
) {
  const templates = readTemplates<T>(section)
  const remaining = templates.filter((template) => !isSameValue(template))
  const updated = [
    {
      id: globalThis.crypto?.randomUUID?.() || `${section}-${Date.now()}`,
      label,
      value: nextValue,
      created_at: new Date().toISOString(),
    },
    ...remaining,
  ].slice(0, TEMPLATE_LIMIT)

  return writeTemplates(section, updated)
}

export function getComplaintTemplates() {
  return readTemplates<string>('chief_complaint')
}

export function saveComplaintTemplate(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return getComplaintTemplates()

  return upsertTemplate(
    'chief_complaint',
    normalized,
    normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized,
    (template) => normalizeText(template.value) === normalized
  )
}

export function getExaminationTemplates() {
  return readTemplates<string>('on_examination')
}

export function saveExaminationTemplate(value: string) {
  const normalized = normalizeText(value)
  if (!normalized) return getExaminationTemplates()

  return upsertTemplate(
    'on_examination',
    normalized,
    normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized,
    (template) => normalizeText(template.value) === normalized
  )
}

export function getMedicationSectionTemplates() {
  return readTemplates<MedicationTemplateItem[]>('medications')
}

export function saveMedicationSectionTemplate(items: MedicationTemplateItem[]) {
  const normalized = getFilledMedicationItems(items)
  if (normalized.length === 0) return getMedicationSectionTemplates()

  const names = normalized.map((item) => item.name).filter(Boolean)
  const label = names.length <= 1 ? names[0] : `${names[0]} +${names.length - 1} more`
  const snapshot = JSON.stringify(normalized)

  return upsertTemplate(
    'medications',
    normalized,
    label,
    (template) => JSON.stringify(getFilledMedicationItems(template.value)) === snapshot
  )
}

export function getInvestigationSectionTemplates() {
  return readTemplates<InvestigationTemplateItem[]>('investigations')
}

export function saveInvestigationSectionTemplate(items: InvestigationTemplateItem[]) {
  const normalized = getFilledInvestigationItems(items)
  if (normalized.length === 0) return getInvestigationSectionTemplates()

  const names = normalized.map((item) => item.name).filter(Boolean)
  const label = names.length <= 1 ? names[0] : `${names[0]} +${names.length - 1} more`
  const snapshot = JSON.stringify(normalized)

  return upsertTemplate(
    'investigations',
    normalized,
    label,
    (template) => JSON.stringify(getFilledInvestigationItems(template.value)) === snapshot
  )
}
