-- Supersedes part of 043_doctor_attribution_fixes.sql, which already ran
-- live on 2026-08-01 setting doctor_share_pct's default to 50%. User
-- decision the same day: the default should be 30%, matching the original
-- migration 042 default. 043's file is left as-is (accurate record of what
-- actually executed) rather than edited retroactively; this migration is
-- the correction on top of it.
--
-- As with 043, this does NOT touch any existing row's stored
-- doctor_share_pct — only affects future inserts that omit the column.
ALTER TABLE treatments ALTER COLUMN doctor_share_pct SET DEFAULT 30.00;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE treatments ALTER COLUMN doctor_share_pct SET DEFAULT 50.00;
