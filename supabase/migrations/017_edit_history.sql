-- Edit history: snapshot of a record's state right before each edit (not the
-- first-time creation), so accidental edits can be reverted to any prior
-- version. Mirrors delete_history's shape and restore mechanics.
CREATE TABLE edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'inventory_item')),
  entity_id TEXT NOT NULL,
  entity_label TEXT,
  patient_id TEXT,
  patient_name TEXT,
  previous_payload JSONB NOT NULL,
  edited_by TEXT NOT NULL DEFAULT 'doctor',
  reverted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_edit_history_edited_at ON edit_history(edited_at DESC);
CREATE INDEX idx_edit_history_entity_type ON edit_history(entity_type);

-- Row Level Security
ALTER TABLE edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on edit_history" ON edit_history FOR ALL USING (true);
