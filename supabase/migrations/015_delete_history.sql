-- Delete history: full snapshot of every deleted record, logged before deletion
CREATE TABLE delete_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'patient_file', 'inventory_item')),
  entity_id TEXT NOT NULL,
  entity_label TEXT,
  patient_id TEXT,
  patient_name TEXT,
  payload JSONB NOT NULL,
  deleted_by TEXT NOT NULL DEFAULT 'doctor'
);

-- Indexes
CREATE INDEX idx_delete_history_deleted_at ON delete_history(deleted_at DESC);
CREATE INDEX idx_delete_history_entity_type ON delete_history(entity_type);

-- Row Level Security
ALTER TABLE delete_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on delete_history" ON delete_history FOR ALL USING (true);
