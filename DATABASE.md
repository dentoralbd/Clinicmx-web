# DATABASE.md — Database Schema & Migration Guidelines

**Database:** Supabase PostgreSQL, project `https://mgzmxnkrbdawymdviclv.supabase.co` — **live production data**. Storage bucket: `patient-files` (public; created manually in the dashboard).
**Schema source of truth:** `supabase/migrations/001–030` (applied by hand in the Supabase SQL editor — there is no migration runner or CLI pipeline). TypeScript mirror: `src/lib/database.types.ts` (hand-maintained).

---

## 1. Tables (25)

### Core clinical

| Table | Purpose / key columns |
|---|---|
| `patients` | `patient_code` (unique; `PT-1xxxxx` for full patients, `CO-4xxxxx` for consultation-only — assigned by the `assign_patient_code_trigger` BEFORE INSERT trigger, 034, based on `NEW.patient_type`, replacing the old plain column default. 035 moved the CO- start to 400001; 036 switched `generate_consultation_code()` from a fixed sequence to `MAX(existing CO- number)+1`, so converting/deleting the highest-numbered consultation frees its number for reuse — see FEATURES.md §3b), name, phone (normalized on save), email, `date_of_birth`, gender, `weight` (kg, for dosing), address, `medical_history`, notes, `patient_type` (033 — `'full'`\|`'consultation'`, default `'full'`; consultation-only walk-ins are hidden from full-patient screens until converted; converting one via the app assigns a fresh `PT-1xxxxx` code in the same update). `updated_at` trigger. |
| `appointments` | `patient_id` FK, `date_time`, `duration`, `type`, `status`, notes, `reminder_sent_at` (029 — nullable timestamp, set when staff taps the one-tap WhatsApp reminder in the Appointments page queue; cleared on reschedule). |
| `patient_visits` | Per-visit clinical summary: `visit_date`, chief_complaint, examination_findings, diagnosis, treatment_plan, notes, `invoice_id` FK (023 — links a visit to the invoice it created **or paid down**). |
| `treatments` | `patient_id`, `appointment_id`, `prescription_id` + `prescription_entry_id` (links to the prescription entry that planned it), `tooth_number`, `treatment_type`, description, `status`, `cost`, `original_cost` (026 — pre-discount cost), `is_invoiced` + `invoice_id` (010), `treatment_plan_group_id` (019 — groups multi-tooth/multi-item plans for billing). |
| `prescriptions` | `medications` JSONB, `investigations` JSONB, legacy text fields (`chief_complaint`, `on_examination`, `diagnosis`, `treatment_plan`) **plus** multi-entry JSONB versions (`*_entries`, 014 — entries with per-entry tooth tags; the app writes both), notes, `weight_at_prescription`, `prescribed_date`, `appointment_id`. |
| `dental_records` | Per-tooth chart records (tooth number, condition, notes). `updated_at` trigger. |
| `patient_files` | Metadata for Storage uploads: `patient_id`, category (profile photo / clinical image / x-ray), path, name, type. Binary lives in the `patient-files` bucket. |
| `lab_work` | Lab tab (030): labwork sent to a dental lab (crowns, bridges, dentures, ortho appliances…). `lab_name`, `work_type` (checked enum), `teeth` JSONB (FDI `number[]`), `unit_count`, `shade`, `material`, `pricing_mode` (`per_unit`\|`flat`) + `unit_price`/`flat_price`, `status` (Pending→Sent→Received→Delivered, or Cancelled), `date_sent`/`expected_date`/`date_received`, `is_paid` (boolean — paid **to the lab**, not a patient invoice; no partial-payment tracking), `source_plan_group_id`/`source_treatment_id` (provenance for rows auto-created when a lab-related treatment is saved — see `src/lib/labWork.ts`). `UNIQUE(source_plan_group_id, work_type)` makes the auto-create idempotent. `updated_at` trigger. |

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
| `app_users` | Staff accounts (doctor/operator): `identifier` (email or normalized phone), `password_hash`+`password_salt` (PBKDF2-SHA256, 100k iters, hashed client-side), `role`, `permissions` JSONB (overrides role defaults; incl. `can_any_ip` since 027), `is_active`, `last_login_at`. Admin is NOT here — admin is the client-side PIN. |
| `authorized_ips` | Per-user login network gate (027): `user_id` FK→`app_users` (cascade), `ip`, `status` (pending/approved/denied), `requested_by`, `requested_at`, `decided_at`; UNIQUE(user_id, ip). App code caps approved rows at 5 per user on approval. |
| `doctor_profiles` | Clinic/doctor letterhead data (name, degrees, regno, chambers…). Singleton usage; RLS opened by 025 so it syncs across devices (was per-user in 011). |
| `activity_log` | Fire-and-forget usage log: actor, action, entity_type/id, details JSONB, `occurred_at`. |
| `edit_history` | Snapshot-before-edit per entity (017); powers revert. `entity_type` check constraint — **must be extended (020-style) when a new entity becomes trackable**. |
| `delete_history` | Full-row snapshot on delete (015), `restored_at` (016); powers restore. Same check-constraint caveat. |

## 2. Patient code generation

`generate_patient_code()` (005, offset re-based by 024 to the `PT-1xxxxx` format) backs the `patient_code` column default and an RPC the app calls (`lib/patientCode.ts` — `ensurePatientCode`). Codes are server-assigned from a sequence; client code must never invent final codes. (Roadmap M4 formalizes this with provisional `PT-TMP-*` codes replaced by a `BEFORE INSERT` trigger.)

## 3. Row Level Security — current state

RLS is **enabled with allow-all policies** (`FOR ALL USING (true)`) on every table — i.e. decorative. The anon key in the client bundle can read/write everything; the app's login/permissions are client-side only. This is a known, accepted gap: **roadmap M3** replaces it with Supabase Auth + real policies (authenticated-only access, deletes gated on role/`can_delete`, anon revoked on tables, storage, and RPCs). Exception: `doctor_profiles` briefly had a real per-user policy (011) which broke cross-device sync and was opened up (025).

## 4. Migration guidelines

1. **Numbering:** next is `037_short_name.sql` (031 added `backup_settings`, 032 added `app_notifications`, 033 added `patients.patient_type`, 034 added the `CO-` consultation patient-code series + `assign_patient_code_trigger`, 035 revised the CO- series start to 400001, 036 switched `generate_consultation_code()` to `MAX(existing)+1` so freed CO- numbers get reused). Watch out — history already contains two duplicate numbers (`003_add_patient_code` / `003_patient_files`, and `014_add_patient_weight` / `014_prescription_multi_entry_fields`). Don't add more; check the folder before numbering.
2. **Idempotent style:** use `IF NOT EXISTS` / guarded `DO $$` blocks (the established pattern) so re-running in the SQL editor is safe.
3. **Application is manual:** paste into the Supabase SQL editor. There is no `supabase db push`, no migration state table — the file numbering is the only record. Note in the PR/commit when a migration has actually been applied to prod.
4. **Live-data protocol (mandatory):** staging-first (restore a nightly backup into a scratch Supabase project via `scripts/backup/restore.mjs`), explicit user sign-off, fresh manual backup immediately before applying, written rollback statement alongside the migration.
5. **Update the TypeScript mirrors in the same change:** `src/lib/database.types.ts` (always) and `src/lib/entityTables.ts` → `ENTITY_TABLE_COLUMNS` (when the entity is audit-tracked — a missed column silently drops from snapshots/restores). Extend the `edit_history`/`delete_history` entity-type check constraints when introducing a new tracked entity (see 020).
6. **New tables need:** RLS enabled + policy (allow-all today, real policy post-M3), indexes on FK/date columns (established pattern), `updated_at` trigger if the table has that column, and inclusion in the nightly backup's table list (`scripts/backup/` — verify it enumerates the new table; backup changes push to both remotes).
7. **Don't pre-add sync columns** (`version`, `sync_status`, soft-delete flags) — locked decision; PowerSync manages its own state.

## 5. Backups & restore

- Nightly: all 25 tables → zipped JSON + `patient-files` mirror → Google Drive (3:00 AM BDT; workflow live only on `gsbanikudc-byte/Clinicmx-web`). Daily/weekly/monthly tiers, retention, verification, anomaly detection, encryption (2026-07-18).
- In-app: `/backup` page — device JSON download/restore (dry-run first) + one-tap Drive upload.
- Restore tooling: `scripts/backup/restore.mjs`, dry-run by default, `--confirm` to write.
- **Incident history:** a real invoice was accidentally deleted 2026-07-02 (pre-backup era) — the reason this system exists. Assume no second chances: back up before risky operations.
