import { supabase } from '@/lib/supabase'

export interface PatientBundle {
  patient: any
  visits: any[]
  dental: any[]
  treatments: any[]
  prescriptions: any[]
  appointments: any[]
  invoices: any[]
  payments: any[]
  files: any[]
}

export async function fetchPatientBundle(id: string): Promise<PatientBundle> {
  const [
    { data: patient, error: pErr },
    { data: visits },
    { data: dental },
    { data: treatments },
    { data: prescriptions },
    { data: appointments },
    { data: invoices },
    { data: files },
  ] = await Promise.all([
    supabase.from('patients').select('*').eq('id', id).single(),
    supabase.from('patient_visits').select('*').eq('patient_id', id).order('visit_date', { ascending: false }),
    supabase.from('dental_records').select('*').eq('patient_id', id),
    supabase.from('treatments').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
    supabase.from('prescriptions').select('*').eq('patient_id', id).order('prescribed_date', { ascending: false }),
    supabase.from('appointments').select('*').eq('patient_id', id).order('date_time', { ascending: false }),
    supabase.from('invoices').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
    // Ordered by created_at (not uploaded_at) to match the column main's schema actually populates.
    supabase.from('patient_files').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
  ])

  if (pErr) throw pErr

  const invoiceIds = (invoices || []).map((inv: any) => inv.id)
  const { data: payments } = invoiceIds.length
    ? await supabase.from('payments').select('*').in('invoice_id', invoiceIds)
    : { data: [] as any[] }

  return {
    patient: patient || null,
    visits: visits || [],
    dental: dental || [],
    treatments: treatments || [],
    prescriptions: prescriptions || [],
    appointments: appointments || [],
    invoices: invoices || [],
    payments: payments || [],
    files: files || [],
  }
}
