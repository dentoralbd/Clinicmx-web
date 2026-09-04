-- Migration 068: Append-only dental chart history, powering the Anatomic Odontogram's
-- Timeline & History Scrubber (ported from "v2 by AGY"). `dental_records` (migration 001)
-- only keeps the LATEST condition per tooth (UNIQUE(patient_id, tooth_number) upsert model),
-- so there is no way to reconstruct "what did this mouth look like on date X" from it alone.
-- This table is never updated in place — every save of a tooth's condition also inserts a
-- new row here, dated by the clinician-chosen procedure_date. The chart replays these rows
-- (filtered to <= a target date, sorted, last-write-per-tooth-wins) to render a historical
-- snapshot. See ArchDentalChart.tsx / AnatomicDentalChart.tsx computeChartSnapshot().

CREATE TABLE dental_record_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_number INTEGER NOT NULL,
  condition TEXT NOT NULL DEFAULT 'Healthy',
  notes TEXT,
  procedure_date DATE NOT NULL DEFAULT CURRENT_DATE,
  doctor_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dental_record_history_patient ON dental_record_history(patient_id);
CREATE INDEX idx_dental_record_history_patient_date ON dental_record_history(patient_id, procedure_date);

ALTER TABLE dental_record_history ENABLE ROW LEVEL SECURITY;

-- Mirrors dental_records' permissive policy (001_initial_schema.sql) — this app gates access
-- at the application layer (PIN + role), not via Postgres RLS, for its own tables.
CREATE POLICY "Allow all on dental_record_history" ON dental_record_history FOR ALL USING (true);

-- Backfill: seed one initial history snapshot per existing dental_records row, using its
-- recorded_date (falls back to today if null) as the procedure_date, so patients who already
-- have tooth conditions recorded get a non-empty timeline instead of starting blank.
INSERT INTO dental_record_history (patient_id, tooth_number, condition, notes, procedure_date, created_at)
SELECT patient_id, tooth_number, condition, notes, COALESCE(recorded_date, updated_at::date, CURRENT_DATE), updated_at
FROM dental_records;

-- ROLLBACK (run manually if this migration needs to be reverted):
-- DROP TABLE IF EXISTS dental_record_history;
