-- Per-doctor default Doctor Share % (Admin -> Users -> Add/Edit Account).
-- Set once on the doctor's account, applied automatically wherever that
-- doctor is picked on a New Treatment Plan item — still editable per item
-- there, same as today. NULL (the default, and the only value operator
-- accounts will ever have) falls back to the existing global 30% default
-- (044_doctor_share_default_30.sql) — no behavior change for any doctor
-- who doesn't have one explicitly set.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS default_share_pct numeric;

COMMENT ON COLUMN app_users.default_share_pct IS
  'Doctor-specific default for treatments.doctor_share_pct, applied when this doctor is selected on a New Treatment Plan item. NULL falls back to the 30% global default. Only meaningful for role=doctor accounts.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE app_users DROP COLUMN IF EXISTS default_share_pct;
