# DATABASE.md — Database Schema & Migration Guidelines

**Database:** Supabase PostgreSQL, project `https://mgzmxnkrbdawymdviclv.supabase.co` — **live production data**. Storage bucket: `patient-files` (public; created manually in the dashboard).
**Schema source of truth:** `supabase/migrations/001–061` (applied by hand in the Supabase SQL editor — there is no migration runner or CLI pipeline). TypeScript mirror: `src/lib/database.types.ts` (hand-maintained).

---

## 1. Tables (35)

### Core clinical

| Table | Purpose / key columns |
|---|---|
| `patients` | `patient_code` (unique; `PT-1xxxxx` for full patients, `CO-4xxxxx` for consultation-only — assigned by the `assign_patient_code_trigger` BEFORE INSERT trigger, 034, based on `NEW.patient_type`, replacing the old plain column default. 035 moved the CO- start to 400001; 036 switched `generate_consultation_code()` from a fixed sequence to `MAX(existing CO- number)+1`, so converting/deleting the highest-numbered consultation frees its number for reuse — see FEATURES.md §3b), name, phone (normalized on save), email, `date_of_birth`, gender, `weight` (kg, for dosing), address, `medical_history`, notes, `patient_type` (033 — `'full'`\|`'consultation'`, default `'full'`; consultation-only walk-ins are hidden from full-patient screens until converted; converting one via the app assigns a fresh `PT-1xxxxx` code in the same update), `followup_reminder_sent_at` (050 — nullable timestamp, set when staff taps the one-tap WhatsApp treatment follow-up reminder on the Dashboard card; snoozes that patient off the card for 30 days), `dob_is_estimated` (065 — boolean, default `false`; `true` when `date_of_birth` came from `deriveDateOfBirthFromAge()` in `Patients.tsx` rather than a real birthdate, so the Celebrations & Greetings feature's birthday check can skip it instead of wrongly flagging the patient's registration date as their birthday every year — existing rows default `false` since the original source can't be recovered). `updated_at` trigger. |
| `appointments` | `patient_id` FK, `date_time`, `duration`, `type`, `status`, notes, `reminder_sent_at` (029 — nullable timestamp, set when staff taps the one-tap WhatsApp reminder in the Appointments page queue; cleared on reschedule). |
| `patient_visits` | Per-visit clinical summary: `visit_date`, chief_complaint, examination_findings, diagnosis, treatment_plan, notes, `invoice_id` FK (023 — links a visit to the invoice it created **or paid down**). |
| `treatments` | `patient_id`, `appointment_id`, `prescription_id` + `prescription_entry_id` (links to the prescription entry that planned it), `tooth_number`, `treatment_type`, description, `status`, `cost`, `original_cost` (026 — pre-discount cost), `is_invoiced` + `invoice_id` (010), `treatment_plan_group_id` (019 — groups multi-tooth/multi-item plans for billing), `doctor_name` + `doctor_share_pct` (042 — free-text attributed doctor + their revenue-share %, default **30** as of migration 044; UI only lets `doctor`/`admin` roles set the default, and only `admin` can edit the % — see FEATURES.md §15b). **Known risk:** `doctor_name` is matched against `app_users.full_name` by exact case-insensitive string, not a FK — if an account's `full_name` and the string already saved on its treatments ever diverge (e.g. bulk-assign wrote a different string than the account's own name), the doctor's self-locked Doctor Analytics view silently shows nothing for those rows. Hit for real 2026-08-02 (an `app_users.full_name` of `"gopi"` vs. `"Dr. Gopi Sankar Banik"` already on every treatment); fixed by renaming the account to match, not by touching the treatments — see the 2026-08-02 CHANGELOG entry. `completed_at` (047 — `TIMESTAMPTZ`, auto-stamped by a `BEFORE INSERT OR UPDATE` trigger the moment `status` transitions into `'Completed'`, cleared back to `NULL` if it moves away; Doctor Analytics buckets payout statements by this, not `created_at`). |
| `prescriptions` | `medications` JSONB, `investigations` JSONB, legacy text fields (`chief_complaint`, `on_examination`, `diagnosis`, `treatment_plan`) **plus** multi-entry JSONB versions (`*_entries`, 014 — entries with per-entry tooth tags; the app writes both), notes, `weight_at_prescription`, `prescribed_date`, `appointment_id`. |
| `dental_records` | Per-tooth chart records (tooth number, condition, notes). `updated_at` trigger. |
| `patient_files` | Metadata for Storage uploads: `patient_id`, category (profile photo / clinical image / x-ray), path, name, type. Binary lives in the `patient-files` bucket. |
| `lab_work` | Lab tab (030): labwork sent to a dental lab (crowns, bridges, dentures, ortho appliances…). `lab_name`, `work_type` (checked enum), `teeth` JSONB (FDI `number[]`), `unit_count`, `shade`, `material`, `pricing_mode` (`per_unit`\|`flat`) + `unit_price`/`flat_price`, `status` (Pending→Sent→Received→Delivered, or Cancelled), `date_sent`/`expected_date`/`date_received`, `is_paid` (boolean — paid **to the lab**, not a patient invoice; no partial-payment tracking), `source_plan_group_id`/`source_treatment_id` (provenance for rows auto-created when a lab-related treatment is saved — see `src/lib/labWork.ts`). `UNIQUE(source_plan_group_id, work_type)` makes the auto-create idempotent. `updated_at` trigger. |

### Staff & payroll (045, 052)

| Table | Purpose / key columns |
|---|---|
| `staff` | Salaried staff roster (HR & Payroll → Staff & Salary tab, `/hr-payroll`, admin-only — moved out of Financial Analysis 2026-08-08; incl. any fixed-salary doctors): name, phone, designation, `monthly_salary`, `is_active`, `leave_quota_days` (053, `NUMERIC NOT NULL DEFAULT 20` — annual leave entitlement, admin-set in the same Add/Edit Staff modal; feeds `my_leave_balance()` below). |
| `staff_salary_payments` | One row per (staff, `period_month` `'YYYY-MM'`), `UNIQUE(staff_id, period_month)` so "generate this month" is an idempotent upsert. `base_salary` is a **snapshot** of `staff.monthly_salary` at row-creation time — a later raise doesn't rewrite an already-generated month's statement. Plus `bonus`, `deduction`, `advance`, `amount_paid`, `payment_date`, notes. |
| `staff_leaves` (052) | Leave requests: `staff_id`/`app_user_id` (both nullable, resolved by a `BEFORE INSERT` trigger — see §3), `requester_name` (name **snapshot**, not a join, so the admin list renders without giving requesters read access to `staff`), `leave_type` (`Annual`\|`Sick`\|`Casual`\|`Unpaid`\|`Maternity`), `start_date`/`end_date`, `reason`, `status` (`Pending`\|`Approved`\|`Rejected`), `decided_by`/`decided_at`/`decision_note`. Admin reviews from HR & Payroll → Leave Requests; every active app user files their own from Doctor/Operator Zone → My Leave (`src/components/hr/MyLeaveTab.tsx`). |

`my_leave_balance(p_year int)` (053) — `SECURITY DEFINER` RPC, `EXECUTE` granted to `authenticated`,
returns `(quota_days, used_days, remaining_days)` for the *calling* account only
(`s.app_user_id = current_app_user_id()`), used_days = Σ inclusive-day-count of that account's
**Approved** `staff_leaves` rows (any `leave_type` — user decision, 2026-08-08) whose `start_date`
falls in the given calendar year, default current year. Backs the "Total Leave / Used / Leave Left"
tiles on My Leave. Deliberately an RPC rather than a `staff` SELECT policy: `staff` also holds
`monthly_salary`, gated admin/`can_access_staff_analytics`-only (046), and RLS is row-level — a
"read your own row" policy would hand every linked account its own salary figure along with the
quota. The function bypasses `staff`'s RLS by ownership (same SECURITY DEFINER pattern as
`staff_leaves_fill_requester()`, 052) and returns only the three numbers. Zero rows back means the
calling account isn't linked to any `staff.app_user_id` — the tab treats that as "no quota to show",
not an error.

### Templates & reference

| Table | Purpose |
|---|---|
| `medication_templates` | Saved medication sets for prescription reuse |
| `investigation_templates` | Saved investigation sets |

### Billing

| Table | Purpose / key columns |
|---|---|
| `invoices` | `items` JSONB, `total_amount`, `paid_amount`, `discount_amount`/`discount_type`(`fixed`\|`percentage`)/`discount_value`, `tax_amount`/`tax_rate`, `invoice_number` (from `invoice_settings` counter), `invoice_type` (`basic`\|advanced), notes, `payment_terms`, recurring fields, `template_id`, `credit_amount`, `late_fee_amount`, `merged_into_invoice_id` (018 — merged invoices point at the survivor), `status`, `due_date`. |
| `payments` | Partial payments: `invoice_id`, amount, `payment_date`, `payment_method` (009). Paid/due should derive from this table. **066 added** `gateway_provider`/`gateway_reference`/`gateway_transaction_id`/`gateway_status` (Bangla QR / SMS-verified payments — `recordInvoicePayment` in `src/lib/payments.ts`); `gateway_reference` has a partial unique index (`idx_payments_gateway_reference_unique`, `WHERE gateway_reference IS NOT NULL`) as the idempotency guard against double-recording the same SMS/TrxID. |
| `payment_methods` | Lookup (cash, card, bKash, …) |
| `payment_plans` | Installment plans per invoice |
| `invoice_templates` | Reusable invoice item sets (some system-seeded) |
| `invoice_history` | Per-invoice event log |
| `invoice_settings` | Singleton row: numbering counter/prefix and invoice defaults. **066 added** `bangla_qr_merchant_payload` (raw EMVCo static QR string for the clinic's merchant; seeded to the real Pubali Bank PLC payload, editable in Billing → Invoice Settings). |

### Inventory

| Table | Purpose |
|---|---|
| `inventory_items` | name, category (Materials/Instruments/Others), quantity, unit, `low_stock_threshold`, supplier, cost, `expiry_date`. Seeded with dental starter data (006). |
| `inventory_movements` | Stock in/out per item |

### Catalog (057)

| Table | Purpose / key columns |
|---|---|
| `catalog_categories` | Clinic-managed categories, `domain` (`'treatment'`\|`'medication'`) + `name`, `UNIQUE(domain, name)`. Seeded with the 11 built-in `dentalDrugDatabase.ts` drug categories (medication) and one starter "General Procedures" category (treatment) holding the union of the app's previously-hardcoded treatment-type dropdown lists. `ON DELETE RESTRICT` from both item tables below — a category with items still assigned can't be deleted (mirrors the "missing category → invisible items" bug class already hit once in `DrugPicker`, from the other direction). |
| `treatment_catalog_items` | Clinic-added procedures: `category_id` FK, `name` (unique), `default_fee` (nullable), `default_duration_mins` (nullable, added by 061 — chair-time used by the Patient Queue's ETA engine, editable on `/catalog`). Backs the shared `<TreatmentTypeSelect>` component used by all 4 `treatment_type` dropdown sites (`Treatments.tsx` x2, `PatientProfile.tsx` x2). |
| `custom_medications` | Clinic-added medications, additive alongside the hardcoded `dentalDrugDatabase.ts` directory (untouched): `category_id` FK, `brand`, `generic`, dosage/frequency/duration/instructions/route defaults. Merged into `DrugPicker.tsx`'s search/dropdown. |

### Patient Queue (061)

| Table | Purpose / key columns |
|---|---|
| `queue_entries` | Waiting-room queue, one row per patient's visit today. `patient_id`/`appointment_id` (both nullable — walk-ins may have neither an appointment nor, rarely, a matched patient record yet), `patient_name` (denormalized for fast board reads), `serial_number` (fixed daily ticket id, `UNIQUE(queue_date, serial_number)`, allocated atomically by `next_queue_serial()` so two simultaneous check-ins can't collide), `sort_key` (the single ordering axis — see below), `status` (`waiting`\|`serving`\|`on_hold`\|`completed`\|`skipped`), `assigned_doctor` FK→`app_users` (written only once a doctor actually calls the patient — there is no pre-assignment), `room_number`, `procedure_name`, `estimated_duration_mins`, `priority` (`normal`\|`urgent`), `hold_reason`, `billing_status` (`none`\|`pending_payment`\|`paid_and_dispensed`), `queue_date` (explicit, not derived from `created_at`, so the clinic's local "today" never has to reconcile against the DB's UTC clock), `absent_marks`/`last_absent_at`, `called_at` (stamped on transition into `serving` — ETA math uses this, not `updated_at`). `updated_at` trigger. **No `anon` grant, no `anon` policy** — the patient-facing board reads through a Cloudflare Function with `service_role` instead (`functions/api/queue-board.ts`), not directly from the browser; see FEATURES.md and API.md. |
| `queue_settings` | Singleton (one row, `id boolean PRIMARY KEY DEFAULT true`): `privacy_mode` (`full`\|`masked`\|`token_only`, applies to every board surface including the patient-facing one), `infotainment_enabled`/`infotainment_interval_secs`, `absent_pushdown_places` (default 3). Read = any active app user; write = admin only. |

**Ordering model — the queue follows the appointment schedule, not check-in order.** `sort_key` (`NUMERIC`) is the one ordering axis; every list and every "call next" action sorts `(priority = 'urgent') DESC, sort_key ASC`. A patient pulled from a scheduled appointment gets `sort_key` = the appointment's `date_time` (epoch minutes); a walk-in gets `sort_key` = arrival time — both are the same expression, so a walk-in naturally slots in among appointments whose times have already passed with no special-case code. Inserting or reordering an entry writes the **midpoint** between its new neighbours' `sort_key`s (fractional/"between" ordering), so every operation touches exactly one row and never renumbers the queue. "Absent" pushes an entry down `queue_settings.absent_pushdown_places` places (midpoint math again) rather than sending it to the back or removing it. Position on screen ("3rd in line") is **computed at read time** from this sort, never stored — see `src/lib/queueOrder.ts`, the single module every caller (reception, the doctor's floating widget, the display board, the Cloudflare Function) must route through so this can't drift into three different sort implementations.

`next_queue_serial(p_queue_date date)` — `SECURITY DEFINER` RPC, `EXECUTE` granted to `authenticated`, returns the next serial for that date atomically (read-max-then-insert from client code would race two simultaneous check-ins onto the same serial).

Procedure durations for the queue's ETA engine come from `treatment_catalog_items.default_duration_mins` (added by 061) — the existing catalog table (057), not a separate/duplicated list, so every screen sees the same durations.

### Identity, audit & admin

| Table | Purpose / key columns |
|---|---|
| `app_users` | Staff accounts (doctor/operator): `identifier` (email or normalized phone), `password_hash`+`password_salt` (PBKDF2-SHA256, 100k iters, hashed client-side), `role`, `permissions` JSONB (overrides role defaults; incl. `can_any_ip` since 027, and `can_set_doctor_share_pct`/`can_access_doctor_analytics`/`can_access_staff_analytics` since 2026-08-01 — see FEATURES.md §1), `is_active`, `last_login_at`, `default_share_pct` (048, nullable numeric — a doctor account's own default for `treatments.doctor_share_pct`, applied when that doctor is picked on a New Treatment Plan item; NULL falls back to the 30% clinic default; set via Admin → Users → Add/Edit Account, doctor role only). Admin is NOT here — admin is the client-side PIN. |
| `authorized_ips` | Per-user login network gate (027): `user_id` FK→`app_users` (cascade), `ip`, `status` (pending/approved/denied), `requested_by`, `requested_at`, `decided_at`; UNIQUE(user_id, ip). App code caps approved rows at 5 per user on approval. |
| `doctor_profiles` | Clinic/doctor letterhead data (name, degrees, regno, chambers…). Singleton usage; RLS opened by 025 so it syncs across devices (was per-user in 011). |
| `prescription_letterhead_doctors` (058) | Genuinely multi-row roster of doctors shown on the prescription letterhead (`full_name`, `degrees`, `designation`, `bmdc_reg`, `display_order`, `is_active`) — deliberately separate from the `doctor_profiles` singleton above, which stays the source for clinic-wide info (logo/address/phone) and is still used unmodified elsewhere (Invoice letterhead, etc.). Managed via Admin → Prescription Doctors. Seeded from today's single `doctor_profiles` row on migration so the letterhead isn't blank on first deploy. Access mirrors `doctor_profiles`': any active user reads, `can_edit_clinic_profile` writes, admin-only deletes. |
| `activity_log` | Fire-and-forget usage log: actor, action, entity_type/id, details JSONB, `occurred_at`. |
| `edit_history` | Snapshot-before-edit per entity (017); powers revert. `entity_type` check constraint — **must be extended (020-style) when a new entity becomes trackable**. |
| `delete_history` | Full-row snapshot on delete (015), `restored_at` (016); powers restore. Same check-constraint caveat. |
| `backup_upload_claims` (060) | Cross-session lock for Smart-upload auto-backups: one pre-seeded row per category (`daily`/`weekly`/`monthly`) holding `instant`/`claimed_at`/`claimed_by_device`. `claimBackupUpload()` (`backupReminders.ts`) does an atomic `UPDATE ... WHERE` compare-and-swap (same pattern as `offline_edit_queue`'s `claimMutation()`) so only one session actually uploads a given scheduled instant. Deliberately excluded from device/nightly backups (transient lock state, not clinic data — same reasoning as `offline_edit_queue`, also excluded). |
| `integrity_findings` (064) | Read-only data-integrity scanner output — Admin (and Doctor, read-only) → Integrity tab (`/admin?tab=integrity`). One row per `(check_name, entity_id)`, upserted on every scan run; `details` JSONB carries the raw mismatch values, `details_hash` lets a re-flag reopen an already-reviewed row only if the underlying values actually changed. `resolved_at` is set (not deleted) the moment a scan run no longer reproduces a finding. No auto-fix, no writes to any clinical/financial table — see §3 below and the migration's own header for the full design. Deliberately excluded from device/nightly backups (derived state, fully regenerable by re-running the scan — same reasoning as `backup_upload_claims`/`offline_edit_queue`). |
| `integrity_scan_runs` (064) | One row per scan invocation (`triggered_by`: `'admin-panel'` \| `'local-script'`, `status`, `counts` JSONB). Exists because the scan has **no scheduler** in v1 — without this, an empty findings list would be indistinguishable from "nobody has run this in months." Also excluded from backups, same reasoning as above. |

## 2. Patient code generation

`generate_patient_code()` (005, offset re-based by 024 to the `PT-1xxxxx` format) backs the `patient_code` column default and an RPC the app calls (`lib/patientCode.ts` — `ensurePatientCode`). Codes are server-assigned from a sequence; client code must never invent final codes. (Roadmap M4 formalizes this with provisional `PT-TMP-*` codes replaced by a `BEFORE INSERT` trigger.)

## 2a. Storage usage stats

`get_storage_usage_stats()` (051) returns `pg_database_size()` plus the summed `storage.objects` size for the `patient-files` bucket, in one query — backs the Dashboard "Storage Health" tile. `SECURITY DEFINER`, `EXECUTE` revoked from `PUBLIC` and granted only to `service_role` (it needs to bypass `storage.objects`' own RLS to sum every object, not just what the caller could see). Only caller is `functions/api/storage-usage.ts`, itself gated by `requireStaffSession` — never called from the browser directly.

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
    That flag now has no UI surface (HR & Payroll, its only consumer, is strictly admin-only as of
    2026-08-08) but still gates the tables at the database layer — left in place deliberately, not
    removed as part of that change.
  - `current_app_user_id()` — the signed-in account's own `app_users.id`, used by `staff_leaves`'
    "own rows" policies (052) instead of `app_can`: HR & Payroll is admin-only, but every active
    account still needs to read/insert/cancel *its own* leave requests regardless of any permission
    flag. A `BEFORE INSERT` trigger (`staff_leaves_fill_requester()`, `SECURITY DEFINER`) fills
    `app_user_id`/`staff_id`/`requester_name` from the session and forces `status = 'Pending'` for
    non-admins before the `WITH CHECK` runs, so a self-service insert can't spoof another account's
    identity or self-approve.
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
- **`offline_edit_queue` (054, extended 055) now carries encrypted PHI/financial payloads, not just
  metadata** — treat schema changes to it with the same care as `patients`/`invoices`. Columns:
  `client_mutation_id`/`group_id`/`seq`/`table_name`/`action`/`meta` (054, metadata only) plus
  `payload_encrypted`/`payload_iv`/`payload_alg` (055, the AES-GCM ciphertext, IV, and a key
  fingerprint so the client can tell "wrong key" from "corrupt") and `claimed_at`/`claimed_by_device`
  (055, an atomic compare-and-swap so two devices can never execute the same queued edit twice) and
  `synced_at`. RLS is unchanged from 054 (`created_by_user_id = current_app_user_id()`, admin
  override) and is the actual access control; the encryption is defence-in-depth against the payload
  being visible in the Supabase dashboard/PostgREST responses/a raw DB dump, not confidentiality
  against someone who has both DB access and the public JS bundle (the AES key is
  PBKDF2-derived from `VITE_ADMIN_PASSWORD`, which is inlined client-side — see
  `src/lib/payloadCrypto.ts`'s header comment for the full statement). A `BEFORE UPDATE` trigger
  (`offline_edit_queue_guard_update()`, 055) makes `status IN ('synced','discarded')` sticky and
  nulls the ciphertext columns on that transition — once an edit is approved or discarded its
  plaintext-adjacent data doesn't linger. **Rotating the admin PIN orphans every currently-staged
  payload** (the derived key changes) — drain the offline outbox (0 pending edits everywhere) before
  rotating it.

## 4. Migration guidelines

1. **Numbering:** next is `067_short_name.sql` (fixed from a stale "next is 059" note here — 059–066 have all since landed; recheck the folder before numbering, since another session sometimes commits straight to `main`). **066 added the Bangla QR / SMS-verified payment gateway** — `payments.gateway_provider`/`gateway_reference`/`gateway_transaction_id`/`gateway_status`, `idx_payments_gateway_reference_unique` (partial unique index, dedupe guard), and `invoice_settings.bangla_qr_merchant_payload` (seeded to the clinic's real Pubali Bank PLC merchant QR) — see the "Billing" table section above and FEATURES.md §8 for the payment flow it enables. **065 added `patients.dob_is_estimated`** (plain table-level grant already covers `patients`, no separate grant migration needed, same as 050/053's pattern) — see the "Core clinical" `patients` row above and FEATURES.md for the Celebrations & Greetings feature it protects. Recent: 056 added encrypted backup settings; 057 added the Catalog feature tables (`catalog_categories`, `treatment_catalog_items`, `custom_medications`) plus extended the `edit_history`/`delete_history` entity-type check constraints for the two new tracked entities; 058 added `prescription_letterhead_doctors` (multi-doctor prescription letterhead, seeded from the existing `doctor_profiles` singleton). Earlier: 037 fixed the `patient_code_seq` pollution incident; 038 added the Supabase-Auth helper functions (`is_active_app_user()`/`is_app_admin()`/`app_can()`); **039 is the RLS lockdown** — see §3 above, the load-bearing one; 040/041 unaccounted for in this doc (check the folder if it matters); 042 added `treatments.doctor_name`/`doctor_share_pct`; 043 fixed migration-042 fallout (RLS filter injection response, `app_users_select_roster` policy) + unified default share to 50%; 044 revised that default to 30% same day per user decision; 045 added `staff`/`staff_salary_payments`; 046 added `app_can('can_access_staff_analytics')` RLS to those two tables; 047 added `treatments.completed_at` + its auto-stamp trigger; 048 added `app_users.default_share_pct`; 049 added the column-level grant 048 forgot (see §3's gotcha above); 050 added `patients.followup_reminder_sent_at` (Dashboard treatment follow-up card — plain table-level grant already covers `patients`, no separate grant migration needed, unlike `app_users`); 051 added `get_storage_usage_stats()` (§2a); 052 added `staff_leaves` + its `staff_leaves_fill_requester()` trigger and self-service RLS (§3) for the HR & Payroll page / My Leave tab; 053 added `staff.leave_quota_days` (plain table-level grant already covers `staff`, same as 050's `patients` case — no separate grant migration) plus the `my_leave_balance()` RPC (§1) backing the My Leave balance tiles; 054 added `offline_edit_queue` (metadata-only sitewide visibility for pending offline edits); 055 added the encrypted-payload columns + claim/tombstone trigger to that same table, enabling cross-device approval — see §3's `offline_edit_queue` entry above for the full data-classification note. Watch out — history already contains two duplicate numbers (`003_add_patient_code` / `003_patient_files`, and `014_add_patient_weight` / `014_prescription_multi_entry_fields`). Don't add more; check the folder before numbering. 061 added the Patient Queue System (`queue_entries`, `queue_settings`, `next_queue_serial()`, `treatment_catalog_items.default_duration_mins`) — see the "Patient Queue" table section above. **First use of Supabase Realtime anywhere in this codebase** (`ALTER PUBLICATION supabase_realtime ADD TABLE queue_entries`) — also requires enabling Realtime for the project in the Supabase dashboard, not just running the SQL. 059 added `clinic_expenses`; 060 added `backup_upload_claims`; 062 added `recurring_expenses`; 063 added `prescriptions.discount_percent`; **064 added the read-only integrity scanner** (`integrity_findings`, `integrity_scan_runs`, `run_integrity_scan()` RPC — admin write/doctor read RLS, service_role-only execute; see the "Identity, audit & admin" table above and the migration's own header for the full design).
2. **Idempotent style:** use `IF NOT EXISTS` / guarded `DO $$` blocks (the established pattern) so re-running in the SQL editor is safe.
3. **Application is manual:** paste into the Supabase SQL editor. There is no `supabase db push`, no migration state table — the file numbering is the only record. Note in the PR/commit when a migration has actually been applied to prod.
4. **Live-data protocol (mandatory):** staging-first (restore a nightly backup into a scratch Supabase project via `scripts/backup/restore.mjs`), explicit user sign-off, fresh manual backup immediately before applying, written rollback statement alongside the migration.
5. **Update the TypeScript mirrors in the same change:** `src/lib/database.types.ts` (always) and `src/lib/entityTables.ts` → `ENTITY_TABLE_COLUMNS` (when the entity is audit-tracked — a missed column silently drops from snapshots/restores). Extend the `edit_history`/`delete_history` entity-type check constraints when introducing a new tracked entity (see 020).
6. **New tables need:** RLS enabled + policy (allow-all today, real policy post-M3), indexes on FK/date columns (established pattern), `updated_at` trigger if the table has that column, and inclusion in the nightly backup's table list (`scripts/backup/` — verify it enumerates the new table; backup changes push to both remotes).
7. **Don't pre-add sync columns** (`version`, `sync_status`, soft-delete flags) — locked decision; PowerSync manages its own state.

## 5. Backups & restore

- Nightly: all 32 tables → zipped JSON + `patient-files` mirror → Google Drive (3:00 AM BDT; workflow live only on `gsbanikudc-byte/Clinicmx-web`, and per the workspace-level CLAUDE.md this scheduled run is retired 2026-07-20 in favor of the in-app mechanism below — the script itself still works if run by hand). Daily/weekly/monthly tiers, retention, verification, anomaly detection, encryption (2026-07-18). **2026-08-01: `staff`/`staff_salary_payments` (migration 045, shipped same day) had been left out of both `scripts/backup/lib.mjs`'s `TABLES_IN_DEPENDENCY_ORDER` and the in-app `BACKUP_TABLES` (`src/lib/deviceBackup.ts`) — found and fixed while writing this doc entry, per rule 6 above. Restores normally (no `app_users`-style skip; it's plain business data, not credentials).** **2026-08-03: same failure mode found again on audit — `backup_settings` (031) and `app_notifications` (032) had never been in either table list despite being live and RLS-readable for months; also `app_users.default_share_pct` (048) was silently dropped from the in-app backup's own hand-maintained column allowlist (`TABLE_SELECT_COLUMNS`, needed because that table can't use `select('*')` under the RLS lockdown). The local script (`scripts/backup/lib.mjs`) additionally had its own separate gap the in-app backup didn't: `appointment_schedule_windows`/`appointment_schedule_date_overrides` (041, the live slot-scheduling tables) were missing from it alone — the in-app list already had both right. All fixed same day in both `deviceBackup.ts` and `scripts/backup/lib.mjs`. (A fifth suspected gap, `appointment_settings` from migration 040, turned out to be a false alarm — that table was superseded and `DROP TABLE`'d by migration 041 the same day it landed, so it correctly has never been in either backup list; verified live against prod, where querying it 404s. Don't add it back.) Given the real gaps have now happened twice, treat "add the new table/column to both backup lists, and check the two lists still agree with each other" as a mandatory step of shipping any schema change, not an optional follow-up.** **2026-08-08: `staff_leaves` (migration 052) added to both lists in the same change that created the table, per that rule.** **2026-08-15: `queue_entries`/`queue_settings` (migration 061) added to both lists (`deviceBackup.ts` `BACKUP_TABLES` and `scripts/backup/lib.mjs` `TABLES_IN_DEPENDENCY_ORDER`, plus `PATIENT_LINKED_TABLES` for `queue_entries`) in the same change that created the tables.**
- In-app: `/backup` page — device JSON download/restore (dry-run first) + one-tap Drive upload.
- Restore tooling: `scripts/backup/restore.mjs`, dry-run by default, `--confirm` to write.
- **Incident history:** a real invoice was accidentally deleted 2026-07-02 (pre-backup era) — the reason this system exists. Assume no second chances: back up before risky operations.
- **`integrity_findings`/`integrity_scan_runs` (064) are deliberately excluded from both backup lists** — derived state, fully regenerable by re-running the scan, same reasoning as `backup_upload_claims`/`offline_edit_queue` above. Don't add them; this is not one of the gaps rule 6 above is warning about.
