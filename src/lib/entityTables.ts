export type TrackedEntityType =
  | 'patient'
  | 'treatment'
  | 'prescription'
  | 'invoice'
  | 'inventory_item'

// Column allowlists per target table (must match Row types in
// database.types.ts). Snapshots taken from list pages can embed joined
// objects (e.g. a nested `patients` key from select('*, patients(...)')),
// which are not real columns and would make an insert/update fail.
export const ENTITY_TABLE_COLUMNS: Record<TrackedEntityType, { table: string; columns: string[] }> = {
  patient: {
    table: 'patients',
    columns: ['id', 'patient_code', 'first_name', 'last_name', 'phone', 'email', 'date_of_birth', 'gender', 'weight', 'address', 'medical_history', 'notes', 'created_at', 'updated_at'],
  },
  treatment: {
    table: 'treatments',
    columns: ['id', 'patient_id', 'appointment_id', 'prescription_id', 'prescription_entry_id', 'tooth_number', 'treatment_type', 'description', 'status', 'cost', 'notes', 'is_invoiced', 'invoice_id', 'created_at'],
  },
  prescription: {
    table: 'prescriptions',
    columns: ['id', 'patient_id', 'appointment_id', 'medications', 'investigations', 'chief_complaint', 'chief_complaint_entries', 'on_examination', 'on_examination_entries', 'diagnosis', 'diagnosis_entries', 'treatment_plan', 'treatment_plan_entries', 'notes', 'weight_at_prescription', 'prescribed_date', 'created_at'],
  },
  invoice: {
    table: 'invoices',
    columns: ['id', 'patient_id', 'appointment_id', 'items', 'total_amount', 'paid_amount', 'discount_amount', 'discount_type', 'discount_value', 'tax_amount', 'tax_rate', 'notes', 'payment_terms', 'invoice_number', 'invoice_type', 'recurring_enabled', 'recurring_frequency', 'template_id', 'credit_amount', 'late_fee_amount', 'status', 'due_date', 'created_at'],
  },
  inventory_item: {
    table: 'inventory_items',
    columns: ['id', 'name', 'category', 'description', 'quantity', 'unit', 'low_stock_threshold', 'supplier', 'cost', 'notes', 'expiry_date', 'created_at', 'updated_at'],
  },
}

export function sanitizeSnapshot(entityType: TrackedEntityType, snapshot: Record<string, unknown>) {
  const row: Record<string, unknown> = {}
  for (const column of ENTITY_TABLE_COLUMNS[entityType].columns) {
    if (column in snapshot) {
      row[column] = snapshot[column]
    }
  }
  return row
}
