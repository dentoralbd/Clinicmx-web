# DATABASE.md — Database Schema & Migration Guidelines

**Database:** Supabase PostgreSQL, project `https://mgzmxnkrbdawymdviclv.supabase.co` — **live production data**. Storage bucket: `patient-files` (public; created manually in the dashboard).
**Schema source of truth:** `supabase/migrations/001–050` (applied by hand in the Supabase SQL editor — there is no migration runner or CLI pipeline). TypeScript mirror: `src/lib/database.types.ts` (hand-maintained).

---

## 1. Tables (27)

### Core clinical

| Table | Purpose / key columns |
|---|---|
| `patients` | `patient_code` (unique; `PT-1xxxxx` for full patients, `CO-4xxxxx` for consultation-only — assigned by the `assign_patient_code_trigger` BEFORE INSERT trigger, 034, based on `NEW.patient_type`, replacing the old plain column default. 035 moved the CO- start to 400001; 036 switched `generate_consultation_code()` from a fixed sequence to `MAX(existing CO- number)+1`, so converting/deleting the highest-numbered consultation frees its number for reuse — see FEATURES.md §3b), name, phone (normalized on save), email, `date_of_birth`, gender, `weight` (kg, for dosing), address, `medical_history`, notes, `patient_type` (033 — `'full'`\|`'consultation'`, default `'full'`; consultation-only walk-ins are hidden from full-patient screens until converted; converting one via the app assigns a fresh `PT-1xxxxx` code in the same update), `followup_reminder_sent_at` (050 — nullable timestamp, set when staff taps the one-tap WhatsApp treatment follow-up reminder on the Dashboard card; snoozes that patient off the card for 30 days). `updated_at` trigger. |
| `appointments` | `patient_id` FK, `date_time`, `duration`, `type`, `status`, notes, `reminder_sent_at` (029 — nullable timestamp, set when staff taps the one-tap WhatsApp reminder in the Appointments page queue; cleared on reschedule). |
| `patient_visits` | Per-visit clinical summary: `visit_date`, chief_complaint, examination_findings, diagnosis, treatment_plan, notes, `invoice_id` FK (023 — links a visit to the invoice it created **or paid down**). |
| `treatments` | `patient_id`, `appointment_id`, `prescription_id` + `prescription_entry_id` (links to the prescription entry that planned it), `tooth_number`, `treatment_type`, description, `status`, `cost`, `original_cost` (026 — pre-discount cost), `is_invoiced` + `invoice_id` (010), `treatment_plan_group_id` (019 — groups multi-tooth/multi-item plans for billing), `doctor_name` + `doctor_share_pct` (042 — free-text attributed doctor + their revenue-share %, default **30** as of migration 044; UI only lets `doctor`/`admin` roles set the default, and only `admin` can edit the % — see FEATURES.md §15b). **Known risk:** `doctor_name` is matched against `app_users.full_name` by exact case-insensitive string, not a FK — if an account's `full_name` and the string already saved on its treatments ever diverge (e.g. bulk-assign wrote a different string than the account's own name), the doctor's self-locked Doctor Analytics view silently shows nothing for those rows. Hit for real 2026-08-02 (an `app_users.full_name` of `"gopi"` vs. `"Dr. Gopi Sankar Banik"` already on every treatment); fixed by renaming the account to match, not by touching the treatments — see the 2026-08-02 CHANGELOG entry. `completed_at` (047 — `TIMESTAMPTZ`, auto-stamped by a `BEFORE INSERT OR UPDATE` trigger the moment `status` transitions into `'Completed'`, cleared back to `NULL` if it moves away; Doctor Analytics buckets payout statements by this, not `created_at`). |
| `prescriptions` | `medications` JSONB, `investigations` JSONB, legacy text fields (`chief_complaint`, `on_examination`, `diagnosis`, `treatment_plan`) **plus** multi-entry JSONB versions (`*_entries`, 014 — entries with per-entry tooth tags; the app writes both), notes, `weight_at_prescription`, `prescribed_date`, `appointment_id`. |
| `dental_records` | Per-tooth chart records (tooth number, condition, notes). `updated_at` trigger. |
| `patient_files` | Metadata for Storage uploads: `patient_id`, category (profile photo / clinical image / x-ray), path, name, type. Binary lives in the `patient-files` bucket. |
| `lab_work` | Lab tab (030): labwork sent to a dental lab (crowns, bridges, dentures, ortho appliances…). `lab_name`, `work_type` (checked enum), `teeth` JSONB (FDI `number[]`), `unit_count`, `shade`, `material`, `pricing_mode` (`per_unit`\|`flat`) + `unit_price`/`flat_price`, `status` (Pending→Sent→Received→Delivered, or Cancelled), `date_sent`/`expected_date`/`date_received`, `is_paid` (boolean — paid **to the lab**, not a patient invoice; no partial-payment tracking), `source_plan_group_id`/`source_treatment_id` (provenance for rows auto-created when a lab-related treatment is saved — see `src/lib/labWork.ts`). `UNIQUE(source_plan_group_id, work_type)` makes the auto-create idempotent. `updated_at` trigger. |

### Staff & payroll (045)

| Table | Purpose / key columns |
|---|---|
| `staff` | Salaried staff roster (Staff Analytics tab, incl. any fixed-salary doctors): name, phone, designation, `monthly_salary`, `is_active`. |
| `staff_salary_payments` | One row per (staff, `period_month` `'YYYY-MM'`), `UNIQUE(staff_id, period_month)` so "generate this month" is an idempotent upsert. `base_salary` is a **snapshot** of `staff.monthly_salary` at row-creation time — a later raise doesn't rewrite an already-generated month's statement. Plus `bonus`, `deduction`, `advance`, `amount_paid`, `payment_date`, notes. |

### Templates & reference

| Table | Purpose |
|---|---|
| `medication_templates` | Saved medication sets for prescription reuse |
| `investigation_templates` | Saved investigation sets |

### Billing

| Table | Purpose / key columns |
|---|---|
| `invoices` | `items` JSONB, `total_amount`, `paid_amount`, `discount_amount`/`discount_type`(`fixed`\|`percent`)/`discount_value`, `tax_amount`/`tax_rate`, `invoice_number` (from `invoice_settings` counter), `invoice_type` (`basic`\|advanced), notes, `payment_terms`, recurring fields, `template_id`, `credit_amount`, `late_fee_amount`, `merged_into_invoice_id` (018 — merged invoices point at the survivor), `status`, `due_date`. |
| `payments` | Partial payments: `invoice_id`, amount, `payment_date`, `payment_method` (009). Paid/due should derive from this table. |
| `payment_methods` | Lookup (cash, card, bKash, …) |
| `payment_plans` | Installment plans per invoice |
| `invoice_templates` | Reusable invoice item sets (some system-seeded) |
| `invoice_history` | Per-invoice event log |
| `invoice_settings` | Singleton row: numbering counter/prefix and invoice defaults |

### Inventory

| Table | Purpose |
|---|---|
| `inventory_items` | name, category (Materials/Instruments/Others), quantity, unit, `low_stock_threshold`, supplier, cost, `expiry_date`. Seeded with dental starter data (006). |
| `inventory_movements` | Stock in/out per item |

### Identity, audit & admin

| Table | Purpose / key columns |
|---|---|
| `app_users` | Staff accounts (doctor/operator): `identifier` (email or normalized phone), `password_hash`+`password_salt` (PBKDF2-SHA256, 100k iters, hashed client-side), `role`, `permissions` JSONB (overrides role defaults; incl. `can_any_ip` since 027, and `can_set_doctor_share_pct`/`can_access_doctor_analytics`/`can_access_staff_analytics` since 2026-08-01 — see FEATURES.md §1), `is_active`, `last_login_at`, `default_share_pct` (048, nullable numeric — a doctor account's own default for `treatments.doctor_share_pct`, applied when that doctor is picked on a New Treatment Plan item; NULL falls back to the 30% clinic default; set via Admin → Users → Add/Edit Account, doctor role only). Admin is NOT here — admin is the client-side PIN. |
| `authorized_ips` | Per-user login network gate (027): `user_id` FK→`app_users` (cascade), `ip`, `status` (pending/approved/denied), `requested_by`, `requested_at`, `decided_at`; UNIQUE(user_id, ip). App code caps approved rows at 5 per user on approval. |
| `doctor_profiles` | Clinic/doctor letterhead data (name, degrees, regno, chambers…). Singleton usage; RLS opened by 025 so it syncs across devices (was per-user in 011). |
| `activity_log` | Fire-and-forget usage log: actor, action, entity_type/id, details JSONB, `occurred_at`. |
| `edit_history` | Snapshot-before-edit per entity (017); powers revert. `entity_type` check constraint — **must be extended (020-style) when a new entity becomes trackable**. |
| `delete_history` | Full-row snapshot on delete (015), `restored_at` (016); powers restore. Same check-constraint caveat. |

## 2. Patient code generation

`generate_patient_code()` (005, offset re-based by 024 to the `PT-1xxxxx` format) backs the `patient_code` column default and an RPC the app calls (`lib/patientCode.ts` — `ensurePatientCode`). Codes are server-assigned from a sequence; client code must never invent final codes. (Roadmap M4 formalizes this with provisional `PT-TMP-*` codes replaced by a `BEFORE INSERT` trigger.)

## 3. Row Level Security — current state

**Stale note removed 2026-08-01** — this section previously said RLS was decorative (`FOR ALL USING (true)` everywhere); that was true through migration 038 but has not been true since **039 (2026-07-26, roadmap M3 landed)**. Current state:

- Every table requires a real Supabase Auth session (`authenticated` role) — the anon key in the
  client bundle has **zero** grants on any table/sequence/function as of 039 (`REVOKE ALL ... FROM
  anon`), confirmed live: `permission denied for table X` for every anon request.
- Login (Admin PIN, or Doctor/Operator email+password) mints a real Supabase Auth session behind
  the scenes — see `src/pages/Login.tsx` and `functions/api/admin-otp.ts`.
- Shared SQL helper functions (`038_auth_identity.sql`), all `SECURITY DEFINER`, `STABLE`,
  `search_path` pinned:
  - `is_active_app_user()` — the base gate on the 20 "ordinary data" tables (patients, treatments,
    invoices, etc.): any active `app_users` row, any role, may SELECT/INSERT/UPDATE.
  - `is_app_admin()` — admin-only gate, used for DELETE on the ordinary-data tables and for the
    account-management tables (`app_users`, `doctor_profiles` delete, etc.).
  - `app_can(flag text)` — per-account permission gate: `role = 'admin' OR
    (permissions ->> flag)::boolean`. Admin always passes; anyone else needs that key `true` in
    their `app_users.permissions` JSONB. Used for `can_edit_clinic_profile`, `can_delete`,
    `can_revert`, and (since 046) `can_access_staff_analytics` on `staff`/`staff_salary_payments`.
- `app_users` itself has **column-level** grants (039 §4) — `SELECT` excludes `password_hash`/
  `password_salt` entirely; a plain `select('*')` fails with `permission denied for column
  password_hash` (must name columns explicitly, see `src/lib/appUsers.ts`). Non-admins can only read
  their own row by default; 043 added `app_users_select_roster` (an *additional* OR'd policy) so
  any active user can see the names/roles of active doctors/admins — needed for the doctor
  attribution dropdown, doesn't expose anything the column grant already blocks.
  **Gotcha, hit for real 2026-08-02:** because `app_users` uses an allow-list instead of a table-wide
  grant, `ALTER TABLE app_users ADD COLUMN ...` (048, added `default_share_pct`) is **not** enough on
  its own — the new column is invisible to `authenticated` until it's also added to the `GRANT
  SELECT (...)` list, otherwise any query that names it (PostgREST expands `select('...')`
  server-side) fails with `permission denied for table app_users` — not a column-specific message,
  easy to misread as an RLS/policy problem. 048 shipped without the grant and broke the Users tab +
  doctor roster load in prod for a few minutes; 049 added the missing `GRANT SELECT
  (default_share_pct) ON public.app_users TO authenticated`. Any future `app_users` column needs its
  grant added in the same migration.
- **A new table gets zero grants by default** — 039 only revoked *future* anon grants, it never
  added a matching default grant for `authenticated`. Every new table needs an explicit
  `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO authenticated;` in the same migration that
  creates it (both `staff` and `staff_salary_payments`, 045, do this) or PostgREST reports
  `Could not find the table 'public.X' in the schema cache` — looks like a stale-cache bug, isn't
  one.
- `doctor_profiles` is deliberately **not** scoped per-user (011's attempt broke cross-device sync,
  reverted 025) — every active user can read/write the one clinic profile row.

## 4. Migration guidelines

1. **Numbering:** next is `051_short_name.sql`. Recent: 037 fixed the `patient_code_seq` pollution incident; 038 added the Supabase-Auth helper functions (`is_active_app_user()`/`is_app_admin()`/`app_can()`); **039 is the RLS lockdown** — see §3 above, the load-bearing one; 040/041 unaccounted for in this doc (check the folder if it matters); 042 added `treatments.doctor_name`/`doctor_share_pct`; 043 fixed migration-042 fallout (RLS filter injection response, `app_users_select_roster` policy) + unified default share to 50%; 044 revised that default to 30% same day per user decision; 045 added `staff`/`staff_salary_payments`; 046 added `app_can('can_access_staff_analytics')` RLS to those two tables; 047 added `treatments.completed_at` + its auto-stamp trigger; 048 added `app_users.default_share_pct`; 049 added the column-level grant 048 forgot (see §3's gotcha above); 050 added `patients.followup_reminder_sent_at` (Dashboard treatment follow-up card — plain table-level grant already covers `patients`, no separate grant migration needed, unlike `app_users`). Watch out — history already contains two duplicate numbers (`003_add_patient_code` / `003_patient_files`, and `014_add_patient_weight` / `014_prescription_multi_entry_fields`). Don't add more; check the folder before numbering.
2. **Idempotent style:** use `IF NOT EXISTS` / guarded `DO $$` blocks (the established pattern) so re-running in the SQL editor is safe.
3. **Application is manual:** paste into the Supabase SQL editor. There is no `supabase db push`, no migration state table — the file numbering is the only record. Note in the PR/commit when a migration has actually been applied to prod.
4. **Live-data protocol (mandatory):** staging-first (restore a nightly backup into a scratch Supabase project via `scripts/backup/restore.mjs`), explicit user sign-off, fresh manual backup immediately before applying, written rollback statement alongside the migration.
5. **Update the TypeScript mirrors in the same change:** `src/lib/database.types.ts` (always) and `src/lib/entityTables.ts` → `ENTITY_TABLE_COLUMNS` (when the entity is audit-tracked — a missed column silently drops from snapshots/restores). Extend the `edit_history`/`delete_history` entity-type check constraints when introducing a new tracked entity (see 020).
6. **New tables need:** RLS enabled + policy (allow-all today, real policy post-M3), indexes on FK/date columns (established pattern), `updated_at` trigger if the table has that column, and inclusion in the nightly backup's table list (`scripts/backup/` — verify it enumerates the new table; backup changes push to both remotes).
7. **Don't pre-add sync columns** (`version`, `sync_status`, soft-delete flags) — locked decision; PowerSync manages its own state.

## 5. Backups & restore

- Nightly: all 31 tables → zipped JSON + `patient-files` mirror → Google Drive (3:00 AM BDT; workflow live only on `gsbanikudc-byte/Clinicmx-web`, and per the workspace-level CLAUDE.md this scheduled run is retired 2026-07-20 in favor of the in-app mechanism below — the script itself still works if run by hand). Daily/weekly/monthly tiers, retention, verification, anomaly detection, encryption (2026-07-18). **2026-08-01: `staff`/`staff_salary_payments` (migration 045, shipped same day) had been left out of both `scripts/backup/lib.mjs`'s `TABLES_IN_DEPENDENCY_ORDER` and the in-app `BACKUP_TABLES` (`src/lib/deviceBackup.ts`) — found and fixed while writing this doc entry, per rule 6 above. Restores normally (no `app_users`-style skip; it's plain business data, not credentials).** **2026-08-03: same failure mode found again on audit — `backup_settings` (031) and `app_notifications` (032) had never been in either table list despite being live and RLS-readable for months; also `app_users.default_share_pct` (048) was silently dropped from the in-app backup's own hand-maintained column allowlist (`TABLE_SELECT_COLUMNS`, needed because that table can't use `select('*')` under the RLS lockdown). The local script (`scripts/backup/lib.mjs`) additionally had its own separate gap the in-app backup didn't: `appointment_schedule_windows`/`appointment_schedule_date_overrides` (041, the live slot-scheduling tables) were missing from it alone — the in-app list already had both right. All fixed same day in both `deviceBackup.ts` and `scripts/backup/lib.mjs`. (A fifth suspected gap, `appointment_settings` from migration 040, turned out to be a false alarm — that table was superseded and `DROP TABLE`'d by migration 041 the same day it landed, so it correctly has never been in either backup list; verified live against prod, where querying it 404s. Don't add it back.) Given the real gaps have now happened twice, treat "add the new table/column to both backup lists, and check the two lists still agree with each other" as a mandatory step of shipping any schema change, not an optional follow-up.**
- In-app: `/backup` page — device JSON download/restore (dry-run first) + one-tap Drive upload.
- Restore tooling: `scripts/backup/restore.mjs`, dry-run by default, `--confirm` to write.
- **Incident history:** a real invoice was accidentally deleted 2026-07-02 (pre-backup era) — the reason this system exists. Assume no second chances: back up before risky operations.
