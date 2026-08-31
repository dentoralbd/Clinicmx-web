# CHANGELOG.md — Version History

Curated from git history (302 commits). No semantic versioning — the app deploys continuously from `main`; entries are grouped by date (newest first). For the forward plan see [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md).

---

## 2026-08-31 — Dynamic Bangla QR payment collection & SMS/manual verification

Added "Pay via Bangla QR" (migration 066) to every payment-recording entry point (Record Payment
modal — Billing, Patient Profile, pay-invoice picker — and invoice creation via `InvoiceModal`).
Generates a per-transaction dynamic EMVCo Bangla QR (amount + invoice number injected, CRC-16
recomputed and round-trip validated) from the clinic's real Pubali Bank PLC merchant QR, editable
in Billing → Invoice Settings. Verified either by pasting the bank/MFS confirmation SMS
(`src/lib/smsParsers.ts` — bKash/Nagad/Pubali Bank/generic parsers) or manual TrxID entry; recorded
payments carry gateway columns (`payments.gateway_provider`/`gateway_reference`/
`gateway_transaction_id`/`gateway_status`) with a partial unique index on `gateway_reference` as a
duplicate-recording guard. Success screen offers a WhatsApp thank-you and (from the Record Payment
modal) the existing payment receipt print view. Ported and adapted from a UI-approved prototype
built in the `Clinicmx-web-redesign` sandbox — see FEATURES.md §8 for the full behavior and
DATABASE.md for the schema. QR collection requires a live connection; offline invoice creation with
QR selected queues the invoice without collecting payment.

## 2026-08-21 — Appointment type sourced from Catalog sitewide; Reschedule can edit type/duration

`TreatmentTypeSelect` (previously Treatments-only) gained `extraOptions`, `blankOption`, and
`secondary` props and is now used everywhere an appointment/procedure type is picked: New
Appointment, Reschedule, the DentOral booking bridge's confirm step, and Patient Queue's Clinical
Procedure field — replacing New Appointment's hardcoded 8-option list and Queue's plain `<select>`.
"Follow-up" is pinned as a permanent non-catalog option; there is no fallback list if the Catalog
is empty.

Reschedule (`RescheduleModal.tsx`) can now also change an appointment's Duration and Type, not just
its date/time — previously the only fix for a mis-entered duration/procedure was cancelling and
rebooking. Duration changes clear the selected slot (mirroring the New Appointment/DentOral bridge
pattern, since `SlotPicker` doesn't invalidate a stale selection on its own); Type changes don't. A
matching **Reschedule** button was added to a patient's own Profile → Appts tab for upcoming
appointments, opening the same modal without leaving the profile. See FEATURES.md §4.

## 2026-08-19 — Integrity scanner: nightly cron trigger, and a live incident it caught

Added a third trigger for the integrity scanner (below): a standalone Cloudflare Worker with a
Cron Trigger (`workers/integrity-cron/`, nightly 3:30 AM BDT) calling the same `run_integrity_scan()`
RPC as the admin panel button and the local script. Separate deploy from the `clinicmx-web` Pages
project — Pages doesn't expose Cron Triggers, only plain Workers do.

Added same day the scanner itself shipped, not as originally planned: the first real run found
`patient_code_seq` had drifted back into the `PT-3xxxxx` test-code range — two real patients
(created 2026-08-17/18) had landed on `PT-300001`/`PT-300002` instead of real-looking codes,
because an earlier test session's "bump the sequence before testing" step (`CLAUDE.md` hard rule 8)
was never reset. Fixed by hand (renumbered both patients into two long-standing gaps in the real
range, `PT-100027`/`PT-100033`, freed by earlier deletions — a plain sequence never reclaims a
deleted row's number, so those gaps are permanent by design and harmless to reuse manually) and
reset the sequence. **While fixing it, it happened again** — the sequence jumped to the 200000s a
second time mid-session with no new patient to show for it (a burned `nextval()` from a failed/
interrupted create-patient attempt — sequences never roll back even when the transaction that
called them does). Manual-only triggering meant this was only caught because someone happened to
re-run the scan by hand right when it mattered; the cron trigger exists so that stops being a
requirement. See FEATURES.md §13b, API.md §3c.

## 2026-08-19 — Read-only integrity scanner (Admin → Integrity)

New Admin → Integrity tab (`/admin?tab=integrity`, admin run/review + doctor read-only) surfaces
data-integrity problems — referential orphans, invoice `paid_amount` disagreeing with its actual
`payments` sum, invoice totals recomputed from line items and compared to what's stored,
treatment↔invoice sync drift (mirrors `invoiceSync.ts`'s dual-linkage invariant), a treatment's
`doctor_name` matching no active staff account (the exact class of bug that zeroed a doctor's
payout analytics on 2026-08-02), audit-trail gaps, and a few structural checks — before they
surface as a broken invoice or a silently wrong number. Never writes to any clinical/financial
table; the only writes are to its own `integrity_findings` (migration 064) and, on a new critical
finding, one deduped `app_notifications` entry.

No scheduler in v1 — every check lives in SQL inside `run_integrity_scan()` (service_role-only
RPC), triggered either from the tab's "Run scan" button (`functions/api/integrity-scan.ts`,
admin-gated) or locally via `node scripts/integrity/scan.mjs` (`--dry-run` does a true rollback of
the writes via the RPC's own `p_dry_run` parameter, for previewing a new check against production
before trusting it). `integrity_scan_runs` records every run so the panel can show "last scan: N
ago" — the safety net a manual-trigger design needs that a cron-based one wouldn't. See
FEATURES.md §13b, DATABASE.md, API.md §2/§3b.

## 2026-08-17 — Previous Visits panel in Add Visit

Add Visit modal now opens with a read-only, collapsible "Previous Visits" panel above Chief
Complaint, so the doctor can check the last visit's plan/treatment-done/payment/notes without
leaving the form. Reuses the existing Visit History chip rendering; adds a "Also recorded that
day" line for same-calendar-day treatments/prescriptions (visits have no DB link to either, so
this is a display heuristic, labeled as such). Scoped by default to the patient's current
treatment episode (new `currentPlanStart()` helper in `PatientProfile.tsx`) with a "Show earlier
visits" toggle for full history — a patient who finished one plan and started a new one later
isn't shown the old plan's visits by default. Purely additive/read-only: no schema change, no new
query, no change to `handleVisitSubmit` or the Visit History tab. See FEATURES.md §10.

## 2026-08-16 — Recurring Expenses sub-menu (Clinic Expenses)
- **New "Recurring Expenses" inner tab inside Clinic Expenses** (`/financial-analysis`) for monthly-repeating bills — rent, electricity, subscriptions — instead of re-entering the same one-off expense every month. New `recurring_expenses` table (migration 062, admin-only RLS) holds templates (category `Rent`/`Utilities`/`Subscription`/`Other`, amount/month, optional vendor/notes, active/inactive). A "Generate `<month>`" button creates one real `clinic_expenses` row per active template for the selected month (tagged via a new `clinic_expenses.recurring_expense_id` column, shown with a "Recurring" badge in Other Expenses) — idempotent via `UNIQUE (recurring_expense_id, expense_date)`, mirroring `staff.ts`'s monthly-generation pattern. `clinic_expenses.category`'s CHECK constraint widened to accept the three recurring-only categories alongside the four one-off ones. See FEATURES.md §15b-vi for the full breakdown.

## 2026-08-15 — Patient Queue System

New `/queue` (reception) and two display boards: `/queue-display` (staff/backroom, inside
ClinicMx) and `dentoralbd.com/queue` (the actual patient-facing waiting-room board, on the
separate DentOral site so ClinicMx stays invisible to patients — mirrors the DentOral booking
bridge in the opposite direction). Migration 061 (`queue_entries`, `queue_settings`,
`next_queue_serial()`, `treatment_catalog_items.default_duration_mins`); new Cloudflare Function
`functions/api/queue-board.ts` + AGY's `functions/api/queue.js`/`queue.html`.

Ported and redesigned from a queue system built in the (untracked) `Clinicmx-web-redesign` UI
sandbox — that implementation was real working code (~3,200 LOC) but had a serious PHI exposure
(anon-key SELECT on today's named patient roster, reversing the 2026-07-26 RLS lockdown) and was
strictly check-in-order FIFO. This version instead orders the queue by the **appointment
schedule** — a scheduled check-in's position derives from its appointment time, a walk-in's from
arrival time, both the same expression so a walk-in naturally slots in among passed appointment
times with no special-case code (`sort_key` + fractional/"between" ordering, see DATABASE.md).
"Absent" pushes a patient down a configurable number of places instead of removing them or
sending them to the back. Position on screen is computed at read time from this order, never
stored, so an insert/reorder/absent-mark never has to rewrite other rows.

The board reads through a Cloudflare Function pair holding the Supabase `service_role` key
server-side instead of an `anon` grant — the browser never sees a Supabase credential, and
`queue_entries` keeps zero `anon` access. An untokened request gets a masked, serial-numbers-only
fallback rather than an error. Privacy mode (full name / masked / token-only) is a real
server-persisted setting applied identically to on-screen text and the Bengali TTS announcement —
the sandbox's version only ever changed the on-screen text, so even its "token only" mode still
spoke the patient's full name aloud.

Also fixed during the port: a doctor-widget/reception Call-button disagreement that could leave
two patients in `serving` at once (unified into one shared `callNextPatient()` action); a
read-max-then-insert token/serial race between two simultaneous check-ins (now an atomic
`SECURITY DEFINER` RPC); `assigned_doctor` existing in the schema but never actually written by
any code path; and a Rules-of-Hooks violation in the floating widget. Deferred: the animated
"Ayesha" avatar and announcement ticker; a patient-facing mobile queue tracker (`/q/:token`).

See FEATURES.md §4b, DATABASE.md's "Patient Queue" table section, and API.md §2 for the full
detail.

## 2026-08-15 — Fix duplicate Smart-upload backups (race condition)
Reported: two near-identical "Daily backup uploaded ✓ verified" notifications 10 seconds apart on
the same day. Root cause: `BackupReminderBanner`'s auto-upload check loop (every open session,
every 60s) decides a category is "overdue" by reading Drive's last-backup timestamp, then builds
and uploads — but nothing stopped two sessions that both polled in the same ~1-minute window (two
tabs, two devices, or admin + operator now that both roles run this loop) from both seeing "not
done yet" and both uploading before either result was visible to the other. Not a new bug — it
predates today's operator-access change, which only doubled the number of sessions that could hit
it. Fixed with an atomic claim, same compare-and-swap pattern as the offline-sync outbox's
`claimMutation()`: new `backup_upload_claims` table (migration 060, one pre-seeded row per
category) and `claimBackupUpload()` in `backupReminders.ts` do an `UPDATE ... WHERE` that only one
session's request can win for a given scheduled instant; the loser skips the upload entirely
(no wasted build, no misleading "failed" notification — the winner's own success notification
covers it). Wired into `BackupReminderBanner.tsx`'s auto-upload branch, right before the claim
would otherwise start building the backup.

## 2026-08-11 — Clinic Expenses tab on Financial Analysis
- **New "Clinic Expenses" tab** alongside "Doctor Analytics & Payouts" on `/financial-analysis`, admin-only (plain `getAppRole() === 'admin'`, no permission-flag override, unlike the sibling tab). Fulfills the "Expense tracking / cashbook alongside income reports" line from PRODUCT-ROADMAP.md. Rolls up Doctor Payouts + Staff Salary (both cash-basis, actually-paid amounts) + Lab Charges (only `lab_work` rows marked paid, bucketed by `date_sent`) + a new categorized "Other Expenses" ledger (`clinic_expenses` table, migration 059 — Instrument Purchase / Material Purchase / Machine Repair / Other, full add/edit/delete CRUD) into a Total Expenses figure, and shows Profit/Loss against Total Collected (raw payment sum for the month — deliberately not `DoctorFinancialSummary.totalPaid`, which excludes unattributed payments). See FEATURES.md §15b-vi for the full breakdown and the accounting-basis reasoning.

## 2026-08-10 — Catalog (clinic-managed categories) + prescription Preview/Print/Save, multi-doctor letterhead
- **New Catalog page** (`/catalog`, under the Patients sidebar group) lets the clinic manage categories and add their own treatment/procedure types and custom medications going forward, instead of being limited to hardcoded lists. New tables `catalog_categories`, `treatment_catalog_items`, `custom_medications` (migration 057) — seeded with the 11 built-in drug categories and a "General Procedures" category holding the union of the app's previously-hardcoded, already-drifted treatment-type dropdown lists (`Treatments.tsx` x2, `PatientProfile.tsx` x2 — now unified into one shared `<TreatmentTypeSelect>` reading from the catalog). `dentalDrugDatabase.ts`'s built-in BD drug directory is untouched; custom medications merge into `DrugPicker.tsx`'s search/dropdown alongside it.
- **Prescriptions gain Preview, Print, and Save actions** in the compose form (both the standalone Prescriptions page and the embedded Patient Profile flow) — Preview opens the print view on the unsaved draft with no DB write; Print saves then opens the print view automatically; Save replaces the old "Issue/Update Prescription" button. Underlying save/QR-code/Rx-ID/share mechanics are unchanged.
- **Prescription letterhead now supports multiple doctors**, matching the clinic's real two-doctor physical pad, managed via a new Admin → Prescription Doctors screen (new `prescription_letterhead_doctors` table, migration 058 — deliberately separate from the `doctor_profiles` singleton used elsewhere, e.g. Invoice letterhead) instead of being hardcoded. The print overlay also gained a "Blank" mode (no header/footer drawn, QR/Rx-ID footer still included) for printing directly onto the clinic's pre-printed A4 pad — its top-margin offset is a placeholder pending one real calibration pass against the physical paper.

## 2026-08-10 — Offline-edit badge/bell counts, missing invoice patient name (again)
- **Sidebar "Verify Offline Edits" badge, and the notification bell's counts, showed the raw number of queued mutations instead of distinct edits** — a single offline invoice is 3-4 mutations (insert, treatment-link, payment, balance update) sharing one `groupId`, so it inflated the count (e.g. 1 treatment + a 4-step invoice showed as "5" where `/offline-outbox` correctly showed "2" cards). New `countDistinctPendingEdits()`/`countDistinctSitewideEdits()` in `offlineSync.ts` (group-aware, same grouping `/offline-outbox` already uses) now back the sidebar badge, `DoctorProfile.tsx`'s admin badge, and both branches of the notification bell.
- **Non-admin bell now also surfaces edits pending on the user's own other devices** (previously only counted this device's local outbox — a doctor with something queued on their phone got no bell notification about it while looking at a desktop), using the same RLS-scoped `fetchRemoteApprovableEdits()` `/offline-outbox`'s own "Pending on your other devices" section already relies on.
- **Offline invoice cards created via the main Patient Profile "Create Invoice" flow still showed no patient name** — that `<InvoiceModal>` instance (unlike its sibling edit-invoice instance two lines below) never passed the `defaultPatientName` prop, so yesterday's `createInvoiceOffline()` fallback fix had nothing to fall back to when the offline patient picker list was empty. Now passed.

## 2026-08-09 — Offline invoice card details; sitewide vs. approvable pending-edit count
- **Offline invoice cards showed no patient name or treatment detail** — `InvoiceModal.tsx`'s `loadPatients()` has no offline handling, so the patient picker list stays empty on a flaky connection; `createInvoiceOffline()` derived the display name only from that list with no fallback, even though a `defaultPatientName` prop existed for exactly this (already used correctly by the invoice-edit path). Now falls back to it, and the card's detail line includes a short item/treatment summary instead of just the total amount.
- **Notification bell's "N offline edits staged clinic-wide" count could read higher than what's actually approvable from `/offline-outbox`'s "Pending on other devices" list** — not a bug, but confusing: the bell counts every pending row sitewide, while the approvable list excludes rows with no decryptable payload (staged by a session that had no encryption key at the time — metadata-only, viewable only in Admin → Offline Edits). The bell message now says `(N approvable now)` when the two counts differ.

## 2026-08-09 — Invoice creation, prescription silent-failure, visit-payment, and the offline banner
Same `navigator.onLine`-lies theme, five more gaps — one of them (prescription save) worse than any found so far, since nothing in it ever threw.

- **Invoice creation failing** (`alert("Failed to create invoice: TypeError: Failed to fetch")`). `InvoiceModal.tsx`'s `handleSubmit` had no fallback from a failed online insert to the already-existing `createInvoiceOffline()` routine — a connectivity failure threw straight to the alert with nothing queued. Now falls back to it on `isOfflineFailure()`. Also fixed the treatment-linking step (previously a silently-swallowed `.then(() => {}, () => {})`, kept for legacy-schema tolerance but now also queues a follow-up link on a genuine connectivity failure instead of leaving the treatment unbilled forever) and, for consistency, the adjacent `invoice_history`/`payment_plans` inserts.
- **Prescription save failing completely silently — the most severe bug found this session.** `savePrescriptionWithCosts`'s online branch (new prescription) checked `{ error }` on *none* of its ~6 writes; since postgrest-js resolves rather than rejects, a failed write was indistinguishable from a successful one — no alert, nothing queued, the form just closed as if it worked. Now checks every write: the two earliest (medical history, prescription insert) delegate the whole save to the existing `saveNewPrescriptionOffline()` on a connectivity failure; the treatment-row loop and the superseded-row delete (which run after the prescription already has a real id, so a wholesale offline-delegate would create a duplicate) promote per-write instead. **Deliberate, disclosed behavior change:** a genuine non-connectivity error on these writes — and on the prescription-edit path, which stays online-only — now throws (surfacing the existing `alert('Failed to save prescription')`) instead of vanishing.
- **Prescription delete** — same missing-check pattern as visit delete (fixed yesterday), same fix.
- **Visit-payment now has real offline capability** (previously: none at all — a network drop during `createVisitInvoiceWithPayment`/`applyPaymentToExistingInvoice` lost the payment with a misleading "Failed to save visit" alert, even though the visit itself had saved). A connectivity failure during the payment insert now delegates to the already offline-safe `recordInvoicePayment()`; a connectivity failure creating the invoice itself builds and queues the whole invoice+link+payment group directly, sharing the visit submission's own `groupId` so everything syncs together in order.
- **`createInvoiceOffline`'s payment step now shares its invoice's own group** instead of starting an independent one (found while fixing the above) — previously, manually syncing the payment group before the invoice group would hit an FK violation against a not-yet-synced invoice id.
- **Prescription-delete audit gap** (found while fixing the above): the treatments-to-delete lookup before writing `delete_history` snapshots had no error check either — a connectivity failure there, if the network then recovered in time for the delete itself to succeed, could delete treatments with zero audit trail. Now falls back to the cached bundle for the snapshot data instead of silently skipping it.
- **Amber offline banner not appearing on a real degraded mobile connection.** The banner's `useOnlineStatus()` trusted `@tanstack/react-query`'s `onlineManager`, which only reacts to the browser's `online`/`offline` DOM events — never fired by a degraded-but-interface-up connection (weak signal, packet loss, timeouts), only by the network interface actually going down. New `src/lib/connectivityStatus.ts` tracks real observed connectivity failures (fed automatically by `isConnectivityError()`, so every existing and future `isOfflineFailure()` call site feeds it with no extra wiring) with a 20-second decay window; `useOnlineStatus()` now combines both signals. Also improves the Approve & Sync `disabled` gating in `/offline-outbox` and Admin → Offline Edits, which use the same hook.

## 2026-08-09 — Visit save, invoice line items, and doctor share % under a flaky/lying-online network
Three more bugs from live testing, all downstream of the same `navigator.onLine`-lies class documented below — three more call sites never got `isOfflineFailure()`.

- **New Visit save failing** (`alert("Failed to save visit: TypeError: Failed to fetch")`, work lost). `handleVisitSubmit`'s `const isOffline = !navigator.onLine` was decided once, before four sequential writes (visit insert, plan-item status updates, ad-hoc treatment insert, payment/invoice); a lying-online network meant the online branch ran, the very first write failed with a resolved connectivity error, and it threw straight to the alert with nothing queued. `isOffline` is now a `let` that can promote to `true` mid-submission — a connectivity failure at any of the first three write sites falls back to enqueueing (same `groupId`, so the whole submission still syncs as one ordered unit) instead of losing the save. The payment/invoice sub-flow has no offline path of its own; if the network dies before reaching it, it's now skipped (with a clear "payment couldn't be recorded, add it separately" message) rather than attempted and thrown. `handleVisitEditSubmit`/`handleDeleteVisit` got the equivalent single-write-site fix.
- **Invoice line item blank (BDT 0.00) after saving a treatment plan offline.** `InvoiceModal.tsx`'s `loadPendingTreatments()` only checked a `navigator.onLine` snapshot; on a lying-online network both its primary query and its legacy-safe retry failed with resolved connectivity errors and fell through to returning `[]` instead of reading the (correctly populated) patient-bundle cache — so the invoice modal defaulted to a blank starter line item. Now checks `isOfflineFailure()` on both queries and falls back to the cache instead.
- **Doctor Share % still showing the hardcoded 30, offline, even after the previous fix.** The only fallback source was this one patient's own cached treatment history — a doctor's first-ever treatment for a given patient had nothing to borrow a percentage from. Added a device-wide (`idb-keyval`, survives cold launches) doctor roster cache — written on every successful `app_users` fetch, consulted as a lower-priority fallback than this session's/this patient's own data. Also fixed an adjacent bug where the roster fetch's generic-exception handler clobbered the cached-fallback merge with an unconditional replace one line later.

## 2026-08-08 — Offline sync: silent data-loss fix, real connectivity detection, doctor roster fallback, reschedule prompt
Four bugs found from live testing of the offline-first system, one of them severe.

- **Silent data loss in offline sync (critical).** `syncOne()` claimed a server-side row (migration 055) before executing a queued mutation, but never released that claim if execution then failed — unlike its sibling remote-approve path, which already did. A manual retry inside the 10-minute claim TTL saw the claim as `'taken'` (a check that only looked at whether the row existed, not its status) and **deleted the still-unsynced local mutation while reporting success** — a queued treatment or invoice could vanish with no trace and no error shown. Fixed by splitting `'taken'` into `'terminal'` (server confirms synced/discarded — safe to drop locally) and `'held'` (another device holds an active claim — kept locally, marked blocked, never deleted), and by releasing the claim on any execution failure. `claimMutation()` also now degrades to pre-055 single-device behavior if the migration's columns are absent, instead of failing every sync closed.
- **Offline treatment saves failing, doctor roster/share % wrong offline.** Both traced to the same wrong premise: `@supabase/postgrest-js` (2.108.2) does not reject on a network failure — it *resolves* with `status: 0` and a message prefixed `"TypeError: Failed to fetch"`. The `err?.message === 'Failed to fetch' || err?.name === 'TypeError'` check used across five write paths never actually matched that shape, so offline detection only ever worked via `navigator.onLine`, which frequently reports `true` on a dead network (captive portals, flaky wifi, the Capacitor Android WebView this app also ships as). New `src/lib/supabaseErrors.ts` (`isOfflineFailure()`) routes on the *resolved* error/status, adopted in `treatmentsRepo.ts`, `deleteHistory.ts`, `editHistory.ts`, `payments.ts`. Separately, `fetchDoctorsList()` in `PatientProfile.tsx` unconditionally wiped `doctorSharePctMap` to `{}` on any roster-fetch error (not just a connectivity one), which is what made every Share % field fall back to the hardcoded 30 — fixed to only set the map on success, and to retry its cached-treatment fallback once the IndexedDB bundle cache actually hydrates (a cold offline launch used to leave the roster empty for the whole session).
- **Reschedule WhatsApp prompt not appearing.** The dialog was already built and wired — it just silently skipped for a patient with no phone on file (`RescheduleModal.tsx`), silently ignored `openWhatsAppMessage()`'s `false` return on an undialable number (`RescheduleWhatsAppPrompt.tsx`), and Slot Grid could open the modal on an appointment whose patient record was null with no guard (unlike the list view). All three now surface a "No phone" state instead of closing with zero feedback.

## 2026-08-08 — CORS for the Tauri desktop build's /api/* calls
Anti-Gravity wrapped a fork of this app (`D:\Claude\Clinicmx-web-redesign`) into a Windows exe with Tauri v2. The exe bundles the built UI and serves it from the `tauri.localhost` origin, so its calls to this deployment's `/api/*` endpoints (admin 2FA, Users management, Drive backup) were blocked by the browser as cross-origin.

- Added `functions/api/_middleware.ts`: adds `Access-Control-Allow-Origin` only for `Origin: http://tauri.localhost` / `https://tauri.localhost`, on every `/api/*` route. Every endpoint's existing auth (PIN, device token, staff session) is unchanged — this only unblocks the cross-origin fetch itself. See API.md §2.

## 2026-08-08 — Offline Edits: cross-device approval, sitewide log, admin fixes
Built out Admin → Offline Edits (`src/components/admin/OfflineEditsTab.tsx`) from a placeholder into a real sitewide audit log, then closed the gap it exposed: approving your own offline edit required being back on the exact device that queued it.

- **Migration 054** — `offline_edit_queue`: metadata-only sitewide visibility for pending offline edits (who, patient, what kind, when — no payload). RLS: creator or admin.
- Enriched every offline-edit card with patient name, tooth number, and amount (`meta.patientName`/`meta.detail`, threaded through `treatmentsRepo.ts`, `InvoiceModal.tsx`, `payments.ts`, `deleteHistory.ts`/`editHistory.ts`); admin gets notified via the bell once an edit is approved & synced elsewhere, attributed to who actually made it, not who clicked Approve.
- Added the amber "Offline — showing saved data" banner to `Header.tsx` (present in the redesign clone this port started from, dropped during the port) and a "Recently Synced" section in Admin → Offline Edits, since a synced edit previously vanished from that page with no trace beyond the separate Activity Log tab.
- **Migration 055 — cross-device approval.** The account that created an offline edit (or admin) can now finish **Approve & Sync from any device**, not just the one that queued it: the payload is encrypted client-side (AES-GCM, `src/lib/payloadCrypto.ts`) before being staged, and an atomic per-row claim (`claimMutation()`) guarantees only one device ever executes a given edit even if two are approved near-simultaneously. Honest security note (also in `payloadCrypto.ts` and DATABASE.md §3): the key is derivable from the public JS bundle, so this is defence-in-depth (keeps plaintext out of the dashboard/logs/dumps, destroyed on approval/discard) rather than confidentiality — RLS is the real access control, unchanged from 054. Fixed a real bug in the same pass: `reportPendingToServer()` was reporting the *whole* device outbox regardless of who was currently logged in, which would have misattributed a shared device's queued edits once payloads went server-side.
- New "Pending on your other devices" sections in `/offline-outbox` and Admin → Offline Edits, both actionable (Approve & Sync / Discard). Coverage limit stated plainly in FEATURES.md §1b: only helps once a device has reconnected at least once after queuing — a device lost while still offline, never reported, isn't recoverable this way.

---

## 2026-08-08 — HR & Payroll page (admin-only): leave management, real payroll charts, Staff Analytics relocated
New `/hr-payroll` admin page, sidebar entry directly below Financial Analysis. Started from an HR-poster-inspired demo prototyped in `Clinicmx-web-redesign` (`HRPayrollDashboard.tsx`/`lib/hr.ts`); kept the leave-management idea, rewrote the rest — the demo's payroll donut was fabricated (base × 0.15/0.05 "allowances"/"deductions") and its `staff_leaves` RLS was wide-open (`FOR ALL TO authenticated USING (true)`), neither shippable against a table with real names and dates on it.

- **`staff_leaves` table** (migration 052): leave requests with a `requester_name` snapshot (so the admin list renders without granting requesters read access to `staff`), `staff_id`/`app_user_id` resolved by a `BEFORE INSERT` trigger (`staff_leaves_fill_requester()`) from the signed-in session, `status` forced to `Pending` on any non-admin insert. RLS: admin sees/decides everything (`is_app_admin()`); every active account can read/insert/cancel only its own rows (`current_app_user_id()`) — deliberately not gated behind `can_access_staff_analytics`, since the page is admin-only but self-service leave has to work for every active account regardless of that flag.
- **HR & Payroll page** — three tabs: **Overview** (real KPI tiles, base/bonus/deduction/advance payroll breakdown, 6-month payroll trend, staff-mix-by-designation, recent HR activity — all computed by `getHRMetrics()` in `src/lib/hr.ts`, reusing `calculateStaffSalarySummary()` from `src/lib/staff.ts` so nothing here can drift from the Staff & Salary numbers); **Leave Requests** (admin approve/reject with an optional note, filter by status, file a request on a staff member's behalf); **Staff & Salary** (the existing `StaffAnalyticsSection` component, moved here unchanged).
- **Staff Analytics moved out of Financial Analysis.** That page is now Doctor Analytics only, single-page (no more tab bar). `can_access_staff_analytics` still gates `staff`/`staff_salary_payments` at the RLS layer but has no UI surface anymore — flagged, not removed, since deciding what to do with that permission toggle is a separate call.
- **My Leave tab** — every non-admin (`doctor`/`operator`) account gets this in their Zone (`/doctor-profile`) now, independent of any other zone permission: submit a leave request, see its status and any decision note, cancel while still pending.
- Lockstep: `src/lib/database.types.ts`, `src/lib/deviceBackup.ts` (`BACKUP_TABLES`), `scripts/backup/lib.mjs` (`TABLES_IN_DEPENDENCY_ORDER`) all updated for `staff_leaves` in the same change.
- **Same day, follow-up:** My Leave gained Total Leave / Used / Leave Left tiles (migration 053, `staff.leave_quota_days` default 20, admin-editable per staff in the Staff & Salary roster modal; "used" = approved leave of any type, reset each calendar year). Exposed via a `my_leave_balance()` SECURITY DEFINER RPC rather than a `staff` SELECT policy, since `staff` also carries `monthly_salary` and RLS can't scope by column — the RPC hands back only the three numbers.

---

## 2026-08-07 — Offline-first support (branch `offline-m1`, not yet merged): PWA, offline viewing, offline writes with manual-approval sync
Ported and hardened the offline system prototyped in `Clinicmx-web-redesign` into this repo, per [OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md) (see its 2026-08-07 status note for the full milestone mapping and the bugs fixed during the port). All existing billing math (`src/lib/billing.ts`, `src/lib/invoiceSync.ts`), the online code paths of `InvoiceModal.tsx`/`payments.ts`/`PatientProfile.tsx`, and the security-hardening layer (Migration 039 RLS, Admin 2FA, IP gate, `secureLocalStorage`) are unchanged — offline behavior is strictly additive.

- **PWA shell (M1):** `vite-plugin-pwa` service worker (Cloudflare Functions under `/api/*` explicitly excluded from the SW's navigate fallback), React Query cache persisted to IndexedDB for 7 days via `src/lib/queryClient.ts` (only clinical/billing query keys persist — admin queries like Users/Clinic Hours never do), guarded `vite:preloadError` reload in `main.tsx` (max once/minute).
- **Read repositories (M2):** `src/repositories/` — `patientsRepo`, `appointmentsRepo`, `dashboardRepo`, `patientProfileRepo` (the patient bundle query, now including `payments` so offline payment history actually shows). Dashboard/Patients/Appointments/PatientProfile converted to `useQuery` on these.
- **Offline write outbox:** `src/lib/offlineSync.ts` — rewritten from the redesign's prototype (not copied), fixing: mutations enqueued mid-sync no longer get silently erased; the invoice schema-compatibility fallback now strips only the actual missing column (never the id, discount, tax, or notes) instead of a fixed guess-list; offline invoices now enqueue the treatment `is_invoiced`/`invoice_id` link so treatments can't come back as unbilled after sync; dependent mutations (e.g. invoice → treatment link → payment) sync as an ordered group via `groupId`/`seq`, with a failure blocking (not silently dropping) the rest of the group; retry attempts/last error are tracked and surfaced per item; sync invalidates only the affected patient bundles instead of the whole cache. **Sync is manual-only** — no auto-sync on reconnect; `/offline-outbox` (Sidebar → Patients → "Verify Offline Edits", badge shows pending count) is where a user reviews and presses Approve & Sync / Approve & Sync All / Discard.
- **Coverage:** treatment plan create/delete, invoice create (provisional `INV-TMP-*` number, shown as an "Offline draft" badge on the invoice card and as a notice on the printed/shared PDF until it syncs and gets a real number — see `src/lib/invoiceNumbering.ts` for the shared numbering logic used both online and at sync time), payments, delete/edit audit logs, patient visits (create/edit/delete — payment collection on a new visit is blocked while offline, since it can touch several existing invoices at once and that's not safe to replicate as a queued mutation), and **new** prescriptions (editing an existing prescription still requires network, since it reconciles against a fresh read of the prescription's billed treatment rows).
- **Not covered:** patient add/edit, appointments create/edit, dental chart, patient files, lab records, invoice edit/delete, prescription edit.
- **Account-scoped approval:** a shared device can accumulate offline edits from more than one login; syncing/discarding a queued edit is restricted to the account that created it (`canActOn()` in `offlineSync.ts`), same trust model as `canDelete()`/`canRevert()`. **Admin is exempt** — can act on any account's queued edits, from both the existing `/offline-outbox` entry and **Admin zone → Offline Edits**.
- **Admin zone → Offline Edits** (`src/components/admin/OfflineEditsTab.tsx`) is a dedicated audit-log view, deliberately **not** a reuse of the `/offline-outbox` action-card page — built to match **Delete History**/**Edit History**'s conventions instead: filter chips by record type, collapsed rows expanding to the full queued record via a shared `SnapshotDetails` renderer (extracted to `src/components/SnapshotDetails.tsx` so Delete History, Edit History, and this new tab all render payload detail identically instead of three drifting copies), Approve & Sync/Discard inside the expanded panel, actor + timestamp on every row. The discard-cleanup logic (`cleanUpOptimisticEntry`) was also pulled into `offlineSync.ts` so both offline-edit views share it rather than duplicating it.

---

## 2026-08-04 — UI polish pass (Phases 0–6): real fonts, design tokens, Patients/Prescriptions/PatientHeader/Header restyle, Storage Health tile, Treatments timeline
Ported the visual-only parts of a prototype clone (`Clinicmx-web-redesign`) plus mockup inspiration,
after reviewing every diff for logic changes, hardcoded placeholder text, and print/PDF coupling
first — several issues caught and fixed before/during porting (see below). Scope: styling only, no
workflow or menu changes; `sk-dental` untouched.

- **Foundation:** Inter now actually loads via `@fontsource/inter` (previously declared in CSS/
  Tailwind but never bundled — body text silently fell back to system-ui); added Space Grotesk 400;
  new design tokens (`primary-light/surface`, `highlight-light`, `accent-light`, `surface-subtle/
  glass`, `text-muted`, softer elevation shadows, `shadow-glass`, `shadow-glow-primary`); `viewport-
  fit=cover` + safe-area padding on the mobile sidebar drawer for the Android APK.
- **Patients:** page header, search bar, table (now also shows address/email per row), empty states,
  and add/edit modal restyled.
- **PatientHeader:** switched from a dark teal-to-slate gradient banner to a light glass panel (pale
  teal, dark text) with pill chips for code/age/gender/phone/email and a stronger completeness ring,
  per mockup direction.
- **Header:** user area restyled into a profile pill (gradient avatar + name/role + chevron,
  collapsing to avatar-only on phones). Caught and fixed a real bug during verification: the
  dropdown had `.glass-card` added alongside Tailwind's `absolute` class — `.glass-card` sets
  `position: relative` in `index.css`, which won the cascade over `absolute`, pulling the dropdown
  into normal document flow and inflating the header's actual height, shoving all page content down
  whenever it opened. Fixed by dropping `glass-card` from that element.
- **Dashboard:** the clone's dashboard redesign was rejected outright — its stat cards had wrong
  data behind correct-looking labels ("Pending Lab Tasks" was actually unpaid invoice count;
  "Today's Patients" was the all-time total), hardcoded placeholder doctor names in every
  appointment row, a `.slice(0, 4)` that silently hid appointments past the 4th, and had dropped the
  admin/operator-only gate on the backup tile. None of that shipped. Only addition: a new **Storage
  Health** tile (admin/operator only, same gate as Backup Health) showing Supabase database + patient-
  files bucket usage against configurable plan-quota limits — new `get_storage_usage_stats()` RPC
  (migration `051`, service_role-only, not yet applied to production — needs a manual run in the SQL
  editor after a fresh backup), a new Cloudflare Pages Function (`functions/api/storage-usage.ts`,
  gated by `requireStaffSession`), and `src/lib/storageUsage.ts`.
- **Prescriptions:** list/table restyled (patient-group rows, expanded prescription table, action
  buttons). The frozen patient-selection flow inside the New/Edit modal was verified byte-for-byte
  untouched by diffing it against the pre-edit commit.
- **PatientProfile Treatments tab:** converted from a data table into a timeline (left rail,
  status-colored dots, card-per-treatment, tooth-number chips, price badge) — a surgical edit
  confined to the two row-render functions in the 6,631-line file; same handlers, same permission
  checks, same duplicate-detection and plan-grouping logic throughout. **Not yet visually verified
  against live data** (local dev has zero readable patients under the Phase 2 RLS lockdown, and
  creating a live test patient to check needs the `patient_code_seq` bump from CLAUDE.md hard rule 8
  first) — check this tab against a real patient before considering it final.

**Phase 7 — remaining six pages**, each reviewed for logic/print/glass-card-positioning issues before
porting (background review agent, then verified myself):
- **Appointments, Consultations, Inventory** — pure styling, ported as-is. Consultations gained a
  trivial clear-search (×) button (reuses existing `searchTerm` state).
- **Lab** — restyled, but the reference had silently dropped the "(matching current filter)" suffix
  on the three stat-card labels when a filter is active; reinstated it so a filtered view can't be
  misread as clinic-wide totals.
- **Billing** — restyled, but three dropdown panels (Unbilled Treatments popover, More Actions menu,
  patient-search suggestions) combined `.glass-card` with Tailwind's `absolute` class — the same bug
  as Header.tsx (`.glass-card` sets `position: relative` in `index.css` and wins the cascade). Fixed
  by stripping `glass-card` from those three elements before porting; verified live that all three
  are genuinely `position: absolute` and don't inflate the header.
- **Login** — read the full diff line-by-line myself given `CLAUDE.md`'s security-sensitive flag on
  this file (`ADMIN_PASSWORD` derives the secure-storage encryption key for every role). Confirmed
  every state variable, handler, and the PIN/OTP/recovery-code logic is byte-for-byte untouched —
  only labels and classNames changed. Verified live: admin PIN login completes end-to-end to
  `/dashboard`.

## 2026-08-03 — Reorder the post-visit prompts: appointment first, then payment WhatsApp
After a visit with a payment, the flow used to show the WhatsApp payment thank-you prompt first,
then chain into "Schedule next appointment?" once that closed. Reordered so the appointment prompt
shows first (patient's still in the chair) and the payment thank-you follows once that step
concludes (Later, or after the appointment modal closes/saves) — no change to the qualification
logic, message content, or any of the underlying data (`src/pages/PatientProfile.tsx`: `nextApptPrompt`
is now always set after a visit save, and the payment thank-you prompt's render condition waits for
`!nextApptPrompt && !showAppointmentForm`).

## 2026-08-03 — Narrow operator's Backup & Restore access to Upload only, in the API too
Follow-up to opening Backup & Restore to operators (below): on reflection, only "Upload to Google
Drive" should be available to operator — "Download backup" (a full local data export) and the
entire "Restore from a backup file" card (can overwrite live production data) are now admin-only
again, gated in `BackupRestore.tsx` by `appRole === 'admin'`. Encryption/passphrase settings and
the Daily/Weekly/Monthly schedule config remain available to both, unchanged.

Initially this was UI-only, with `download-backup.ts`/`list-backups.ts` still accepting any staff
session underneath — closed that gap same day: `download-backup.ts` (the endpoint that returns
actual backup *content*) is back to `requireAdminToken`, matching the UI. `list-backups.ts` stays
open to any staff session deliberately — it only returns filenames/dates, no content, and it's
what the operator's own Dashboard freshness tile depends on; locking it down would have silently
broken that tile (permanent "Drive unreachable") without meaningfully improving security. Upload's
own integrity-verification fallback (re-downloading to compare checksums) now uses the admin token
too, so for an operator it just quietly reports "unverified" instead of failing — harmless, since
Drive's upload response already includes the checksum directly in the common case and that fallback
essentially never fires.

## 2026-08-03 — Open Backup & Restore to operator accounts (was admin-only)
User request: operators should see and use Backup & Restore exactly like admin, including the
Dashboard freshness tile and "backup uploaded" notifications. Three layers of gate, all opened:
(1) UI/routing — the Dashboard tile condition, the `BackupRestore.tsx` page-level redirect,
and the Sidebar nav link (now shown to operator under Settings alongside Operator Zone) all
changed from `role === 'admin'` to `role === 'admin' || role === 'operator'`; RLS on
`backup_settings`/`app_notifications` already permitted any active app_user, no change needed
there. (2) **Backend auth — the real work**: `list-backups.ts`/`download-backup.ts`/
`upload-backup.ts` were gated on `requireAdminToken` (an admin-only trusted-device token minted
only via PIN+Telegram-2FA — hardened 2026-07-25 after these endpoints were briefly reachable
with zero credentials in production), which operators had no path to obtain. Swapped all three to
`requireStaffSession` (existing pattern from `dentoral-bridge.ts`) — accepts any signed-in staff
member's ordinary Supabase Auth session via `Authorization: Bearer <token>`. Admin already holds
such a session post-login, so admin's behavior is unchanged; operators can now genuinely Upload to
Drive, Restore from Drive, and see the freshness dot, not just view the page. `admin-users.ts`
(Admin → Users) still uses the old admin-only token — untouched, still admin-only. (3)
**Notifications**: `BackupReminderBanner`'s admin-only render gate and its five
`audience: 'admin'` notification posts (including the "backup uploaded" one) now run/post for
operator too; audience was widened to everyone (omitted → `null`) rather than admin+operator only,
since the schema only supports a single role or "everyone" — doctor accounts will now see backup
notifications despite not having page access, an accepted minor inconsistency.

## 2026-08-03 — Fix cross-device restore rejecting a correct backup passphrase
Reported: an encrypted backup's passphrase worked to restore on the device that created it, but not
on other devices. The encryption itself (`src/lib/backupCrypto.ts`, PBKDF2 + AES-GCM) is fully
portable — the salt/IV travel inside the backup file, nothing device-specific is mixed into key
derivation — so a correct passphrase should always work anywhere. The actual bug: the passphrase is
`.trim()`ed when it's *set* (`BackupRestore.tsx`, Save) but wasn't trimmed when typed into the
restore-time "Unlock" prompt, so a passphrase carrying a stray leading/trailing space or newline
(easy to pick up when writing it down, pasting from notes, or retyping on a second device) would
silently fail to decrypt an otherwise-correct file. Fixed by trimming on the restore side too. Also
added an explicit line to the encryption toggle's description clarifying the passphrase is
device-local and must be typed in again (not automatically available) on every other device.

## 2026-08-03 — Fix tables and a column silently missing from the two backup mechanisms
Audit (prompted by a "does backup cover the new features" question) found the same failure mode
that hit `staff`/`staff_salary_payments` on 2026-08-01 had recurred: `backup_settings` (031) and
`app_notifications` (032) had never been added to either backup's table list despite being live for
weeks/months, and `app_users.default_share_pct` (048) was silently dropped from the in-app device
backup specifically, because that table needs a hand-maintained column list (RLS lockdown blocks
`select('*')` on it) that was never updated after the column shipped. The local script
(`scripts/backup/lib.mjs`) had a further gap the in-app backup didn't: `appointment_schedule_windows`/
`appointment_schedule_date_overrides` (041, the live slot-scheduling tables) were missing from it
alone. Fixed everything in both `src/lib/deviceBackup.ts` and `scripts/backup/lib.mjs`. A separately
suspected gap, `appointment_settings` (040), turned out to be a false alarm caught before shipping —
that table was superseded and dropped by migration 041 the same day, so its absence from both lists is
correct; verified live (querying it 404s in production). New columns on already-backed-up tables (e.g.
this week's `appointments.reminder_sent_at`, `patients.followup_reminder_sent_at`) were never at risk
— every other table uses `select('*')` and picks up new columns automatically.

## 2026-08-03 — Post-visit appointment prompt + Dashboard treatment follow-up reminders
Two additions to the one-tap WhatsApp work: (1) after saving a New Visit, once the payment
thank-you prompt (if any) is dismissed, a "Schedule next appointment?" dialog offers to book the
patient's next visit immediately via the existing `AppointmentModal` pre-filled for that patient —
staff no longer have to leave Patient Profile to book the follow-up. (2) A new Dashboard card
(`TreatmentFollowUpCard.tsx`, above the Backup health tile) surfaces patients with an incomplete
treatment plan who haven't visited in 2+ months and have no upcoming appointment, with a one-tap
cordial `wa.me` nudge; sending snoozes that patient for 30 days (`patients.followup_reminder_sent_at`,
migration 050). Same day: widened the appointment reminder window from 6h to 12h, corrected the
clinic name/message wording after live testing, added a one-tap WhatsApp reschedule notice, and
added the invoice running-total line to the payment thank-you message.

## 2026-08-02 — Per-doctor default Doctor Share % on account creation (+ a same-day grant fix)
Admin → Users → Add/Edit Account gains a "Default Doctor Share %" field, doctor role only
(`app_users.default_share_pct`, migration 048, nullable — NULL keeps the existing flat 30% clinic
default). New Treatment Plan now pre-fills Doctor Share % from the selected doctor's own default
instead of a flat 30% for everyone: applied the moment the Attending Doctor dropdown changes
(admin/operator picking a doctor), and via an effect for self-locked doctor sessions, which have no
dropdown to fire an onChange from. Still editable per item, same as before. Shipped alongside the fix
below since both touch the same Attending Doctor picker.
**Same-day follow-up fix:** `app_users` uses column-level grants, not a table-wide one (see
DATABASE.md §3) — 048 added the column but not its `GRANT SELECT`, so the moment the column was
added to `listAppUsers()`'s/`fetchDoctorsList()`'s select lists, both broke in production with
`permission denied for table app_users` (not a column-specific message — easy to mistake for an RLS
regression). Fixed within the hour by 049 (`GRANT SELECT (default_share_pct) ... TO authenticated`).
Lesson for future `app_users` columns: the grant has to ship in the same migration as the column, not
follow it.

## 2026-08-02 — Fix Attending Doctor picker showing every admin account as a doctor
`PatientProfile.tsx`'s `fetchDoctorsList()` queried `app_users` for `role IN ('doctor', 'admin')` and
added every result's name to the Attending Doctor dropdown — so any admin/test account (e.g. "Clinic
Admin", a dev/test login) appeared as a selectable "who performed this procedure" answer for anyone,
not just their own name when self-attributing (which a separate block already handled correctly).
Found while investigating a related report (see below) — the same picker showed 3–4 names where there
should have been 1–2 real doctors. Scoped the roster query to `role = 'doctor'` only.

## 2026-08-02 — Root cause: doctor's own account showed BDT 0 in their self-locked Doctor Analytics
Reported live: logging in as the clinic's doctor showed BDT 0 everywhere in Doctor Analytics, despite
real payments existing. Root cause confirmed against production data: the self-lock filter matches
`treatments.doctor_name` against the session's own name by exact (case-insensitive) string —
`app_users.full_name` for that account was `"gopi"`, but every treatment had `doctor_name = "Dr. Gopi
Sankar Banik"` (the string the admin bulk-assign tool picked, matching the separate Doctor Profile
record, not the login account's own name). `"gopi" !== "dr. gopi sankar banik"` → every row filtered
out. Fixed by renaming the account's `full_name` to match what was already on every treatment — zero
treatment rows needed to change. Confirms a risk flagged during the 2026-08-01 review
(`treatments.doctor_name` is free-text, not a FK) actually manifesting; see DATABASE.md's note on the
`treatments.doctor_name` column for the general risk and how to avoid it recurring. **Caveat that
tripped verification:** the doctor's session caches `full_name` at login time — after the rename, the
account had to log out and log back in before Doctor Analytics reflected it; simply reloading the
page under the still-open old session kept showing BDT 0. Verified live, resolved.

## 2026-08-02 — Doctor Analytics: Statement/Detailed views, date sorting, per-patient grouping
Three problems reported against the live Doctor Analytics tab, with a reference statement from
another clinic attached for comparison: **Work Done included Planned and Cancelled treatments**
(no status filter existed at all); **Work Done was unsorted** (whatever order Postgres happened to
return); **Collections repeated the same patient** across scattered, disconnected rows instead of
grouping their payments together. Fixed:
- Work Done now filtered to **Completed + In Progress** only, sorted by date ascending.
- Added a **Statement** view (default) — one table, grouped per patient, work rows and collections
  merged into a single per-patient block with one payout total on the right, matching how the
  reference clinic's own sheet actually adds up (confirmed row-by-row: a patient's individual work
  amounts summed exactly to their listed Total Paid).
- Kept the original two-section layout as a **Detailed** view, switchable via the same tab pattern
  Financial Analysis already uses for Doctor/Staff — Collections there is now also grouped per
  patient with a subtotal row.
- Both views compute from one shared `patientGroups` structure, so Statement and Detailed can never
  disagree on a number; CSV/PDF export follows whichever view is active on screen.

## 2026-08-02 — Add per-row "Resolve" action for payments with no linked treatments
A payment could land in Needs Attention with **no treatment record at all** on its invoice (e.g. a
manual/legacy payment never tied to any procedure) — previously a dead end, permanently excluded from
every doctor's total with no way to fix it short of a database edit. Added a typed `reasonCode` to
`FlaggedRow` (`unknown_invoice` / `no_linked_treatments` / `no_doctor_assigned` / `mixed_doctors` /
`reconciliation_gap`) and, admin-only, an inline "Resolve" control on `no_linked_treatments` rows:
pick a doctor + share %, and it creates one synthetic `treatments` row (marked in its notes as
auto-created) to retroactively attribute the payment through the existing `payment → invoice →
treatments → doctor_name` chain — deliberately reusing that chain rather than building a second,
parallel attribution mechanism.

## 2026-08-01 — Fix duplicate Doctor Analytics / Financial Analysis sidebar links for operators
Reported live via screenshot: an operator granted `can_access_doctor_analytics` saw **two** sidebar
links — the standalone "Doctor Analytics" entry (meant only for an actual `doctor` role's self-locked
personal view) and "Financial Analysis" — both leading to the exact same unscoped "All Doctors" view,
since `DoctorAnalyticsSection`'s self-lock only ever applies to `role === 'doctor'`. The standalone
link now only renders for that role.

## 2026-08-01 — Fix PDF downloads silently failing in the Android app
`Clinicmx-web-apk` (sibling Capacitor project, `D:\Claude\Clinicmx-web-apk` — a bare Android WebView
wrapper pointed at the live `clinicmx-web.pages.dev` URL, no bundled build step) reported PDFs not
saving. Root cause: `jsPDF.save()` relies on the browser's native `<a download>` + blob-URL
mechanism, which silently does nothing in that WebView (no download handler, no filesystem plugin
installed — confirmed via `Clinicmx-web-apk/package.json`, only bare `@capacitor/core`). Every
other PDF in the app (prescriptions, invoices, treatment plans, estimates) already avoided this by
going through `sharePdf()` (`src/lib/sharePdf.ts`) — tries the Web Share API first
(`navigator.share` with a real `File`), which the Capacitor WebView *does* support and opens the
native OS share sheet; falls back to the old download+alert only when Web Share isn't available.
Doctor Analytics, Clinic Analytics, and Staff Analytics were the three PDF exports never wired up
to this pattern. Fixed all three to use `sharePdf()`; extended `SharePdfInfo`'s
`channel`/`email`/`waNumber` to be optional for generic "just give me the file" downloads (no
specific recipient) — the fallback now shows a plain "downloaded" alert instead of requiring a
channel. `generateClinicAnalyticsPDF` now returns the `jsPDF` document instead of calling `.save()`
internally, matching `generateFinancialStatementPDF`/`generateStaffSalaryPDF`, which already did.
No native/Android change needed — since the APK just loads the live URL, this fixes itself on the
next deploy.

## 2026-08-01 — Clinic Revenue Statement print modal: mobile overlap + 9 stale baseline TS errors
- **Mobile fix:** the print modal's top control bar (title + Export/Download/Print/Close buttons)
  was a single non-wrapping flex row, and the summary block was a hard `grid-cols-4` — both
  collided/overlapped on phone-width screens. Stacks the control bar below `sm:`, moves Close inline
  with the title on mobile, and drops the summary grid to 2 columns below `sm:`. Verified at 360px
  against live data.
- **Fixed 9 pre-existing TypeScript errors** (confirmed via `git stash` to predate this session,
  left alone under scope discipline until asked to fix them) — two were real, user-visible bugs, not
  just typos: `generateClinicAnalyticsPDF`'s signature referenced `MonthlyRevenueRow`/
  `TopRevenueSourceRow`, types that were never exported (real names `MonthlyRevenuePoint`/
  `TopRevenueSource`); and `ClinicAnalyticsReportPrintModal.tsx` read `doctor?.clinic_name`/
  `doctor?.address`, neither of which exist on `DoctorProfileData` (real fields `workplace`/
  `clinic_address`) — so the printed clinic report's header **always** silently showed the generic
  "ClinicMx Dental Care" placeholder with no address, regardless of the real clinic profile. Also
  removed a dead `logoSrc` line (`cleanLogoSource(doctor?.logo_url)` — wrong field, unawaited
  Promise, never rendered anywhere) and an unused `patients` parameter on
  `generateClinicAnalyticsPDF`. `npx tsc --noEmit` now reports zero errors for the first time this
  project has been worked on by Claude Code.

## 2026-08-01 — Financial Analysis rebuilt: real-payment payout ledger, Staff Analytics, per-account permissions
Built on top of the security-review fixes below (migrations 043–044). Sidebar's admin "Doctor
Analytics" link became **"Financial Analysis"** (`/financial-analysis`), a tabbed page for **Doctor
Analytics** + new **Staff Analytics**; doctors keep their own separate, unchanged, self-locked
"Doctor Analytics" entry.
- **Doctor payout statement rebuilt as a two-part ledger** (`src/lib/doctorAnalytics.ts`), replacing
  per-treatment allocation (`Total Paid` = treatment cost × the invoice's payment ratio — produced
  fractional "paid" amounts like BDT 3,333.33 against a still-incomplete BDT 4,000 crown, the root
  of "Madhobi Rani's crown works aren't completed, still show paid?"). Now: a **Work Done** log
  (procedures performed, no money columns) and a separate **Collections** log driven entirely by
  real `payments` rows — every `Total Paid`/`Dr. Income` figure is now a real amount someone
  actually paid, never a derived slice. Attribution: `payment → invoice → linked treatments →
  doctor_name`; an invoice with treatments from **two different doctors** is flagged into a new
  **Needs Attention** panel for manual resolution rather than split or guessed (explicit user
  decision). TxC is pro-rated per payment against the invoice's total lab cost. Also checks for
  standing reconciliation gaps (`invoice.paid_amount` with no matching `payments` rows — a legacy
  fallback in `recordInvoicePayment` can update the invoice total without writing a ledger row);
  verified 0 gaps across 23 invoices in production at the time of this change. `Work Done` buckets
  by `completed_at` (see migration 047 below), falling back to `created_at` for not-yet-completed
  treatments.
- **Bulk-assign default doctor** (Needs Attention panel, admin-only): verifying against real
  production data found virtually every treatment had no `doctor_name` set at all — every real
  payment was landing in Needs Attention, Total Collected/Dr. Income showing BDT 0.00 across the
  board. Admin picks one doctor from a dropdown, applied to every treatment currently missing
  `doctor_name` — only ever fills a blank, never overwrites an existing (even wrong) assignment,
  never touches mixed-doctor or no-linked-treatment flags. Each row snapshotted via `logEdit` first
  (same pattern as `PatientProfile.tsx`'s `updateGroupTreatmentsStatus`), so any individual
  assignment stays revertible afterward even though the bulk action itself has no single undo.
- **Doctor field locked to self for the `doctor` role** in New Treatment Plan / Edit Treatment
  (previously an open dropdown, letting a doctor reassign a treatment to a colleague); Doctor Share
  % hidden from non-admins in both modals (admin-set, feeds month-end payout only); relabeled
  "Procedure done by Dr." → "Attending Doctor".
- **`treatments.completed_at`** (migration 047): a `BEFORE INSERT OR UPDATE` trigger stamps it the
  moment `status` transitions into `'Completed'` (any write path — direct edit, invoice flow,
  future ones — one trigger instead of scattering the logic across app code) and clears it back to
  `NULL` if status moves away from Completed. One-time backfill from `created_at` for treatments
  already Completed (no `updated_at` column exists to backfill from instead). Statement bucketing
  switched from creation month to completion month — a July-created crown finished and paid in
  August now shows in August's statement, not July's.
- **New Staff Analytics tab** (`src/components/analytics/StaffAnalyticsSection.tsx`,
  `src/lib/staff.ts`, migration 045 — new `staff` + `staff_salary_payments` tables): roster of
  salaried staff (name, phone, designation, monthly salary — including any fixed-salary doctors),
  plus a monthly salary statement generator (month/date selection, generate rows, record
  bonus/deduction/advance/payment per staff member, export CSV/PDF). `staff_salary_payments` snapshots
  `base_salary` at row-creation time so a later raise doesn't silently rewrite an already-generated
  month's statement.
- **Three new per-account permissions** (Admin → Users, `app_users.permissions` JSONB):
  `can_set_doctor_share_pct`, `can_access_doctor_analytics`, `can_access_staff_analytics` —
  independently grantable so e.g. an operator can be given Staff Analytics without also getting
  Doctor Analytics. `can_access_staff_analytics` is backed by real RLS (migration 046 — `staff`/
  `staff_salary_payments` policies use `app_can('can_access_staff_analytics')`, same helper
  pattern as migration 039); the other two are UI-layer workflow controls only (the underlying
  `treatments` RLS already permits any active app user to write those columns — unchanged by this
  work, noted rather than tightened).

## 2026-08-01 — Security review of Anti-Gravity changes to DentOral bridge + Doctor Analytics (migrations 043–044)
While Claude Code was rate-limited (2026-07-29 to 07-31), the user built the DentOral booking
bridge, an earlier single-list version of Doctor Analytics, and Clinic Analytics reporting in
Anti-Gravity — reviewed for vulnerabilities once Claude Code was back. Branch
`fix/antigravity-security-review`, merged same day.
- **PostgREST filter injection** in `DentoralBookingBridge.tsx` (`src/components/`) — the public
  booking form's name field was interpolated raw into a `.or()` filter string, reachable by anyone
  once the bridge's own admin-password gate had separately been disabled by user decision (accepted
  risk, not fixed here). Replaced with parameterised `.ilike()` queries + metacharacter stripping.
- **Doctor Analytics "My Appointed Work" lock failed open**: an unresolved doctor identity
  (`doctorProfile` still loading, or no `full_name` on the account) fell through to `'ALL'`,
  showing a doctor every other doctor's payout and the clinic's total income while the UI still
  claimed it was locked to their own work. Now fails closed with an explicit
  "Could not determine which doctor you are" panel and zero data until identity resolves.
- **CSV formula injection** in both new exporters — added a shared `csvCell()` escape helper
  (`src/lib/utils.ts`) so a leading `=`/`+`/`-`/`@` in any patient name, note, or treatment type
  can't execute as a formula when the CSV is opened in Excel/Sheets.
- **Payout math**: `rf_pct` (referral fee) was read but no migration ever created the column, so it
  silently always computed to zero — removed rather than shown as a permanently-zero line (later
  fully superseded by the two-part ledger above). Default `doctor_share_pct` disagreed four ways
  (DB default 30, every write path saving 50, list display showing 30, payout math using 50) —
  first unified to 50%, then reverted to 30% same day per user decision (migration 044) after
  landing 043 with 50%; both migrations are in the file history rather than 043 being edited after
  the fact, since it had already run live.
- **Doctor attribution defaulted to whoever was logged in with no role check** — an operator
  creating a treatment plan was silently attributed as a 50%-share doctor for procedures they never
  performed. Gated the default (and the "Procedure done by Dr." dropdown) to `doctor`/`admin` roles
  only; migration 043 adds an `app_users_select_roster` RLS policy so non-admins can actually see
  the doctor roster (previously admin-only per migration 039's `app_users` policy, silently
  starving the dropdown for everyone else).
- Synced migration 042's `treatments.doctor_name`/`doctor_share_pct` (added by Anti-Gravity,
  never mirrored) into `src/lib/database.types.ts` and `entityTables.ts` — the gap meant an audit
  restore of a treatment was silently dropping both columns.
- Cleared a stale `dentoral_bridge_pw` localStorage value left behind from the now-removed
  password-prompt flow.
- **Accepted risk, not fixed (explicit user decision):** the DentOral booking API
  (`dentoralbd.pages.dev/api/appointments`) has no authentication — confirmed live, a plain `GET`
  returns patient name/phone/age/gender with no credential. Left as-is at the user's direction.

## 2026-07-25 — Security hardening Phase 1: authenticate the backup endpoints
Following `SECURITY-HARDENING.md`. While researching, found that `GET /api/list-backups` was
reachable with no credentials and returned real backup filenames/Drive file IDs from production —
not previously documented as a gap, and the most serious live finding of the review (also meant
`POST /api/upload-backup`, unauthenticated, could let a stranger push files that evict real
backups via retention pruning). Also confirmed admin 2FA was already correctly configured in
production.
- **`functions/api/list-backups.ts` · `download-backup.ts` · `upload-backup.ts`** now require the
  header `X-ClinicMx-Auth: <trusted-device token>`, checked by a new `requireAdminToken()` in
  `_authLib.ts` against the existing `ADMIN_AUTH_SECRET`. Fails closed if that secret is unset.
- **`functions/api/admin-otp.ts`** — the `trusted: true` response (device already holds a valid
  token) now also mints and returns a *fresh* 7-day token, so normal admin logins keep sliding the
  device's backup access forward instead of it silently lapsing between logins.
- **`src/lib/adminOtp.ts` / `deviceBackup.ts`** — client sends the stored device token on all
  backup requests; a 401 now surfaces "Your device trust expired — log out and log in as admin
  again to refresh it" instead of a generic failure.
- **`src/pages/Login.tsx`** — admin login in production now hard-fails if the 2FA endpoint reports
  `unconfigured` or `unreachable`, instead of silently falling back to the PIN alone (which is
  compiled into the public JS bundle). Local dev (`npm run dev`, no Functions layer) is unaffected
  — that path still logs in PIN-only, as before. `ADMIN_PASSWORD` renamed to
  `SECURE_STORAGE_PASSPHRASE` to make clear it no longer authenticates anyone — the server does —
  it only derives the secure-storage encryption key. Value unchanged (user's choice).
- **`.env.example` / `API.md`** — removed the trap instructing a Google service-account private
  key into a `VITE_`-bundled variable (that integration has zero importers and isn't deployed);
  fixed `API.md` documenting the wrong Google OAuth env var names.
- No SQL migration, no schema change, no change to daily login/backup behavior for real users.
  RLS/anon-key access (the bigger remaining gap) is deliberately out of scope — tracked as Phase 2.

## 2026-07-25 — Treatment Plan card + print/share, auto-advancing treatment status
- **Patient Profile → Clinical tab:** new "Treatment Plan" card between Treatment Summary and Clinical Consultation History — full per-treatment detail (type, tooth, description, status, cost, notes) plus a Subtotal/Discount/Total summary, capped to the 5 most recent with a "View full history" link to Operations. **Print / Share** opens a new `TreatmentPlanPrint` component (`src/components/TreatmentPlanPrint.tsx`, PDF via `src/lib/treatmentPlanPdf.ts`) — a sibling of the existing treatment-estimate print, reusing the same letterhead/`sharePdf` plumbing but framed as a clinical plan document (not a quotation) and always covering the full list, not just the on-page preview.
- **Treatment status now auto-advances on billing/payment**, alongside the existing manual controls (Operations dropdown, Add Visit picker), which are unchanged: billing a treatment (any of the app's 4 places that attach a treatment to an invoice) bumps Planned → In Progress (`advanceTreatmentStatusOnBilling`, `src/lib/invoiceSync.ts`); an invoice reaching fully paid (inside the single shared `recordInvoicePayment`, `src/lib/payments.ts` — covers every payment flow including Billing's bulk "Mark Paid") completes every treatment still linked to that invoice. Both are per-treatment-row (via each row's own `invoice_id`), so multi-visit/multi-plan billing reflects honest, mixed progress rather than an all-or-nothing state. Neither transition ever downgrades a status a human already set (In Progress/Completed/Cancelled are never overwritten), and payment edits/deletes that drop an invoice back below fully paid do **not** auto-revert a completed treatment — that's a deliberate one-way design, correctable only via the manual dropdown.
- **Fix (same day): Treatment Plan discount was wrong or missing.** Found by the user comparing the printed Treatment Plan against the real Invoice for the same patient — the card/PDF's Subtotal/Discount were computed purely from `treatments.original_cost`/`cost`, which drift from what a patient was actually billed (ad-hoc discounts added when an invoice is created/edited, invoice merges, manually-added invoice line items with no treatment row at all). New `computeTreatmentPlanTotals` (`src/lib/treatmentPlanTotals.ts`, shared by the card, print component, and PDF) now resolves each treatment's live invoice the same way `invoiceSync.ts`'s `findLinkedInvoice` does (including following past a stale `status: 'Merged'` invoice to find the real one) and uses that invoice's actual `total_amount`/`discount_amount` once per distinct invoice, falling back to the treatment-level figures only for not-yet-billed treatments. Also added a **"Show discount breakdown"** checkbox (card and print toolbar, default on) to hide the Subtotal/Discount lines and show only the Total, per the user's request.
- **Group similar (same day):** a **"Group similar"** checkbox (card and print toolbar, default off) mirrors the existing invoice/estimate feature — merges treatments identical apart from tooth number into one row (e.g. "Crown x5 (T23, T44, T45, T46, T47)") with a combined tooth list and summed cost; rows differing in status, price, or description stay separate. Implemented by `buildTreatmentPlanRows` (`src/lib/treatmentPlanTotals.ts`); purely a display transform — plan totals are always computed from the raw, ungrouped treatment list regardless of the toggle.

## 2026-07-22 — Fix "Unknown Patient" in Analytics for consultation payments
Found by the user: a consultation-only patient's payment showed as "Unknown Patient" in the Daily Earnings calendar's per-day breakdown (clicking it still opened the right profile, since that used the payment's real `patient_id` — only the *displayed name* was wrong).
- Root cause: `Analytics.tsx`'s patient fetch filtered out `patient_type = 'consultation'` rows at the query level (added when the Consultation tab shipped, to keep them out of "New Patients" counts) — but that same filtered list was also handed to `paymentsByPatient()` and `topRevenueSources()` in `src/lib/analytics.ts` for name lookups, so any consultation-only patient's name silently failed to resolve.
- Fix: fetch all patients (unfiltered, now including `patient_type` in the select) and keep that full list for name resolution (Daily Earnings breakdown, Top Revenue Sources). Only the "New Patients" stat tile and the New-Patients-per-Month/Patient-Growth charts now use a separate `fullPatients = patients.filter(p => p.patient_type !== 'consultation')` memo, preserving the original intent of not inflating those specific counts.

## 2026-07-22 — Consultation tab (migration 033)
- **New `/consultations` page** (sidebar: Patients → Consultation, above Treatments): entry point for walk-in patients who only came for a paid consultation, no treatment yet. New `patients.patient_type` column (`'full' | 'consultation'`, default `'full'`, `supabase/migrations/033_patient_type.sql`) — consultation entries are regular `patients` rows (get a real `PT-1xxxxx` code) tagged so they're hidden from the main Patients list, Dashboard patient count, and Analytics new-patient charts until converted.
- **Add Consultation modal:** only name, age, and sex are required; phone/email/DOB/address/notes sit behind a collapsed "More details (optional)" section, reusing the same optional-field pattern as the full Add Patient form. Adds a required Consultation Fee field. On save, creates the patient (`createPatient()` in `src/lib/patients.ts`, extended with a `patient_type` param) then immediately opens `InvoiceModal` prefilled with a single "Consultation" line item via a synthetic `InvoiceTemplateData` (`id: ''` so it doesn't try to FK to a real `invoice_templates` row) — reuses the existing invoice/payment/WhatsApp-thank-you pipeline unchanged, so the fee flows into Analytics Revenue like any other invoice.
- **Row actions:** Invoice fee (re-opens `InvoiceModal` for a follow-up consultation), **Convert to patient** (flips `patient_type` to `'full'`, audited via `logEdit`+`logActivity`), Write prescription (routes to `/prescriptions`, now selectable there — see below), Edit, Delete (existing `logEdit`/`logDeletion`/`canDelete()` pattern).
- **Prescriptions can now be written for consultation-only patients:** removed the `patient_type` filter from the Prescriptions page's patient list (the only page-specific change made to the frozen Prescriptions patient-selection flow — the flow itself wasn't touched, just its dataset). Every other full-patient screen (Patients, Dashboard, Billing, Treatments, Lab, Appointments) filters consultation entries out of patient pickers/lists; QrSearch and PatientProfile deliberately don't filter (QR resolves by code; a consultation patient's profile is viewable like any other).
- `src/lib/database.types.ts` and `src/lib/entityTables.ts` (`ENTITY_TABLE_COLUMNS.patient`) updated with the new column so audit snapshots/restores carry it.
- **Post-intake prescription prompt:** once the invoice step for a freshly-added consultation is done (saved or skipped), a small dialog asks "Write a prescription now?" — Write Prescription routes to `/prescriptions`, Not now just dismisses.
- **New Prescription → New Patient can create a consultation-only patient directly:** a "Consultation only" checkbox above the name fields (with a required Consultation Fee field when checked) creates the patient with `patient_type = 'consultation'` instead of the default `'full'`. After the prescription saves, the same synthetic-template `InvoiceModal` flow used by the Consultation page's Add Consultation modal opens automatically for the fee. This is the one addition to the Prescriptions page's frozen patient-creation path — done at the user's explicit request.

## 2026-07-22 — Consultation feature: four post-launch fixes (migration 036)
Found by the user while using the feature shipped earlier the same day (commit `7e2f6b0`).
- **CO- codes now get reused** (`supabase/migrations/036_consultation_code_reuse.sql`): `generate_consultation_code()` switched from a fixed sequence to `MAX(existing CO- number)+1` (floor 400000), computed live from `patients` each call. Deleting or converting the highest-numbered consultation frees its number for the next entry — a number stays reserved as long as *any* row (converted or not) still holds it. Interior gaps (deleting an older entry while newer ones exist) are deliberately not back-filled. `consultation_code_seq` (034/035) is now unused but left in place so rollback stays trivial.
- **Convert to Patient now assigns a fresh `PT-1xxxxx` code**, not just flipping `patient_type`: both `handleConvert` (`src/pages/Consultations.tsx`) and `handleConvertToPatient` (`src/pages/PatientProfile.tsx`) now call the existing `generate_patient_code` RPC and write `{ patient_type: 'full', patient_code: newCode }` in one update (so there's no window with a missing code); the `logEdit` snapshot taken first preserves the old CO- code for revert, and the activity-log detail now reads e.g. "Converted from consultation to full patient (CO-400002 → PT-100031)". This is what frees a CO- number for reuse.
- **Back button on a consultation-only patient's profile now returns to `/consultations`** instead of `/patients` — `PatientProfile.tsx`'s Back button uses `isConsultationOnly` (already computed for the tab filtering) to pick the destination. Full patients are unaffected.
- **"Write Prescription" now opens the New Prescription form with the patient preselected**, instead of landing on the bare Prescriptions list: all three call sites in `Consultations.tsx` (row action, post-intake prompt) now `navigate('/prescriptions', { state: { newPrescriptionPatientId } })`; `Prescriptions.tsx` reads that router state in a new effect (guarded on `patients.length` so it waits for the list to load), sets `patientMode('existing')`, preselects `formData.patient_id`, calls the existing `selectPatientHistory`, and opens the form — then clears the router state so it doesn't re-fire on back/forward navigation. The frozen patient-selection flow itself is untouched, only its entry point.

## 2026-07-22 — Consultation-code series + reduced patient-profile view (migration 034)
- **`CO-4xxxxx` patient codes for consultation-only patients (starting at `CO-400001`; migration 035 revised 034's initial 200001 start per user request)** (`supabase/migrations/034_consultation_patient_code.sql`): they were sharing the `PT-1xxxxx` series with full patients since the `patient_code` column's plain DEFAULT can't see `NEW.patient_type` in the same insert. Replaced the default with a `BEFORE INSERT` trigger (`assign_patient_code()`) that calls `generate_consultation_code()` (new `consultation_code_seq`) for consultation-only rows and the existing `generate_patient_code()` otherwise. No JS changes needed — `createPatient()` already re-reads whatever code ends up on the row. Existing consultation patients keep their original PT- code (not backfilled). `src/lib/prescriptionQr.ts`'s code-pattern regex now accepts both `PT-` and `CO-` prefixes so QR lookups keep working.
- **Consultation-only patients get a reduced Patient Profile view** until converted: `src/pages/PatientProfile.tsx` now computes `visibleTabOptions` filtered to a `CONSULTATION_VISIBLE_SECTIONS` allowlist (prescriptions, appointments, visits, consultations, investigations, billing) when `patient.patient_type === 'consultation'` — Overview and Files & Forms tabs disappear entirely; Clinical keeps only Visits/Consultations/Investigations (Medical, dental chart hidden); Billing keeps only the Billing sub-tab (Treatments/Pt. Log hidden). Deep-linking to a hidden `?section=` falls back to Prescriptions. A "Consultation-only patient" banner with a **Convert to Patient** button sits above the quick-action row (same conversion logic as the Consultation page's row action); "New Treatment Plan" and "Upload File" quick actions are hidden to match.

## 2026-07-20 — Pt. Log + admin billing-change bell alerts
- **"Pt. Log" section** in Patient Profile (Billing tab, new `PatientBillingLogPanel`): a read-only feed of the patient's invoice/payment creates, edits, and deletes — what changed and who did it (`formatAuditActor`) — reading `activity_log` filtered to `entity_type in (invoice, payment)` and `patient_id`. No new migration; `activity_log.entity_type` has no CHECK constraint.
- **Closed logging gaps** so every invoice/payment mutation is captured: invoice edits (`InvoiceModal.handleEditSubmit`) now snapshot to `edit_history` via `logEdit` instead of only `activity_log` (revertible, consistent with `Billing.tsx bulkUpdateStatus`); payment deletes (`PaymentHistoryPanel.handleDelete`) now also log to `activity_log` (previously only an `invoice_history` event, invisible outside the per-invoice timeline); payment creates via `PaymentEntryModal` now carry `patientId`/`patientName`/invoice number so they surface in patient-scoped views; invoice deletes note in their log details when payments were also lost to the `payments.invoice_id → ON DELETE CASCADE`.
- `logEdit`/`logDeletion` (`src/lib/editHistory.ts`/`deleteHistory.ts`) gained an optional `details` string, passed through to the `activity_log` fan-out.
- Fixed a pre-existing gap surfaced by this work: `InvoiceModal` skips fetching the full patient list when `hidePatientSelect` is set (both call sites always set it), so its patient-name lookup for audit logging silently resolved to nothing ("Unknown patient" in the bell/Admin Edit History). Added a `defaultPatientName` fallback prop, supplied by both callers (`PatientProfile.tsx`, `Billing.tsx`) from data they already have loaded.
- **Admin notification bell** (`NotificationBell.tsx`) now also polls `listRecentBillingAlerts()` (new `src/lib/billingAlerts.ts`) every 20s for recent invoice/payment edits/deletes (any actor, not creates) — read fresh from Supabase so it's identical across every admin device, unlike the existing localStorage-backed notification list. Unread state uses a per-device watermark (`getBillingAlertsSeen`/`setBillingAlertsSeen`) advanced only when the bell is opened; entries stay listed afterward. Clicking an entry opens that patient's Pt. Log.

## 2026-07-20 — Lab tab (migration 030 — NOT yet applied to prod at the time of this entry)
- **New `/lab` page** (sidebar: Patients → Lab, below Treatments): tracks labwork sent out — crowns, bridges, dentures, ortho appliances, veneers, inlay/onlay, implant prosthesis, post & core, night guards. New `lab_work` table (`supabase/migrations/030_lab_work.sql`).
- **Accounts payable to the lab vendor, not patient invoicing** — deliberately no link to `invoices`/`payments`; payment state is a single "Paid to lab" checkbox, no partial payments.
- **Tooth chart reused from Treatments/Prescriptions** (`ToothSelector`/`ArchDentalChart`) — selected teeth double as the unit count for **per-unit vs flat pricing**, toggleable per record; units default to tooth count but are editable (e.g. one appliance spanning many teeth billed as 1 unit).
- **Auto-create from Treatments:** saving a lab-related treatment (Crown, Bridge, Denture, Braces, Veneer, Implant, etc.) auto-creates a matching placeholder Lab record — one per (treatment-plan × work type), fire-and-forget, failure-isolated, idempotent via `UNIQUE(source_plan_group_id, work_type)`. New `src/lib/labWork.ts` (matching/pricing/total helpers + the auto-create hook); hooked into all three treatment-save paths (`Treatments.tsx`, Patient Profile treatment plan, Add Visit) with one added call each — no restructuring of existing save logic.
- List page mirrors Treatments' structure: grouped by patient, search, filter chips (All/Unpaid/Overdue), a totals bar (Total billed / Paid / Due to lab) that narrows to the current filter.
- Fully wired into the audit trail (`lab_work` added to `TrackedEntityType`, edit/delete history entity-type checks, Admin zone history filters/labels) and both backup registries (nightly `scripts/backup/lib.mjs`, in-app `src/lib/deviceBackup.ts`) and the `lab` page-permission key.

## 2026-07-20 — Daily Earnings calendar on Analytics
- **Month-grid calendar above Monthly Revenue** on `/analytics` (`src/components/analytics/RevenueCalendar.tsx`): per-day collected amount, own prev/next month navigation (independent of the 6M/12M/All selector), month total in the header. Tapping a day opens a modal breaking that day's earnings down by patient (`×n` for repeat payers, names link to the profile) — per-patient rather than per-treatment because a treatment-plan invoice mixes procedure types, making a per-type split of a day's cash misleading.
- **Deliberately payment-dated, not invoice-dated:** reads the `payments` ledger (`payment_date`, `amount`) so a day shows cash actually received then — unlike the rest of the Revenue section, which buckets `paid_amount` by `invoices.created_at`. Day totals therefore need not sum to the month bar below. Payments on Merged invoices excluded.
- New pure helpers in `src/lib/analytics.ts`: `dayKey`, `dailyCollected`, `paymentsByPatient`. Existing aggregations untouched; page adds one paged `select` on `payments`.

## 2026-07-20 — One-tap WhatsApp reminders & payment thank-you
- **Appointment reminder queue** (migration 029 `reminder_sent_at`, `src/components/ReminderQueue.tsx`): collapsible "Reminders due today" card on `/appointments` lists Scheduled/Confirmed appointments today within the next 6 hours that haven't been reminded; one tap opens `wa.me` with a prefilled message and marks it reminded (Undo until next refresh). No-phone patients show a disabled row instead of vanishing. Reschedule clears `reminder_sent_at` so the reminder becomes due again in the new window.
- **Payment WhatsApp thank-you** (`src/components/PaymentThanksPrompt.tsx`): after a payment is recorded via the Record Payment modal, immediate payment on invoice creation, or the Patient Profile visit-form payment, a one-tap prompt offers to send a cordial thank-you stating the amount paid (when the patient has a phone on file). Skip/close just dismisses it — nothing persisted. Not shown on Billing's bulk "mark selected invoices paid".
- Deliberately manual-tap `wa.me`, not the official WhatsApp Cloud API or n8n — both were evaluated and rejected for this increment: the Cloud API bills per business-initiated template message and needs a dedicated phone number pulled from the WhatsApp phone app; n8n only orchestrates and would still need the same Cloud API plus separate paid hosting. Shared helpers in `src/lib/whatsappMessages.ts` (message templates + `openWhatsAppMessage`, reusing `toWhatsAppNumber` from `src/lib/sharePdf.ts`).

## 2026-07-19 — Admin login 2FA (Telegram OTP)
- **Second factor on admin login** via new Cloudflare Pages Function `/api/admin-otp` (+ `_authLib.ts`, `_otpChannels.ts`; client `src/lib/adminOtp.ts`): after the PIN, unknown devices must enter a 6-digit Telegram code (5-min TTL, 5 attempts, per-IP failure lockout 10/h, send cap 5/h). Success mints a signed 7-day trusted-device token so daily logins skip the OTP. Recovery-code path (Cloudflare secret) when Telegram delivery fails. Channel pluggable — Gmail slot reserved.
- **Deploy-safe:** until the 5 secrets + `ADMIN_AUTH` KV binding are configured in the Cloudflare dashboard, the endpoint answers `unconfigured` and admin login remains PIN-only (same in local dev, where functions don't run). Doctor/operator flow untouched.

## 2026-07-18 — Clinic Analytics page
- **New admin-only `/analytics` page** (sidebar → Settings → Analytics): revenue, patient, and treatment analytics with a 6M/12M/All range selector. First charting in the app — `recharts` added as a dependency, code-split into the lazy-loaded Analytics chunk only.
- **Revenue:** monthly Collected vs Outstanding bars; revenue by treatment type (attributed via invoice line items' `source_treatment_id(s)`, paid amount distributed proportionally to line totals; manual/unlinked items bucketed as "Other / Unlinked"); top revenue sources table. Follows the repo revenue convention (non-Merged invoices, Σ `paid_amount`).
- **Patients:** new patients per month, cumulative growth line, returning-vs-new by month (a patient is New in the month of their first-ever non-cancelled appointment).
- **Treatments:** procedure counts and average cost per type (freeform `treatment_type` normalized case-insensitively, top 10 + Others), Planned → In Progress → Completed pipeline with completion rate.
- Strictly read-only (paged `select`s only); pure aggregation functions live in `src/lib/analytics.ts`.

## 2026-07-18 — Notification bell fixes
- Fixed mobile crop bug: the bell dropdown is positioned from the button's actual on-screen rect instead of a CSS `right-0` anchor (the bell isn't the header's rightmost icon, so it could overflow past the left edge of the viewport on narrow screens).
- Fixed a leak where admin-only notifications (backup reminders) stayed visible to a doctor/operator who logged in afterward on the same browser — stored entries now carry an `audience` role and are filtered on read.
- Bell now also surfaces the network access gate: a live, DB-derived entry for admin (pending count, identical across every admin device) and an informational one for a doctor/operator with an active session when one of their other devices has a request awaiting approval.

## 2026-07-18 — Network access gate
- **Per-user IP approval gate on doctor/operator logins** (migration 027 `authorized_ips` — NOT yet applied to prod at the time of this entry): unknown networks pause login for admin approval; each user keeps their last 5 approved IPs; new "Entry from any IP" permission bypasses the gate (also the escape hatch when the IP lookup fails — otherwise fail-closed). Admin logins never gated.
- Admin zone **Network Access** tab (approve/deny/remove, pending badge) + admin Dashboard banner for pending requests.
- `authorized_ips` added to nightly and device backup table lists.

## 2026-07-18 — Backup hardening
- Independent daily/weekly/monthly backup schedules with smart upload and a real notification center.
- Backup verification, anomaly detection, compression/encryption; scale-proofed for 3000+ patients.
- Timestamps in backup filenames; tiered Google Drive retention per category.

## 2026-07-17 — In-app backups & visit-flow polish
- In-app device backup, restore (dry-run first), and reminder system (`/backup` page).
- One-tap "Upload to Google Drive" for device backups (Cloudflare Pages Function).
- Restore-from-Drive and auto-prune for device backups.
- Treatment-plan discount, surfaced through Add Visit, invoices, and prints.
- Prompt to add a visit right after completing an appointment.
- Close (X) button added to all modals missing one.
- *(Docs)* OFFLINE_ROADMAP.md approved — offline/PWA plan, implementation not started.

## 2026-07-16 — Identity & billing UX
- Patient codes shifted to `PT-1xxxxx` format.
- Phone numbers normalized for search and save.
- Fixed doctor profile never syncing across devices (singleton + opened RLS).
- Billing invoice cards redesigned with per-patient color accents.

## 2026-07-15 — Nightly backups & visit/due accuracy
- **Daily Supabase → Google Drive backup with restore tooling** (GitHub Actions, 3:00 AM BDT; runs on the `gsbanikudc-byte` remote). Node 22.
- Visit↔invoice linking, including payments that only pay down an existing bill; live Billed/Due per visit; per-visit running due instead of the invoice's final due; redundant chips dropped.
- Grouped similar planned treatments in Add Visit (default In Progress).
- Auto-recovery from stale chunk errors after a redeploy.

## 2026-07-13 — Prescription sharing & billing sync fixes
- Prescription sharing by Email/WhatsApp as real PDFs; fixed broken Bangla text and missing QR in shared PDFs; desktop-width capture forced.
- Invoice↔treatment cost sync, visit summaries, duplicate detection fixes; billing workflow streamlined site-wide; mobile print modals fixed.
- Visit summary fields made non-editable; Visit History restyled.

## 2026-07-11 — Roles, permissions & audit
- **Admin/Doctor/Operator roles, per-user permissions, and Activity Log.**
- Combined-statement receipt grouping; treatment edit/delete; history grouping; receipt filename/grouping options.
- Fixes: Add Visit second payment, visit edit/delete, appointment dedup, timeline wrap, multi-tooth display, FAB overlap.
- *(Decision)* sk-dental frozen — all future work in Clinicmx-web only.

## 2026-07-07/08 — Invoice merging & multi-treatment plans
- Invoice merging, compact payment actions, receipt print format.
- Multiple treatments per plan, grouped for billing; shared invoice PDF matches the selected Detailed/Receipt format.

## 2026-07-06 — Tooth chart redesign & performance
- Tooth chart redesigned as vertical arch (FDI U-shape), age-aware dentition; Treatment Done syncs with the plan.
- Faster initial load and patient-profile loading (code splitting).
- Appointment reschedule feature; profile quick-add FAB; treatment/payment capture in the visit form; multi-tooth invoicing and sidebar nav fixes.

## 2026-07-04/05 — Billing prints, Bengali output & recovery center
- Billing menu reorganized; invoice printing (single/combined/list) with live search; combined statements with patient grouping, profile printing, WhatsApp sharing; invoices shared as actual PDFs with embedded logo.
- Medication Route/Dosage/Frequency/Duration/Instructions translated to **Bengali**; prescriptions grouped by patient.
- **Restore/revert recovery center + edit-history tracking** with responsible-role labels.
- Role-based login introduced (pre-permissions); delete audit trail; Doctor Profile restructure; site-wide unified patient search (false-positive fix); drug database additions (Nevian diclofenac, naproxen).

## 2026-07-02/03 — QR, profile tabs & prescription header
- **QR code on prescriptions** + QR patient lookup.
- Patient profile redesigned with tabs, smart header, activity timeline.
- Prescription header: 3-column layout with logo upload and multi-degree support.
- Tooth suggestions across clinical fields; quadrant picker for Chief Complaint; drug DB expanded (anti-ulcerants, more antibiotics/antifungals); DrugPicker false-empty-state fix; patient search in New Appointment/Prescription; age-field save fix.
- *(Incident 2026-07-02)* real invoice accidentally deleted during testing — motivated the backup system shipped 07-15.

## 2026-06-29/30 — Pediatric dosing & multi-entry clinical fields
- Infant/child dosage tiers, patient weight tracking, weight-based dose estimates; syrup/suspension/pediatric-drop forms with ml-dose calculator.
- Multi-entry clinical fields (C/C, O/E, Diagnosis, Plan) with per-entry tooth tagging.
- Prescription print redesigned to match the physical pad; footer pinned with Rx ID; structured medical-history tracking; inline new-patient creation in Prescriptions.
- *(Process note)* an over-scoped change here disrupted the Prescriptions patient-selection flow → the flow is now frozen and strict scope discipline adopted.

## 2026-06-27/28 — Drug database & doctor profile (Copilot era ends)
- Bangladesh dental drug database + DrugPicker (PRs #37–39); age-based dosing defaults; new drug classes.
- Doctor profile feature with prescription clinical fields, smart memory, print/PDF (PRs #33–35); encrypted local prescription templates.
- Custom ClinicMx logo/icon.
- *(Last GitHub-Copilot PRs; development moves to Claude Code.)*

## 2026-06-23–26 — Copilot build-out
- Real functionality for all modules against Supabase: patients, appointments (conflict checks, timezone fixes), treatments, prescriptions (investigations, template memory), billing (invoices, partial payments, discounts, BDT), inventory (PR #18), FDI tooth chart (PR #19), Google Drive/Sheets integration (PR #17, later abandoned), patient files via Supabase Storage (PR #1), login gate + protected routes, patient codes, visits, mobile navigation/touch-target passes, ErrorBoundary + widespread null-safety crash fixes, advanced invoicing schema (PRs #23–31 — several emergency compatibility fixes for production inserts).

## 2026-06-21 — Scaffold
- Initial template upload; React 18 + TypeScript + Vite + Tailwind + Supabase skeleton copied from the dentoral-group template; initial schema (001).
