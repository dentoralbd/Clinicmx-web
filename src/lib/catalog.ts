import { supabase } from './supabase'
import { logDeletion } from './deleteHistory'
import { logEdit } from './editHistory'
import { logActivity } from './activityLog'

export type CatalogDomain = 'treatment' | 'medication'

export interface CatalogCategory {
  id: string
  domain: CatalogDomain
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TreatmentCatalogItem {
  id: string
  category_id: string
  name: string
  default_fee: number | null
  sort_order: number
  created_at: string
  updated_at: string
  category?: { id: string; name: string } | null
}

export interface CustomMedication {
  id: string
  category_id: string
  brand: string
  generic: string
  dosage_form: string | null
  default_dosage: string | null
  default_frequency: string | null
  default_duration: string | null
  default_instructions: string | null
  default_route: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
  category?: { id: string; name: string } | null
}

function friendlyDeleteError(error: { code?: string; message: string }, kind: string): Error {
  if (error.code === '23503') {
    return new Error(`This ${kind} still has items assigned to it — move or delete those first.`)
  }
  return new Error(error.message)
}

// === Categories ================================================================
// Not audit-tracked (matches appointmentSchedule.ts's Clinic Hours precedent —
// config-like data, not user clinical/financial data).

export async function listCatalogCategories(domain: CatalogDomain): Promise<CatalogCategory[]> {
  const { data, error } = await supabase
    .from('catalog_categories')
    .select('*')
    .eq('domain', domain)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []) as CatalogCategory[]
}

export async function createCatalogCategory(domain: CatalogDomain, name: string, sortOrder = 0): Promise<CatalogCategory> {
  const { data, error } = await supabase
    .from('catalog_categories')
    .insert({ domain, name: name.trim(), sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data as CatalogCategory
}

export async function updateCatalogCategory(id: string, patch: { name?: string; sort_order?: number }): Promise<void> {
  const { error } = await supabase.from('catalog_categories').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCatalogCategory(id: string): Promise<void> {
  const { error } = await supabase.from('catalog_categories').delete().eq('id', id)
  if (error) throw friendlyDeleteError(error, 'category')
}

// === Treatment catalog items (audit-tracked, matches inventory_item) ==========

export async function listTreatmentCatalogItems(): Promise<TreatmentCatalogItem[]> {
  const { data, error } = await supabase
    .from('treatment_catalog_items')
    .select('*, category:catalog_categories(id, name)')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []) as unknown as TreatmentCatalogItem[]
}

export async function createTreatmentCatalogItem(input: {
  category_id: string
  name: string
  default_fee?: number | null
  sort_order?: number
}): Promise<TreatmentCatalogItem> {
  const payload = {
    category_id: input.category_id,
    name: input.name.trim(),
    default_fee: input.default_fee ?? null,
    sort_order: input.sort_order ?? 0,
  }
  const { data, error } = await supabase.from('treatment_catalog_items').insert(payload).select().single()
  if (error) throw error
  logActivity({ action: 'create', entityType: 'treatment_catalog_item', entityId: data.id, entityLabel: payload.name })
  return data as TreatmentCatalogItem
}

export async function updateTreatmentCatalogItem(
  id: string,
  previous: TreatmentCatalogItem,
  patch: { category_id?: string; name?: string; default_fee?: number | null; sort_order?: number }
): Promise<void> {
  await logEdit({
    entityType: 'treatment_catalog_item',
    entityId: id,
    entityLabel: previous.name,
    previousPayload: previous,
  })
  const { error } = await supabase.from('treatment_catalog_items').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteTreatmentCatalogItem(item: TreatmentCatalogItem): Promise<void> {
  await logDeletion({
    entityType: 'treatment_catalog_item',
    entityId: item.id,
    entityLabel: item.name,
    payload: item,
  })
  const { error } = await supabase.from('treatment_catalog_items').delete().eq('id', item.id)
  if (error) throw error
}

// === Custom medications (audit-tracked, matches inventory_item) ===============

export async function listCustomMedications(): Promise<CustomMedication[]> {
  const { data, error } = await supabase
    .from('custom_medications')
    .select('*, category:catalog_categories(id, name)')
    .order('sort_order', { ascending: true })
    .order('brand', { ascending: true })
  if (error) throw error
  return (data || []) as unknown as CustomMedication[]
}

export async function createCustomMedication(input: {
  category_id: string
  brand: string
  generic: string
  dosage_form?: string | null
  default_dosage?: string | null
  default_frequency?: string | null
  default_duration?: string | null
  default_instructions?: string | null
  default_route?: string | null
  notes?: string | null
  sort_order?: number
}): Promise<CustomMedication> {
  const payload = {
    category_id: input.category_id,
    brand: input.brand.trim(),
    generic: input.generic.trim(),
    dosage_form: input.dosage_form ?? null,
    default_dosage: input.default_dosage ?? null,
    default_frequency: input.default_frequency ?? null,
    default_duration: input.default_duration ?? null,
    default_instructions: input.default_instructions ?? null,
    default_route: input.default_route ?? null,
    notes: input.notes ?? null,
    sort_order: input.sort_order ?? 0,
  }
  const { data, error } = await supabase.from('custom_medications').insert(payload).select().single()
  if (error) throw error
  logActivity({ action: 'create', entityType: 'custom_medication', entityId: data.id, entityLabel: payload.brand })
  return data as CustomMedication
}

export async function updateCustomMedication(
  id: string,
  previous: CustomMedication,
  patch: Partial<Omit<CustomMedication, 'id' | 'created_at' | 'updated_at' | 'category'>>
): Promise<void> {
  await logEdit({
    entityType: 'custom_medication',
    entityId: id,
    entityLabel: previous.brand,
    previousPayload: previous,
  })
  const { error } = await supabase.from('custom_medications').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCustomMedication(medication: CustomMedication): Promise<void> {
  await logDeletion({
    entityType: 'custom_medication',
    entityId: medication.id,
    entityLabel: medication.brand,
    payload: medication,
  })
  const { error } = await supabase.from('custom_medications').delete().eq('id', medication.id)
  if (error) throw error
}
