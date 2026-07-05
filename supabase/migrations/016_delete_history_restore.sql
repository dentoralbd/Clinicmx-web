-- Track restoration of deleted records: when a delete_history entry is
-- restored back into its original table, stamp it here (audit preserved).
ALTER TABLE delete_history ADD COLUMN restored_at TIMESTAMPTZ;
