-- Cross-device approval of one's OWN offline edits (see 054 for the
-- metadata-only original design, which this deliberately supersedes).
--
-- 054 held metadata only, on the reasoning that approving must happen on the
-- device holding the data. That leaves a user who lost/replaced their phone
-- with no way to approve their own queued work. This adds the payload,
-- encrypted client-side (AES-GCM) before upload, plus the concurrency
-- machinery that makes "two devices can now approve the same edit" safe.
--
-- HONEST SECURITY POSTURE — read before treating this as confidentiality:
-- the AES-GCM key is PBKDF2(VITE_ADMIN_PASSWORD, fixed salt) and
-- VITE_ADMIN_PASSWORD is inlined into the public JS bundle. Anyone who can
-- download the bundle can derive the identical key. This is NOT protection
-- against an attacker who has both the bundle and these rows. What it buys:
-- no clinical/financial plaintext in the Supabase dashboard, in PostgREST
-- responses, in logs, or in a DB dump taken on its own; and ciphertext is
-- destroyed the moment the edit reaches a terminal state (below). RLS —
-- unchanged from 054 — remains the actual access control.
--
-- Idempotent; safe to re-run against the live project.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offline_edit_queue'
      AND column_name = 'payload_encrypted'
  ) THEN
    ALTER TABLE public.offline_edit_queue
      -- base64(AES-GCM ciphertext) of JSON.stringify(PendingMutation.payload)
      ADD COLUMN payload_encrypted TEXT,
      -- base64 of the 12-byte random IV, one per encryption
      ADD COLUMN payload_iv        TEXT,
      -- 'A256GCM-v1:<8-hex key fingerprint>'. If the admin PIN is rotated the
      -- derived key changes and old ciphertext is undecryptable forever —
      -- this lets the UI say so instead of failing silently.
      ADD COLUMN payload_alg       TEXT,
      -- Atomic claim (compare-and-swap) so two devices can never both execute
      -- the same mutation. A claim older than the client's TTL is stealable,
      -- which recovers rows whose claiming device died mid-sync.
      ADD COLUMN claimed_at        TIMESTAMPTZ,
      ADD COLUMN claimed_by_device TEXT,
      ADD COLUMN synced_at         TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS offline_edit_queue_creator_status_idx
  ON public.offline_edit_queue (created_by_user_id, status);

-- === Terminal-state guard ===================================================
--
-- reportPendingToServer() re-reports the local outbox as an upsert
-- (INSERT ... ON CONFLICT DO UPDATE). Two ways that corrupts state, both
-- closed here:
--
-- 1. RESURRECTION. Postgres reflects BEFORE INSERT trigger effects in
--    EXCLUDED, so offline_edit_queue_fill_creator()'s forced status='pending'
--    means EXCLUDED.status is ALWAYS 'pending'. A stale device re-reporting an
--    edit another device already synced would flip the tombstone back to
--    pending and the edit would execute twice.
-- 2. CIPHERTEXT ERASURE. PostgREST builds the DO UPDATE column list from the
--    union of keys across the batch, so a device without the session
--    encryption key can send payload_encrypted = NULL and blank out good
--    ciphertext staged earlier.
--
-- Terminal rows also drop their ciphertext: once an edit is synced or
-- discarded the payload has no further purpose, and not storing it is worth
-- more than the encryption is.
CREATE OR REPLACE FUNCTION public.offline_edit_queue_guard_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- (1) 'synced' / 'discarded' are sticky and immutable.
  IF OLD.status IN ('synced', 'discarded') THEN
    RETURN OLD;
  END IF;

  -- (2) never let a re-report blank out staged ciphertext.
  IF NEW.payload_encrypted IS NULL THEN
    NEW.payload_encrypted := OLD.payload_encrypted;
    NEW.payload_iv        := OLD.payload_iv;
    NEW.payload_alg       := OLD.payload_alg;
  END IF;

  -- created_by_user_id is the sole basis of "own rows" RLS — never reassignable.
  NEW.created_by_user_id := OLD.created_by_user_id;

  IF NEW.status IN ('synced', 'discarded') THEN
    IF NEW.status = 'synced' THEN
      NEW.synced_at := now();
    END IF;
    NEW.payload_encrypted := NULL;
    NEW.payload_iv        := NULL;
    NEW.payload_alg       := NULL;
    NEW.claimed_at        := NULL;
    NEW.claimed_by_device := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.offline_edit_queue_guard_update() FROM PUBLIC;

-- Name sorts before update_offline_edit_queue_updated_at, so this runs first
-- (Postgres fires same-event triggers in name order).
DROP TRIGGER IF EXISTS offline_edit_queue_guard_update_trg ON public.offline_edit_queue;
CREATE TRIGGER offline_edit_queue_guard_update_trg BEFORE UPDATE ON public.offline_edit_queue
  FOR EACH ROW EXECUTE FUNCTION public.offline_edit_queue_guard_update();

-- No new GRANT needed: 054 already granted SELECT/INSERT/UPDATE/DELETE on the
-- whole table to authenticated. (Column-level grants are an app_users-only
-- pattern — see DATABASE.md §3.) RLS policies are unchanged and already cover
-- both new access patterns: creator-or-admin may UPDATE (the claim + the
-- tombstone) and SELECT (fetching one's own payload from a new device).

-- ============================================================================
-- OCCASIONAL MAINTENANCE (manual, not scheduled)
-- ============================================================================
-- Tombstones must outlive the longest plausible device-offline gap: an ABSENT
-- row is indistinguishable from a never-reported one, and absent means
-- "proceed". 90 days is far beyond any realistic gap.
--
-- DELETE FROM public.offline_edit_queue
--  WHERE status IN ('synced', 'discarded')
--    AND updated_at < now() - interval '90 days';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS offline_edit_queue_guard_update_trg ON public.offline_edit_queue;
-- DROP FUNCTION IF EXISTS public.offline_edit_queue_guard_update();
-- DROP INDEX IF EXISTS public.offline_edit_queue_creator_status_idx;
-- ALTER TABLE public.offline_edit_queue
--   DROP COLUMN IF EXISTS payload_encrypted,
--   DROP COLUMN IF EXISTS payload_iv,
--   DROP COLUMN IF EXISTS payload_alg,
--   DROP COLUMN IF EXISTS claimed_at,
--   DROP COLUMN IF EXISTS claimed_by_device,
--   DROP COLUMN IF EXISTS synced_at;
