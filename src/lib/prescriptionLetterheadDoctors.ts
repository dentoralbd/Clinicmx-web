import { supabase } from './supabase'

export interface LetterheadDoctor {
  id: string
  full_name: string
  degrees: string
  designation: string
  bmdc_reg: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// Not audit-tracked — matches doctor_profiles' own precedent (clinic-config
// data, not user clinical/financial data).

export async function listLetterheadDoctors(): Promise<LetterheadDoctor[]> {
  const { data, error } = await supabase
    .from('prescription_letterhead_doctors')
    .select('*')
    .order('display_order', { ascending: true })
    .order('full_name', { ascending: true })
  if (error) throw error
  return (data || []) as LetterheadDoctor[]
}

export async function listActiveLetterheadDoctors(): Promise<LetterheadDoctor[]> {
  const { data, error } = await supabase
    .from('prescription_letterhead_doctors')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('full_name', { ascending: true })
  if (error) throw error
  return (data || []) as LetterheadDoctor[]
}

export async function createLetterheadDoctor(input: {
  full_name: string
  degrees?: string
  designation?: string
  bmdc_reg?: string
  display_order?: number
  is_active?: boolean
}): Promise<LetterheadDoctor> {
  const payload = {
    full_name: input.full_name.trim(),
    degrees: input.degrees ?? '',
    designation: input.designation ?? '',
    bmdc_reg: input.bmdc_reg ?? '',
    display_order: input.display_order ?? 0,
    is_active: input.is_active ?? true,
  }
  const { data, error } = await supabase.from('prescription_letterhead_doctors').insert(payload).select().single()
  if (error) throw error
  return data as LetterheadDoctor
}

export async function updateLetterheadDoctor(
  id: string,
  patch: Partial<Omit<LetterheadDoctor, 'id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase.from('prescription_letterhead_doctors').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteLetterheadDoctor(id: string): Promise<void> {
  const { error } = await supabase.from('prescription_letterhead_doctors').delete().eq('id', id)
  if (error) throw error
}
