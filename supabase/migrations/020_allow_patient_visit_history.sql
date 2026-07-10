-- Allow 'patient_visit' as a trackable entity_type in delete_history and
-- edit_history, so visit edits/deletes (added in PatientProfile.tsx) can be
-- logged. The app-side TrackedEntityType union already includes
-- 'patient_visit' (src/lib/entityTables.ts) but the DB CHECK constraints
-- were never updated to match, causing logDeletion/logEdit to throw.
ALTER TABLE delete_history DROP CONSTRAINT delete_history_entity_type_check;
ALTER TABLE delete_history ADD CONSTRAINT delete_history_entity_type_check
  CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'patient_file', 'inventory_item', 'patient_visit'));

ALTER TABLE edit_history DROP CONSTRAINT edit_history_entity_type_check;
ALTER TABLE edit_history ADD CONSTRAINT edit_history_entity_type_check
  CHECK (entity_type IN ('patient', 'treatment', 'prescription', 'invoice', 'inventory_item', 'patient_visit'));
