type InvoiceInsertBase = {
  patient_id: string
  items: unknown[]
  total_amount: number
  paid_amount: number
  status: string
  due_date: string | null
  appointment_id?: string | null
}

export const LEGACY_INVOICE_INSERT_FIELDS = [
  'patient_id',
  'items',
  'total_amount',
  'paid_amount',
  'status',
  'due_date',
  'appointment_id',
] as const

export function buildLegacyInvoiceInsertPayload(
  payload: InvoiceInsertBase,
  options: { includeAppointmentId?: boolean } = {}
) {
  const legacyPayload = {
    patient_id: payload.patient_id,
    items: payload.items,
    total_amount: payload.total_amount,
    paid_amount: payload.paid_amount,
    status: payload.status,
    due_date: payload.due_date,
  } as InvoiceInsertBase

  if (options.includeAppointmentId && payload.appointment_id) {
    legacyPayload.appointment_id = payload.appointment_id
  }

  return legacyPayload
}
