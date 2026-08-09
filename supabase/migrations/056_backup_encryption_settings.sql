-- Sitewide backup encryption settings, added to the same singleton row as
-- the Daily/Weekly/Monthly schedule (031_backup_settings.sql).
--
-- Previously the encryption on/off flag and passphrase were stored
-- per-device (localStorage / secureLocalStorage keyed to a random per-browser
-- actor id), so two devices could independently disagree on whether to
-- encrypt and with what passphrase — producing different file extensions
-- (.json.gz vs .json.enc) for the "same" scheduled backup, and a passphrase
-- typed on one device failing to restore a backup encrypted on another.
-- Moving both into this shared table fixes that: every device reads/writes
-- the same encryption state.

ALTER TABLE backup_settings
  ADD COLUMN IF NOT EXISTS encrypt_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS passphrase text;
