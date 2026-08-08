import { supabase } from '@/lib/supabase'

export interface AutoInvoiceNumber {
  prefix: string
  next: number
}

export async function loadAutoInvoiceNumber(): Promise<AutoInvoiceNumber | null> {
  const { data, error } = await supabase
    .from('invoice_settings')
    .select('invoice_prefix, next_invoice_number')
    .eq('id', 1)
    .maybeSingle()
  const next = Number(data?.next_invoice_number)
  if (error || !data || !Number.isFinite(next) || next <= 0) return null
  return { prefix: data.invoice_prefix || 'INV', next }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  if (code === '23505') return true
  const message = (error as { message?: string } | null)?.message || ''
  return /duplicate key|unique constraint/i.test(message)
}

/**
 * Inserts an invoice row, auto-assigning `invoice_number` from
 * `invoice_settings` with a one-step +1 retry on a unique-violation before
 * falling back to no number at all. Extracted verbatim from InvoiceModal's
 * online submit handler so the online form and the offline sync path share
 * one numbering contract instead of drifting — a `INV-TMP-*` invoice created
 * offline finalizes through the exact same 3-tier retry a live invoice does.
 *
 * `payload` may already carry a client-generated `id` (offline inserts do,
 * so dependent mutations — treatment links, payments — can reference it
 * before sync); it is passed through untouched.
 */
export async function insertInvoiceWithAutoNumber(
  payload: Record<string, any>
): Promise<{ data: { id: string } | null; error: unknown; usedInvoiceNumber: string | null }> {
  const auto = await loadAutoInvoiceNumber()
  const autoValue = auto ? `${auto.prefix}-${auto.next}` : null
  const basePayload = { ...payload, invoice_number: autoValue || payload.invoice_number || null }

  let usedInvoiceNumber: string | null = basePayload.invoice_number
  let insertResult = await supabase.from('invoices').insert([basePayload] as any).select('id').single()

  if (insertResult.error && isUniqueViolation(insertResult.error) && auto && usedInvoiceNumber === autoValue) {
    usedInvoiceNumber = `${auto.prefix}-${auto.next + 1}`
    insertResult = await supabase
      .from('invoices')
      .insert([{ ...basePayload, invoice_number: usedInvoiceNumber }] as any)
      .select('id')
      .single()

    if (insertResult.error && isUniqueViolation(insertResult.error)) {
      usedInvoiceNumber = null
      insertResult = await supabase
        .from('invoices')
        .insert([{ ...basePayload, invoice_number: null }] as any)
        .select('id')
        .single()
    }
  }

  if (!insertResult.error && auto && usedInvoiceNumber && (usedInvoiceNumber === autoValue || usedInvoiceNumber === `${auto.prefix}-${auto.next + 1}`)) {
    const usedN = Number(usedInvoiceNumber.slice(auto.prefix.length + 1))
    await supabase
      .from('invoice_settings')
      .update({ next_invoice_number: usedN + 1 })
      .eq('id', 1)
      .then(() => {}, () => {})
  }

  return { data: insertResult.data, error: insertResult.error, usedInvoiceNumber }
}
