# FEATURES.md — Detailed Functional Specifications

What each module does today (2026-08-01), as behavior — implementation notes live in [CLINICMX.md](CLINICMX.md), schema in [DATABASE.md](DATABASE.md). When modifying a module, the described behavior is the contract: don't change adjacent behavior without an explicit request.

---

## 1. Login & roles

- Role selector: **Admin** (PIN-gated, client-side, see `VITE_ADMIN_PASSWORD`), **Doctor** / **Operator** (accounts in `app_users`, email-or-phone identifier + password).
- Roles: admin = everything incl. delete/revert/clinic-profile/users; doctor = default no-delete, can revert; operator = default no-delete/no-revert. Per-user permission overrides (page toggles + `can_delete`/`can_revert`/`can_edit_clinic_profile`) set by admin in Users tab. Unknown/legacy permission keys fail open.
- **Three more per-account permissions (2026-08-01), same Users-tab mechanism:** `can_set_doctor_share_pct` (see the Doctor Share % field, §15b), `can_access_doctor_analytics` (gates the Financial Analysis page, §15b), `can_access_staff_analytics` (still backed by real RLS on `staff`/`staff_salary_payments`, DATABASE.md §3, but has had **no UI surface since 2026-08-08** — Staff Analytics moved into the strictly admin-only HR & Payroll page, §15c, so this toggle no longer grants any screen; left in the Users tab and at the database layer, not removed). `can_access_doctor_analytics` only controls what the UI shows/allows — the underlying `treatments` write permission was already broad before it existed and is unchanged by it.
- Page access enforced per-route (`RequirePage`); wrong login shakes; session persists in localStorage until logout.
- **Network access gate (2026-07-18):** doctor/operator logins (after the password verifies) check the device's public IP (ipify, 3s timeout) against that user's admin-approved list in `authorized_ips` — max 5 per user, oldest replaced on approval. Unknown IP → pending request + "Waiting for admin approval" screen (polls every 10s, auto-enters on approval); denied IP → refused. IP lookup failure → login **blocked** (fail-closed) unless the user has the **"Entry from any IP"** permission (`can_any_ip`, new Users-tab checkbox), which skips the gate entirely; missing key on old accounts = gated (fails closed, unlike page keys). Admin logins are never gated. Managed in Admin zone → **Network Access** tab; approve/deny/remove actions land in the Activity Log (`ip_access`).
- **Admin 2FA (2026-07-19):** after the PIN, an unknown device must enter a 6-digit code sent to the admin's **Telegram** (Cloudflare Pages Function `/api/admin-otp`; channel pluggable — Gmail planned). Behavior contract: code valid **5 min**, max **5 wrong codes** per code; successful verification stores a signed trusted-device token so that browser skips the OTP for **7 days**; ≥10 failures (PIN/code/recovery) per IP per hour → endpoint locks out for an hour; max 5 Telegram sends per IP per hour. If Telegram delivery fails, the card switches to the **recovery code** path (long passphrase, `ADMIN_RECOVERY_CODE` secret). While the Cloudflare secrets/KV are **not configured** the endpoint answers `unconfigured` and admin login stays PIN-only (deploy-safe); same PIN-only fallback in local dev where functions don't run. The hardcoded PIN constant remains in the bundle **only** as the secure-storage key-derivation input (all roles need it); the server holds its own `ADMIN_PIN` copy for the actual gate.

## 1b. Offline support (`offline-m1` lineage, merged to `main`)

The app is a PWA (installable, service-worker-cached) that keeps working with no connection:

- **Viewing:** Dashboard, Patients, Appointments, and a patient's full profile bundle (visits, treatments, prescriptions, invoices, payments, files) are cached in IndexedDB for 7 days and render from cache when offline.
- **Writing:** Treatment plan create/delete, invoice create, payments, patient visit create/edit/delete, and new prescriptions all work offline — each write queues to a local outbox instead of failing. See `src/lib/offlineSync.ts` for the mutation/group model. **Offline detection doesn't rely on `navigator.onLine` alone (2026-08-08):** `@supabase/postgrest-js` resolves rather than rejects on a dead network, so every write path routes through `src/lib/supabaseErrors.ts`'s `isOfflineFailure()`, which also checks the resolved error/status — matters most on the Capacitor Android WebView and flaky wifi, where `navigator.onLine` often reports `true` with no real connection. **Visit save/edit/delete can promote mid-submission (2026-08-09):** `handleVisitSubmit` writes a visit, then plan-item status updates, then any ad-hoc treatments — if `navigator.onLine` lied and the network dies partway through, the remaining writes in that same submission fall back to the offline outbox (same `groupId`, so the whole thing still syncs as one ordered unit) instead of the save being lost. The one exception is recording a payment on that visit, which has no offline path of its own (see below) — if the network died before reaching it, it's skipped with a clear message rather than attempted and thrown. `InvoiceModal`'s pending-treatments loader and `fetchDoctorsList`'s roster fetch (below) got the equivalent fix.
- **Doctor roster fallback, offline (2026-08-08, extended 2026-08-09):** the Attending Doctor dropdown and Doctor Share % field need `app_users` data that may not be reachable offline. First fallback is this patient's own cached treatment history (`doctor_name`/`doctor_share_pct` already on each cached row) — but a doctor's *first* treatment for a given patient has nothing to borrow from there. A device-wide roster cache (`idb-keyval`, key `clinicmx_doctor_roster_v1`, written on every successful online roster fetch) now serves as a lower-priority fallback below that, so a previously-seen doctor's real default share % shows up even for a patient they've never treated before, offline. Priority: this session's already-fetched data → this patient's cached treatments → the device-wide roster cache → the hardcoded 30% default (last resort).
- **Nothing uploads automatically.** Offline edits sit in the outbox until a user opens **Patients → Verify Offline Edits** (`/offline-outbox`, sidebar badge shows the pending count, notification bell also surfaces it) and presses **Approve & Sync** per item/group or **Approve & Sync All**. Discarding a draft there removes it locally and un-does its optimistic on-screen preview — nothing reaches the server.
- **Approval is account-scoped.** A device (e.g. a shared clinic tablet) can accumulate offline edits from more than one login. Whoever's account created an edit is the one who can approve or discard it from **Patients → Verify Offline Edits** — a doctor/operator only sees and can act on their own queued edits there, the same way `canDelete()`/`canRevert()` gate other actions by account. **Admin is the exception:** admin can see and act on every account's pending edits, from that same sidebar entry and also from **Admin zone → Offline Edits** (badge shows the total pending count across every account on the device).
- **Cross-device approval (2026-08-08, migration 055):** once a device has reconnected at least once, its queued edits are reported to the server with the payload encrypted client-side (AES-GCM; see `src/lib/payloadCrypto.ts` for the honest security note — the key is derivable from the public bundle, so this is defence-in-depth, not confidentiality; RLS is the real access control). The creator can then finish **Approve & Sync** from any device they log into (`/offline-outbox`'s "Pending on your other devices" section), and admin can do the same from **Admin zone → Offline Edits**. A per-row atomic claim guarantees only one device ever executes a given edit even if two are approved at nearly the same moment. **Coverage limit:** this only helps once a device has been online at least once after queuing the edit — a device lost or wiped while it was still offline, with the edit never reported, cannot be recovered this way. **A queued edit is never removed locally unless the server confirms it reached a terminal state (synced/discarded elsewhere)** — if another device merely holds an active claim on it, it stays queued here, marked "blocked," rather than being dropped (fixed 2026-08-08 after a claim-release bug briefly made a stalled sync retry silently delete the queued edit without ever writing it).
- **Admin zone → Offline Edits** (`src/components/admin/OfflineEditsTab.tsx`) is a dedicated audit log, not the same screen as the sidebar entry — built to match **Delete History**/**Edit History**'s look and behavior instead: filter chips by record type (Treatments / Invoices / Payments / Visits / Prescriptions / Audit Logs), collapsed rows that expand to the *full* queued record (every field, via the same `SnapshotDetails` renderer Delete/Edit History use), with Approve & Sync / Discard living inside the expanded panel. Each row shows who made the edit and when. Bulk **Approve & Sync All** / **Clear All** act on every account's queued edits (admin only). Its "Pending on other devices" section is also actionable now — Approve & Sync / Discard per row, same cross-device mechanism as above — once the row carries a staged payload.
- **Offline invoices** get a provisional number (`INV-TMP-xxxxxxxx`) and show an "Offline draft" badge on the invoice card in the Billing tab; the printed/shared PDF carries a matching notice ("Provisional invoice created offline — the invoice number will be adjusted automatically once the system is back online."). Once the invoice syncs, it's assigned a real number through the same 3-tier retry `InvoiceModal`'s online path uses (`src/lib/invoiceNumbering.ts`), and the badge/notice disappear.
- **Known gaps (not offline yet):** patient add/edit, appointments create/edit, dental chart, patient file upload, lab records, invoice edit/delete, and editing an *existing* prescription (new prescriptions work; editing reconciles against a live read of the prescription's billed treatment rows, which isn't safe to fake from a stale cache). Recording a payment on a new visit while *known* offline from the start is still blocked for the same reason — it can apply across several existing invoices at once — but a connectivity failure discovered mid-processing (started online, network died during the actual invoice/payment write) now falls back to the outbox instead of losing the payment (2026-08-09).
- **APK:** ships automatically to the existing Capacitor wrapper (`Clinicmx-web-apk`) on the next Cloudflare Pages deploy, no native rebuild needed — see CLAUDE.md.

## 2. Dashboard (`/dashboard`)

Live stats (patients, today's appointments, revenue/dues) + today's appointment list with patient links. Refresh button re-runs the consolidated loader. First page after login. Admin-only dismissible banner when network access requests are pending (links to the Admin zone Network Access tab).

- **Treatment follow-up reminders (2026-08-03, `TreatmentFollowUpCard.tsx`, above the Backup health tile):** a collapsible card lists patients with an incomplete treatment (`status IN ('Planned','In Progress')`) whose last visit (`patient_visits`, or oldest incomplete treatment if they've never had a recorded visit) is more than 2 months old and who have no upcoming Scheduled/Confirmed appointment booked. One tap opens `wa.me` with a soft, cordial nudge (`buildTreatmentFollowUpMessage` — no treatment names or amounts) and sets `patients.followup_reminder_sent_at` (migration 050), which snoozes that patient off the card for 30 days (Undo clears it). Self-contained: fetches its own data (4 bounded queries), renders nothing when the list is empty or a query fails. Deliberately manual-tap, same rationale as the appointment reminder queue.
- **Storage Health tile (2026-08-04, admin/operator only, below Backup health):** shows Supabase database size + `patient-files` bucket size against configurable plan-quota limits (`SUPABASE_PLAN_DB_LIMIT_MB`/`SUPABASE_PLAN_STORAGE_LIMIT_MB` Cloudflare env vars, default Free tier 500MB/1GB), with a green/amber/red dot per number. Backed by `get_storage_usage_stats()` (migration 051, service_role-only RPC) via `functions/api/storage-usage.ts` (`requireStaffSession`-gated) and `src/lib/storageUsage.ts`. Fails gracefully ("Storage usage is unavailable right now.") if the endpoint isn't reachable — expected in local `vite dev`, which doesn't serve Cloudflare Pages Functions.

## 3. Patients (`/patients`, `/patients/:id`)

- **List:** unified search by name / phone (digit-normalized, handles `+880`/`0` prefixes) / patient code; add/edit via modal. **DOB or age** accepted — age-only patients get a derived DOB; age saves correctly on edit.
- **Patient code:** server-assigned `PT-1xxxxx` (sequence-backed, unique, shown everywhere, encoded in prescription QR).
- **Profile (the core screen):** smart header (identity, code, age/weight, quick stats), quick-add **FAB** (visit, appointment, prescription, treatment, invoice), tabs:
  - **Visits** — visit history with per-visit Billed/Due chips and running due (see §9); add-visit form captures clinical summary + treatments done + payment in one flow; grouped similar planned treatments; summary fields non-editable after save; edit/delete with audit.
  - **Treatments** — plan + history, shown as a timeline (2026-08-04: left rail with a status-colored dot per entry, card-per-treatment, tooth-number chips, price badge — was a table); multi-tooth display; status changes inline; same grouping/duplicate-detection/billing logic as before, presentation only.
  - **Prescriptions** — per-patient list + create (full prescription form embedded).
  - **Files** — profile photo, clinical images, x-rays; upload to Supabase Storage bucket `patient-files`; preview in-browser.
  - **Dental chart** — see §10.
  - Activity timeline of everything that happened to the patient.
- **Medical history:** structured fields (`MedicalHistoryFields`) stored on the patient and pulled into prescriptions.
- Patient name is clickable → profile everywhere it appears.

## 3b. Consultation (`/consultations`)

- Entry point for a walk-in who only came for a paid consultation — no treatment plan, no appointment. Sidebar: Patients → Consultation.
- **Add Consultation:** only name, age, sex required; phone/email/DOB/address/notes are optional (collapsed "More details"); a Consultation Fee is required. Saving creates a `patients` row with `patient_type = 'consultation'` and a `CO-4xxxxx` code, and immediately opens the invoice modal prefilled with a single "Consultation" line item — "mark paid now" collects payment in the same step.
- **Consultation-only patients are hidden from full-patient screens** (Patients list, Dashboard patient count/recent list, Appointments/Billing/Treatments/Lab/Prescriptions* patient pickers, Analytics new-patient charts) until converted. *Prescriptions is the one exception — a consultation-only patient can be prescribed to directly (see §7).
- **Row actions:** Invoice fee (repeat/follow-up consultation), **Convert to patient** (flips `patient_type` to `full` and assigns a fresh `PT-1xxxxx` code — the old CO- code is freed for reuse, see migration 036 below; the row moves to the main Patients list), Write prescription (opens the New Prescription form on `/prescriptions` with this patient already preselected), Edit, Delete — fully audited like Patients.
- **Post-intake prescription prompt:** after the invoice step for a new consultation finishes (saved or skipped), a dialog asks "Write a prescription now?" — one tap opens the New Prescription form with the patient preselected.
- **Consultation-only patients can also be created from Prescriptions:** New Prescription → New Patient has a "Consultation only" checkbox (+ required Consultation Fee field) above the name fields — checking it creates the patient with `patient_type = 'consultation'` instead of `full`; once the prescription saves, the same invoice-with-prefilled-fee flow used here opens automatically.
- **Own, reusable patient-code series (migrations 034–036):** consultation-only patients get `CO-4xxxxx` codes instead of sharing the `PT-1xxxxx` series with full patients — a `BEFORE INSERT` trigger on `patients` (`assign_patient_code()`) picks the generator based on `NEW.patient_type`, replacing the plain column default (which can't see other columns in the same insert). `generate_consultation_code()` (036) computes the next code as `MAX(existing CO- number) + 1` (floor 400000) instead of a fixed sequence, so deleting or converting the highest-numbered consultation frees its number for the next one — the exact number stays reserved as long as *any* patient row still holds it, converted or not. Interior gaps (deleting an older entry while newer ones exist) are deliberately not back-filled. The prescription-QR code pattern (`src/lib/prescriptionQr.ts`) accepts both prefixes.
- **Consultation-only patient profiles show a reduced tab set** until converted: Clinical (Visits/Consultations/Investigations only — Medical and the dental-chart sub-tab hidden), Prescriptions, Appointments, Billing (Pt. Log and treatment-invoicing sub-tab hidden); Overview and Files & Forms tabs are hidden entirely. Back navigates to `/consultations` instead of `/patients` while consultation-only. A "Consultation-only patient" banner with a **Convert to Patient** button appears at the top of the profile — same conversion (incl. fresh PT- code) as the Consultation page's row action, just reachable from inside the profile too. The "New Treatment Plan" quick action and "Upload File" quick-action chip are hidden until conversion, matching the hidden tabs.
- Consultation fee revenue flows into Analytics (Revenue Collected/Outstanding) through the normal invoice/payment pipeline; because the fee has no linked `treatments` row, it lands in Analytics' "Other / Unlinked" Revenue-by-Treatment bucket rather than its own named category.

## 4. Appointments (`/appointments`)

- Day + week calendar views; day dots for load; booking modal supports **existing patient** (search-select) or **inline new patient** (name/age/sex/mobile creates the patient record).
- **Appointment type is Catalog-driven (2026-08-21):** the Type field (New Appointment, Reschedule, the DentOral bridge's confirm step, and the Patient Queue's Clinical Procedure picker) is the same `TreatmentTypeSelect` component used by Treatments — searchable, grouped by Catalog category, always including a non-catalog "Follow-up" entry. No hardcoded fallback list; if the Catalog is empty the only option is Follow-up (Queue additionally offers a blank "General Consultation").
- **Conflict prevention:** same-time/overlap checks at create and reschedule, using local clinic time.
- Statuses (scheduled → completed/cancelled…); **Reschedule** action with its own modal, **including Type and Duration (2026-08-21)** — previously only the date/time could be changed, so a mis-entered duration or procedure required cancelling and rebooking; **completing an appointment prompts to add a visit** for that patient (2026-07-17). A **Reschedule** button on a patient's own Profile → Appts tab (upcoming appointments only, 2026-08-21) opens the same modal without leaving the profile.
- Appointment links propagate: prescriptions/treatments/invoices created from a visit carry `appointment_id`.
- **One-tap WhatsApp reminders (2026-07-20, window widened to 12h same week):** a collapsible "Reminders due today" queue at the top of the page lists Scheduled/Confirmed appointments happening today within the next 12 hours that haven't been reminded yet (`reminder_sent_at IS NULL`). One tap opens `wa.me` with a prefilled message and marks the appointment reminded (with an Undo until the next refresh); patients with no phone show a disabled row instead of disappearing. Rescheduling clears `reminder_sent_at` so the reminder becomes due again in the new window. Deliberately manual-tap, not the official WhatsApp Cloud API — that requires a per-message-billed Meta Business account and a dedicated phone number removed from the WhatsApp phone app; n8n was also considered and rejected since it only orchestrates and still needs the same Cloud API plus separate paid hosting. Message builders live in `src/lib/whatsappMessages.ts` (`CLINIC_NAME` constant, currently "DentOral Dental Care").
- **One-tap WhatsApp reschedule notice (2026-08-03):** after a successful reschedule (`RescheduleModal.tsx`), a prompt always appears offering to send a `wa.me` message with the new date/time (`buildRescheduleMessage`); Skip/close just dismisses it. **If the patient has no phone on file, the Send button shows "No phone" and is disabled instead of the prompt being skipped entirely (fixed 2026-08-08 — it previously closed with zero feedback, which read as the reschedule itself having silently failed).**
- **DentOral booking bridge (`DentoralBookingBridge.tsx`, built outside Claude Code — Anti-Gravity, late July):** pulls pending online booking requests from the separate `dentoralbd.pages.dev` marketing site into a card on this page; matches against existing patients by phone/name (parameterised query, security-reviewed 2026-08-01 — was briefly a PostgREST filter-injection risk from the public booking form's free-text name field), lets staff confirm and schedule directly into `appointments`. **The DentOral-side API has no authentication** (`X-Admin-Password` check removed by user decision, confirmed live) — a plain `GET` on `dentoralbd.pages.dev/api/appointments` returns patient name/phone/age/gender to anyone. Accepted risk, not ClinicMx's to fix.

## 4b. Patient Queue (`/queue`, `/queue-display`, added 2026-08-15)

Waiting-room queue management, ordered by the **appointment schedule**, not check-in order.

- **Population is hybrid:** reception sees today's `Confirmed`/`Scheduled` appointments not yet queued in a side panel (each with an **Add to Queue** action) alongside a patient search + QR scanner for walk-ins. A **Check In** button also appears directly on the Appointments page's action row (next to Confirm) for same-day appointments. Checking in never introduces a new appointment status — `ReminderQueue.tsx`/`TreatmentFollowUpCard.tsx` both filter on `['Scheduled','Confirmed']`, and a new status would silently drop checked-in patients out of both; `queue_entries` is the source of truth for who's actually arrived.
- **Ordering:** a scheduled check-in's position is derived from its appointment time; a walk-in's from arrival time — so a walk-in naturally slots in among appointments whose times have passed. Manual reorder (move up/down) and **Absent** (pushes an entry down a configurable number of places rather than removing it or sending it to the back) are both supported. See DATABASE.md's "Patient Queue" section for the `sort_key` mechanism.
- **Numbering:** each patient gets a fixed daily serial number (never reused/renumbered) plus a live computed "Nth in line" position that stays correct automatically after any insert/reorder/absent-mark.
- **Clinical state machine:** `waiting → serving → on_hold → completed`, with `hold_reason` for local-anaesthesia-settling or X-ray waits — the doctor can call the next patient while someone is on hold, then Resume. Completing a consultation ("Complete & Bill") routes the patient to a front-desk **"Awaiting Billing & Medicine Dispense"** lane (`billing_status`).
- **Doctor floating widget** (`QueueFloatingWidget.tsx`, doctor/admin only, mounted globally in `DashboardLayout`): chamber/room selector, live backlog estimate, Call Next / Hold / Resume / Complete & Bill. Reception's own Call button on `/queue` routes through the same shared action (`callNextPatient()` in `queueApi.ts`) so the two surfaces can never disagree about who's being served.
- **AI-estimation quotes:** "AI" here is a lookup table (`treatment_catalog_items.default_duration_mins`, editable on `/catalog`) plus rolling-clock arithmetic — not a model call. Shown as per-patient ETAs and a per-doctor backlog estimate.
- **Two display boards, deliberately different audiences:**
  - `/queue-display` inside ClinicMx — staff/backroom screen, behind normal login, full operational detail (assigned doctor, room, all statuses). A full-screen route declared as a sibling of the main app shell, not nested inside the sidebar layout.
  - **`dentoralbd.com/queue`** — the actual patient-facing waiting-room board, served from the separate AGY (DentOral) site so ClinicMx stays invisible to patients, mirroring the DentOral booking bridge (§4) in the opposite direction. Reads through a Cloudflare Function pair (`queue-board.ts` in this repo, `queue.js` proxy in AGY) using a shared bridge token — the browser never sees a Supabase credential, and `queue_entries` has zero `anon` grants. An untokened request gets a masked, serial-numbers-only fallback rather than an error. Bengali chime + speech-synthesis announcement (`D5→A5` 2-tone chime, then a spoken announcement) plays when a patient is called; an infotainment carousel (rotating through the site's own patient-education pages) can be shown/hidden from ClinicMx's queue settings.
- **Privacy mode** (`full`/`masked`/`token_only`) is a real server-persisted setting (`queue_settings`, admin-only to change) applied identically to on-screen text and the spoken announcement — not per-browser state that resets on reload, and not a control exposed on the public board itself.
- **Deferred, not built:** the "Ayesha" animated avatar and announcement ticker from the original design exploration; a patient-facing mobile queue tracker (`/q/:token`) — the phone-first "scan a QR, track your position from anywhere" model (closer to how modern virtual-queue products like ScanQueue work) is a natural next step once the board is in real use.

## 5. Treatments (`/treatments` + profile tab)

- Treatment plan entries: type, multi-tooth support (per-tooth rows grouped by `treatment_plan_group_id`), description, cost, status (Planned / In Progress / Completed…), notes.
- **Plan → visit → invoice pipeline:** planned treatments appear in Add Visit (grouped, default In Progress); completing/billing marks `is_invoiced` + `invoice_id`; costs sync between treatment and invoice line (`invoiceSync`).
- **Treatment-plan discount (2026-07-17):** discount applied at plan level flows through Add Visit, invoices, and prints; `original_cost` preserves the pre-discount price.
- Status changeable directly from the history table; edit/delete audited; treatments creatable from prescriptions' Treatment Plan entries (linked via `prescription_id`/`prescription_entry_id`).
- **Treatment type is now catalog-driven (2026-08-10, §9b):** all 4 `treatment_type` dropdown sites (here + the profile tab's Edit Treatment / treatment-plan-item forms) share one `<TreatmentTypeSelect>` component, grouped by category, reading from the new Catalog. A legacy value not in the catalog (old free-text data) still renders as a standalone option rather than blanking out.
- **Treatment Plan card (2026-07-25, Patient Profile → Clinical tab):** a detailed, read-only view of the patient's treatment plan sits between the Treatment Summary tiles and Clinical Consultation History — each treatment's type, tooth, description, status, cost and notes, capped to the 5 most recent inline with a "View full history" link to the Operations tab, plus a Subtotal/Discount/Total summary. A "Show discount breakdown" checkbox (card and print toolbar, default on) hides the Subtotal/Discount lines down to just the Total; a **"Group similar"** checkbox (card and print toolbar, default off, `buildTreatmentPlanRows` in `src/lib/treatmentPlanTotals.ts`) merges treatments identical apart from tooth number into one row with a combined tooth list and summed cost — same idea as the invoice/estimate "Group similar," display-only, plan totals stay computed from the ungrouped list. A **Print / Share** button opens `TreatmentPlanPrint` (`src/components/TreatmentPlanPrint.tsx` + `src/lib/treatmentPlanPdf.ts`), a sibling of the existing `TreatmentEstimatePrint`/estimate PDF but titled "Treatment Plan" (not a quotation), always covering the *full* treatment list regardless of the on-page cap, with Email/WhatsApp share via the shared `sharePdf` utility. Totals come from `computeTreatmentPlanTotals` (`src/lib/treatmentPlanTotals.ts`) — anchored to each treatment's *real, live invoice* total/discount (resolved the same way `invoiceSync.ts` resolves a post-merge invoice) rather than just `treatments.original_cost`/`cost`, so ad-hoc invoice-level discounts, merges, and manually-added invoice line items are reflected accurately; treatments not yet billed fall back to their own plan-level pricing.
- **Status auto-advance (2026-07-25):** billing a treatment (attaching it to an invoice, at any of the app's 4 billing call sites) now automatically bumps it from Planned to In Progress (`advanceTreatmentStatusOnBilling` in `src/lib/invoiceSync.ts`); an invoice reaching fully paid (`recordInvoicePayment` in `src/lib/payments.ts`) now automatically completes every treatment still linked to it. Both are additive, fire-and-forget, and never override a status already at In Progress/Completed/Cancelled — the manual Operations-tab dropdown and Add Visit status picker still work exactly as before. Per-row (each treatment tracks its own `invoice_id`), so a plan billed/paid across multiple visits or invoices reflects mixed progress correctly. Deliberately **not** reversible: if a payment is later edited/deleted and an invoice drops back below fully paid, already-completed treatments stay Completed — only a manual status change (Operations dropdown) can walk that back.

## 6. Lab (`/lab`, migration 030 — not yet applied to prod at the time of this entry)

- **Tracks labwork sent to a dental lab** — crowns, bridges, dentures, ortho appliances, veneers, inlay/onlay, implant prosthesis, post & core, splint/night guard. Nav: Patients → Lab (sidebar, below Treatments).
- **This is accounts payable to the lab vendor, not patient invoicing** — deliberately has no link to `invoices`/`payments`. Payment state is a single "Paid to lab" checkbox (no partial-payment tracking).
- Each record: lab/vendor name, work type, **teeth** (reuses the same `ToothSelector` tooth chart as Treatments/Prescriptions — anatomic Arch-only picker, FDI numbers), shade, material, status (Pending → Sent → Received → Delivered, or Cancelled), dates sent/expected/received, notes.
- **Pricing toggle per record:** Per unit (price × number of teeth/units) or Flat (one price for the whole case); units default to the tooth count but are editable (e.g. one ortho appliance spanning many teeth is still 1 billable unit).
- **Auto-create from Treatments:** saving a treatment whose type matches a lab-related keyword (Crown, Bridge, Denture, Braces/aligner/retainer, Veneer, Implant, etc. — see `LAB_TYPE_KEYWORDS` in `src/lib/labWork.ts`) automatically creates a matching placeholder Lab record (lab name/price left blank, flagged "Needs details"). One record per (treatment-plan × work type) — a 3-tooth crown plan becomes one 3-unit case, not three rows. Fires from all three treatment-save paths (Treatments page, Patient Profile treatment plan, Add Visit); fire-and-forget and failure-isolated — a failure here never blocks or rolls back the treatment save. Idempotent (`UNIQUE(source_plan_group_id, work_type)`), so re-saving the same plan never duplicates. Not hooked on treatment edits — changing a treatment's type after the fact doesn't retroactively create/remove lab rows.
- **List page:** grouped by patient (collapsible, like Treatments), search by patient/vendor/work type, filter chips (All/Unpaid/Overdue), totals bar (Total billed by lab / Paid to lab / Due to lab) that narrows to the current search+filter.
- Fully audited (edit/delete history, restorable) like every other entity.

## 7. Prescriptions (`/prescriptions` + profile tab)

- **Patient selection flow on the Prescriptions page is FROZEN** — search existing or inline-create new patient; do not modify without explicit request. (2026-07-22: the patient list it queries now includes consultation-only patients — a data-source change, not a flow change — so a prescription can be written before a walk-in is converted to a full patient.)
- **Clinical fields (multi-entry):** Chief Complaint, On Examination, Diagnosis, Treatment Plan — each a list of entries with optional per-entry **tooth tags** (FDI selector + quadrant picker for C/C); autocomplete suggestions from prior entries (prescription memory); reusable **section templates** (saved encrypted locally).
  - **Add from odontogram (2026-09-04, On Examination — both the Prescriptions page and the Patient Profile → New Prescription form):** a checkbox above On Examination (shown once a patient is selected) that pulls the patient's charted findings (`dental_records`) in as entries — one per condition, phrased clinically with the teeth tagged (Caries → 11,12,13; Filling → 46; Root canal treated, Crown, Bridge, Implant, Missing tooth, Extracted, Impacted; healthy skipped). Toggle: ticking appends the findings, unticking removes only the still-**unedited** auto-added ones (edited entries detach and stay); switching patient resets it. Grouping/wording is `buildExaminationEntriesFromDentalRecords` in `src/lib/toothConditions.ts`; the toggle logic lives in `Prescriptions.tsx` (patient-selection flow untouched). The generated entries are normal `ClinicalEntry`s, so they flow to print and downstream tooth suggestions like any other.
- **Medications:** DrugPicker over the BD drug database — search by brand/generic/company, category-grouped dropdown with color chips; picking a drug prefills dosage/frequency/duration/instructions/route for the patient's **age tier** (infant/child/adult); syrup/suspension/drops forms with **weight-based ml-dose calculator** (mg/kg → ml, using patient weight; weight snapshot stored on the prescription). AI dose features are prefills only — dentist confirms. **Custom medications (2026-08-10, §9b)** added via the Catalog merge into the same search/dropdown, alongside the built-in directory.
- **Investigations:** list with templates.
- **Compose-form actions (2026-08-10):** the compose/edit modal footer has **Cancel, Preview, Print, Save** (both here and the Patient Profile embedded flow) — Preview opens the print view on the unsaved draft with no DB write; Print saves then opens the print view automatically on the saved row; Save replaces the old "Issue/Update Prescription" button, same underlying save pipeline.
- **Output:** print layout matching the physical pad. **"With header" mode (redesigned 2026-08-10)** shows the clinic's real doctor roster side-by-side (Admin → Prescription Doctors, §13) plus the center clinic block (logo/name/address/phone, unchanged), Bengali route/dosage/frequency/duration/instructions, footer with Rx ID pinned to page bottom, **QR code**. A new **"Blank" mode** omits all doctor/clinic branding (for printing directly onto the clinic's real pre-printed pad) while keeping the QR/Rx-ID footer and patient info — chosen mode persists per-device. Share as real PDF via Email/WhatsApp (desktop-width capture, hidden in Blank mode); Bangla text and QR verified in shared PDFs.
- List groups prescriptions by patient; searchable by name/code/phone.

## 9b. Catalog (`/catalog`, added 2026-08-10)

- Lets the clinic manage their own **categories** and add **procedures**/**custom medications** going forward, instead of being limited to hardcoded lists. Nav: Patients → Catalog (sidebar, below Verify Offline Edits).
- **Procedures & Treatments section:** category manager (add/rename/delete) + procedure list (name, category, optional default fee) — backs the shared `<TreatmentTypeSelect>` used everywhere `treatment_type` is picked (§5).
- **Medications section:** category manager (medication categories) + custom medication list (brand, generic, category, dosage/frequency/duration/instructions/route defaults) — merged into `DrugPicker`'s search/dropdown alongside the built-in BD drug directory, which stays untouched.
- Page-gated like any other page (`hasPageAccess('catalog')`, toggleable per doctor/operator account in Admin → Users), not admin-only.

## 8. Billing (`/billing`)

- **Invoice creation:** from treatments (select uninvoiced work), from templates, or ad-hoc items; fixed/percent discount, tax, notes, payment terms; invoice number from settings counter; Basic vs Advanced types (`AdvancedInvoiceModal`).
- **Payments:** partial payments with method (cash/card/bKash…), recorded via `recordInvoicePayment` (single source of truth for paid/status); pay-against-invoice picker; payment history panel; payment receipts printable.
- **Dynamic Bangla QR payment (2026-08-31, migration 066):** "Pay via Bangla QR" in the Record Payment modal (all entry points — Billing, Patient Profile, pay-invoice picker) and as a payment option when creating an invoice (`InvoiceModal`, requires the invoice to be created online first). Generates a per-transaction **dynamic** EMVCo Bangla QR (`src/lib/banglaQr.ts` — TLV parse/encode, CRC-16/CCITT-FALSE, round-trip validation gate) from the clinic's static merchant QR (Billing → Invoice Settings → Bangla QR Merchant Setup; seeded to the real Pubali Bank PLC merchant, editable/re-scannable there), with the exact amount and invoice number injected. Verification is either: paste the bank/MFS confirmation SMS (`src/lib/smsParsers.ts` — bKash/Nagad/Pubali Bank/generic parsers, auto-extracts amount + TrxID, flags amount mismatches) or manual TrxID entry by staff. Recorded payments carry `gateway_provider`/`gateway_reference`/`gateway_transaction_id`/`gateway_status` (`sms_verified` or `manual_verified`); `gateway_reference` is uniqueness-guarded so the same SMS/TrxID can't be recorded twice. Success screen offers a WhatsApp thank-you and (from the Record Payment modal) opens the existing payment receipt print view. The Record Payment modal also has a lightweight "Paste Merchant Payment SMS to Auto-Fill" accordion for the *standard* (non-QR) payment form — same parsers, just fills Amount/Method/Notes rather than gateway-tracking the payment. Offline: QR collection needs a live connection (a QR can't be generated/verified against an invoice id that hasn't synced), so it's unavailable while offline and creating an invoice offline with QR selected just queues the invoice without collecting payment.
- **Payment WhatsApp thank-you (2026-07-20; running total added 2026-08-03):** right after a payment is recorded (Record Payment modal, immediate payment on invoice creation, or the Patient Profile visit-form payment) a one-tap prompt offers to send a cordial `wa.me` thank-you message stating the amount paid, when the patient has a phone on file; Skip/close just dismisses it (nothing persisted). Not shown for the Billing page's bulk "mark selected invoices paid" action. When the invoice already had earlier installments, the message also states the running total paid on that invoice (`buildPaymentThanksMessage`, `src/lib/whatsappMessages.ts`) — omitted on a first/only payment to avoid repeating the same figure twice.
- **Post-visit "Schedule next appointment?" prompt (2026-08-03):** after saving a New Visit (Patient Profile), once any payment-thanks prompt has been sent/skipped (or immediately, if no payment was recorded), a confirmation dialog offers to book the patient's next appointment right away. "Schedule Now" opens the existing `AppointmentModal` pre-filled for that patient (`defaultPatientId`, same modal already wired to the page's "New Appointment" button); "Later" just dismisses.
- **Invoice merging:** combine invoices into a survivor (`merged_into_invoice_id`); merged ones hidden from actives but auditable.
- **Prints/shares:** Detailed and Receipt formats (optional grouping, distinct filenames), single/combined/list printing, combined patient statements (grouped, page-break safe), embedded clinic logo, PDF share via Email/WhatsApp.
- **Page UX:** live search incl. patients with no invoices yet; recently-worked patients; per-patient color-accented cards; timeline panel per invoice (`invoice_history`); financial reports panel (`FinancialReportsPanel`); treatment estimates printable pre-invoice (`TreatmentEstimatePrint`).
- **Pt. Log (2026-07-20):** a "Pt. Log" sub-section under the patient profile's Billing tab (`PatientBillingLogPanel`) — a read-only, patient-scoped feed of invoice/payment creates, edits, and deletes (`activity_log` filtered to `entity_type in (invoice, payment)`), each row showing what changed and who did it (`formatAuditActor`). Invoice edits now snapshot to `edit_history` via `logEdit` (previously `activity_log`-only, not revertible); payment deletes now also write to `activity_log` (previously only an `invoice_history` event). Invoice deletes note in their log details when payments were also lost to the `payments.invoice_id` cascade.

## 9. Inventory (`/inventory`)

Categories Materials / Instruments / Others; quantity+unit, low-stock threshold with warnings, supplier, cost, expiry date; stock movements in/out logged (`inventory_movements`). Auto-deduction from treatments is backlog (M6), not implemented.

## 10. Visit history & running dues

Each visit shows what was **billed** that day and what was **paid**, including payments that only pay down an older invoice (visit links to that invoice too); the chip shows the **per-visit running due** (due as of that visit), not the invoice's final due. This area had many subtle fixes (2026-07-15) — treat the displayed numbers as carefully specified; verify against payment history when changing anything.

**Previous Visits panel in Add Visit (2026-08-17):** the Add Visit modal opens with a read-only, collapsible "Previous Visits" panel above Chief Complaint — same CC/O/E/Diagnosis/Plan pills, Treatment Done chips, Payment chips, and doctor notes as the Visit History card, plus a "Also recorded that day" line listing same-calendar-day treatments/prescriptions (a display-only heuristic — visits have no DB link to either). Panel opens with the most recent visit pre-expanded; others collapse to a one-line date + teaser. Scoped by default to the patient's **current treatment episode** (`currentPlanStart()` in `PatientProfile.tsx` — the union of every still-open treatment group and whichever group was worked on most recently, using `treatment_plan_group_id`/`prescription_entry_id` as the "same plan" key, each ad-hoc treatment as its own singleton group, open groups untouched for 180+ days ignored once a newer group exists), with a "Show earlier visits (N)" toggle to reveal the full history — so a patient who finished one plan and started a new one later doesn't have to scroll past the old plan to see the new one's. Purely additive/read-only: no change to `handleVisitSubmit` or the Visit History section itself.

## 11. Dental chart (patient profile tab) — Anatomic Odontogram (2026-09-04)

**Anatomical Odontogram** (`src/components/dental/AnatomicDentalChart.tsx`, ported from the "v2 by AGY" sandbox) — biologically-accurate crown/root SVG teeth (all 32 permanent morphologies in `AnatomicalToothData.ts`, primary teeth mapped to their permanent counterpart shape via `getEquivalentPermanentTooth`), replacing the old flat-box `ArchDentalChart` in the Clinical tab.
- **Two views:** *Panoramic (Anatomic)* — straight rows (4-tier permanent+primary layout in mixed dentition) with a per-tooth condition status dot under each FDI label; *Arch (Occlusal)* — the curved elliptical arch. Toggle in the header.
- **Age-aware dentition (unchanged logic):** driven by the existing `getPatientAge`/`getDentitionType` (`<5` deciduous 20 primary teeth, `5–14` mixed permanent+primary, `>14`/unknown permanent 32 teeth).
- **10 conditions** with color-coding (Healthy, Decayed, Filled, Root Canal, Crown, Bridge, Missing, Implant, Extracted, Impacted) — RCT draws a gutta-percha canal line, Implant draws screw threads, Missing/Extracted render a slate silhouette. Stored as human-readable labels in `dental_records.condition`; legacy `"Cavity"` reads as Decayed (`src/lib/toothConditions.ts`). Surfaces (M/O/D/B/L) are **not** recorded (descoped).
- **Timeline & History Scrubber** — numbered milestone-per-date nodes + a Live node; selecting a past date shows that date's reconstructed mouth state (`computeChartSnapshot`, last-write-per-tooth ≤ date) with a read-only amber "Historical Chart Snapshot" banner + Return to Live. A collapsible **Tooth Procedure & Changes Log** lists every dated change with a per-tooth filter and "View Snapshot" jump. Backed by the append-only `dental_record_history` table (DATABASE.md, migration 068); each save appends a dated row (clinician-picked procedure date + doctor name). **Populates only after migration 068 is applied.**
- Per-tooth edit modal: condition + procedure date + notes, plus a **Revert to Healthy** button; disabled while viewing a historical snapshot. Tooth selection elsewhere (treatments, prescription tooth tags, lab) still flows through `ToothSelector`, now rendering the same anatomic teeth in **Arch-only** mode (`src/components/dental/AnatomicArch.tsx`).
- **Rapid-input tools (2026-09-04):** (a) **Quick-Apply brush** — tap a legend condition pill to activate it as a brush (pill shows an "Active" ring + a banner), then one-tap teeth to apply with no modal; tapping the same tooth again undoes it; `Esc` exits. (b) **Undo** — a toolbar button and `Ctrl/Cmd+Z` pop the last change made this session. (c) **Multi-Select batch mode** — a toolbar toggle; select teeth (cyan halo) or use the Upper Arch / Lower Arch / All Molars / Clear presets, then **Apply** one condition to all selected, or **Revert to Healthy**, in one batch. Undo and 2nd-tap/undo **delete the newest `dental_record_history` row** for the affected teeth and restore the prior recorded state (or clear back to healthy) — the timeline stays clean, with no trailing "reverted" entries. Batch/undo are `batchUpdateTeeth`/`undoTeeth` in `PatientProfile.tsx`; the chart drives them via `onBatchUpdateTeeth`/`onUndoTeeth`. Editing tools are hidden while viewing a historical snapshot.
- **Treatment-plan → chart auto-sync (2026-09-04):** when a **tooth-linked** treatment moves to **In Progress** or **Completed**, the chart's condition for that tooth auto-updates to reflect the procedure and a dated timeline row is appended. The write is `src/lib/toothChartSync.ts` (`syncToothChartFromTreatment[s]`), hooked into every treatment status-change / group-status / edit path in `PatientProfile.tsx` and `Treatments.tsx`. Idempotent (skips if the tooth is already that condition, so In Progress→Completed doesn't double-write) and failure-isolated (never blocks the status change). Rows are **untagged** (not linked to the treatment id — user decision; no `dental_record_history` schema change); the auto-set carries a `"Auto-synced from treatment: <type>"` note visible in the history log. Doctors can still manually override any tooth afterward. `Planned`/`Cancelled` never touch the chart.
  - **Catalog-driven mapping (2026-09-04, migration 069):** the resulting condition is resolved per procedure from the **Catalog** (`/catalog` → Procedures → *Tooth-chart result* dropdown on each item), stored in `treatment_catalog_items.chart_condition`. Precedence: an explicit catalog mapping wins; the `"No chart change"` option (sentinel `'__none__'`) suppresses any change; otherwise (blank/"Auto", or a legacy free-text type not in the catalog) it falls back to the keyword map `treatmentTypeToConditionLabel` in `src/lib/toothConditions.ts` (Extraction→Extracted, Root Canal/RCT/Endo→Root Canal, Crown/Cap/Onlay/Inlay→Crown, Bridge/FPD/Abutment→Bridge, Implant→Implant, Filling/Restoration/Composite/Amalgam/GIC/Sealant→Filled). So editing a procedure's chart result in the Catalog changes what future In Progress/Completed transitions of that treatment type do to the chart.

## 12. QR search (`/qr-search`)

Camera scanner (html5-qrcode) reads the QR printed on prescriptions → jumps straight to the patient. Manual code entry fallback.

## 13. Doctor profile & Admin zone (`/doctor-profile`, `/admin`)

- **Profile:** doctor name, multi-degree list, registration, chamber/clinic details, logo upload — feeds the Invoice letterhead and (as a fallback) the prescription letterhead; syncs across devices (Supabase singleton) with encrypted local mirror for offline.
- **Admin zone (admin only):** **Users** tab (create/edit doctor/operator accounts, activate/deactivate, per-user permissions incl. page toggles); **Network Access** tab (approve/deny/remove per-user login IPs, pending-count badge — see §1); **Activity Log** tab (who did what, when, filterable); **Clinic Hours** tab; **Prescription Doctors** tab (2026-08-10 — add/edit/reorder/deactivate the doctors shown on the prescription letterhead, a genuinely multi-row roster separate from the singleton Profile above; §7); **restore/revert center** — deleted records (from `delete_history`) restorable; edits revertible (from `edit_history`); actions labeled with the responsible role/user.
- **My Leave tab (every non-admin account, 2026-08-08):** every `doctor`/`operator` account gets this tab in their Zone regardless of any other permission — submit a leave request (type/dates/reason), see their own requests with status and any admin decision note, cancel a still-pending one. Independent of `can_access_staff_analytics`/HR & Payroll (§15c) — self-service leave and admin leave review are two different surfaces over the same `staff_leaves` table (DATABASE.md, migration 052). See `src/components/hr/MyLeaveTab.tsx`.
  - **Leave balance tiles (2026-08-08, migration 053):** Total Leave / Used (this year) / Leave Left, sourced from the `my_leave_balance()` RPC — Total is the admin-set `staff.leave_quota_days` (default 20, editable per staff member in the Staff & Salary roster, §15c-iii), Used sums the inclusive day-count of every **Approved** leave request of **any type** with a start date in the current calendar year (resets each Jan 1), Left is Total − Used, floored at 0. Silently hidden (not an error banner) when the signed-in account isn't linked to a `staff` roster row, or the RPC isn't available yet (migration not applied) — a missing balance never blocks submitting/viewing/cancelling requests.

## 13b. Integrity (`/admin?tab=integrity`, admin run/review + doctor read-only, added 2026-08-19)

Read-only data-integrity scanner (migration 064, `run_integrity_scan()` RPC) — finds problems in the live database before they surface as a broken invoice, a lost visit, or a doctor's payout analytics silently showing nothing. **Never writes to any clinical or financial table** — the only table it writes to is its own `integrity_findings`, plus an `app_notifications` entry when a scan finds a new critical issue.

- **What it checks:** referential orphans (a visit/treatment/invoice/prescription/appointment/payment pointing at a row that no longer exists); money mismatches (an invoice's `paid_amount` disagreeing with the actual sum of its `payments` rows — the headline check, since a known legacy fallback path in `recordInvoicePayment()` can update the balance without writing a ledger row; overpayment; negative amounts); an invoice's stored total recomputed from its line items and compared against what's saved; treatment↔invoice sync drift (mirrors the dual-linkage invariant in `invoiceSync.ts` — `is_invoiced` flagged with no live link, a link that disagrees with what an invoice's items actually reference, a treatment still pointing at an invoice that's since been merged, invoice status disagreeing with its own paid/total, or a treatment's `completed_at` disagreeing with its status); doctor attribution (a treatment's `doctor_name` matching no active staff account — the exact failure mode that zeroed a doctor's payout analytics on 2026-08-02); audit-trail gaps (an edit/delete history row pointing at a deleted entity, or an unrecognized `entity_type`); and a handful of structural checks (more than one `doctor_profiles` row, a patient code whose format disagrees with its `patient_type`, missing patient codes, the `patient_code_seq` drift class that caused the 2026-07-22 incident). Every money/sync check excludes merged invoices, which legitimately carry summed totals.
- **Trigger — three ways, all calling the same `run_integrity_scan()`.** Admin taps **Run scan** in the tab (`functions/api/integrity-scan.ts`, service_role, `requireAdminToken`-gated); locally after a risky change or migration, `node scripts/integrity/scan.mjs` (add `--dry-run` to preview without writing — a true rollback via the RPC's own `p_dry_run` parameter, not a simulation); and, once deployed, nightly at 3:30 AM BDT via a standalone Cloudflare Worker with a Cron Trigger (`workers/integrity-cron/`, 30 minutes after the nightly backup slot so the two never contend). The cron worker is a genuinely separate Cloudflare deploy from the main Pages project — Pages projects don't expose Cron Triggers, only Workers do — see that folder's `index.ts` header for setup/manual-test steps. Originally shipped manual-only (GitHub Actions' documented unreliability on this remote made a scheduled job the wrong default at first); added same day after the scan itself caught a live, actively-recurring bug (`patient_code_seq` drifting back into the test-code range mid-session, twice) that made the case for not relying on someone remembering to run it.
- **Findings list:** filterable by severity (critical/warning/info) and show-resolved; each row shows a plain-language description, a link to the affected entity where one exists, and (admin only) a **Mark reviewed** action. Re-running the scan updates `last_seen_at` on a still-present finding without resetting `reviewed` — unless the underlying values actually changed, in which case it reopens. A finding a scan no longer reproduces gets `resolved_at` set (not deleted) and drops out of the default view.
- **Access:** admin can run scans and mark reviewed; doctor sees the same list read-only (enforced at the database layer too, not just the UI — see DATABASE.md §3); operator sees neither the tab nor the underlying tables.
- **Notifications:** a scan finding one or more `critical` findings posts one `app_notifications` entry (deduped by title within 24h, same pattern as the existing backup reminders) linking straight to the tab — picked up by the existing `NotificationBell` with no additional wiring.

## 14. Backup & Restore (`/backup`, admin + operator — opened to operator 2026-08-03, was admin-only)

Device backup download (JSON, encrypted option), dry-run-first restore, restore-from-Drive picker, one-tap **Upload to Google Drive**, backup reminders (banner + notification center, visible to every role since 2026-08-03), auto-prune of old device backups. Complements the invisible nightly cloud backup ([CLINICMX.md](CLINICMX.md) §11). Doctor accounts still don't get the page/nav link/Dashboard tile, but do see backup notifications now that `audience` is unrestricted (see §16) — an accepted minor inconsistency, chosen for simplicity over adding multi-role audience support.

**Operator scope is Upload-only** (narrowed same day, on reflection): operator sees the page, the encryption/passphrase settings, and the schedule config, and can **Upload to Google Drive** — but "Download backup" (local export) and the whole "Restore from a backup file" card (can overwrite live data) are admin-only, hidden entirely rather than disabled. Gated client-side in `BackupRestore.tsx` (`appRole === 'admin'`), and matched at the API layer (see API.md §2): `download-backup.ts` (returns actual backup content) is back to admin-only, while `upload-backup.ts` and `list-backups.ts` (filenames/dates only, feeds the Dashboard tile) stay open to any staff session.

## 15. Clinic Analytics (`/analytics`, admin-only)

Charts (recharts) over live data with a **6M / 12M / All** range selector (client-side filter, no refetch) and Refresh. Strictly read-only. Metric definitions:

- **Daily Earnings calendar** (above Monthly Revenue): month grid, own prev/next month navigation, independent of the 6M/12M/All selector. Each day shows Σ `payments.amount` for that `payment_date` — actual cash received that day, **not** the invoice-date basis the rest of this section uses, so day totals need not tie back to the month bar below. Payments on Merged invoices excluded. Tapping a day with earnings opens a breakdown **by patient** — who paid and how much (`×n` when someone paid more than once that day), names linking to their profile. Deliberately per-patient rather than per-treatment: a treatment-plan invoice mixes procedure types, so splitting a day's cash across types would be misleading. Rows sum to exactly that day's total.
- **Revenue:** Collected = Σ `paid_amount`, Outstanding = Σ max(`total_amount` − `paid_amount`, 0), non-Merged invoices grouped by `created_at` month (matches Dashboard/FinancialReportsPanel). **Revenue by Treatment** attributes each invoice's paid amount across its line items proportionally to line totals, mapping items to `treatment_type` via `source_treatment_id(s)`; manually added items (no treatment link) show as **"Other / Unlinked"** — buckets always sum to total collected. Top Revenue Sources = patients ranked by payments collected (names link to profiles).
- **Patients:** new registrations per month + cumulative growth; **Returning vs New** by appointments (Cancelled excluded) — a patient is *New* in the month of their first-ever appointment, *Returning* in any later month they visit.
- **Treatments:** procedure counts and average recorded cost per type (freeform `treatment_type` grouped case-insensitively, top 10 + Others; zero-cost rows excluded from averages), and a Planned → In Progress → Completed pipeline with completion rate (Cancelled shown separately).

Gated like `/backup`: page self-redirects non-admins to `/dashboard`; sidebar link renders only for admin.

**Consultation-only patients excluded from new-patient counts, but not from revenue attribution (2026-07-22):** `Analytics.tsx` fetches all patients (unfiltered) so revenue features that need a name — Top Revenue Sources, the Daily Earnings calendar's per-patient breakdown — can still resolve a consultation-only patient's name instead of showing "Unknown Patient" (a bug in the initial cut: the fetch was filtered at the query level, breaking name lookups for anyone who'd paid a consultation fee but not converted). Only the "New Patients" stat tile and the new-registrations/returning-vs-new charts use a separately filtered `fullPatients` list (`patient_type !== 'consultation'`) so walk-ins who haven't converted don't inflate those. Consultation-fee invoices/payments are never filtered, so the fee always counts in Revenue Collected/Outstanding — see §3b.

## 15b. Financial Analysis (`/financial-analysis`, rebuilt 2026-08-01, Statement/Detailed + Resolve action + per-doctor default % added 2026-08-02; narrowed to Doctor Analytics only 2026-08-08; Clinic Expenses tab added 2026-08-11)

Sidebar entry replaces admin's old direct "Doctor Analytics" link, at the same position (below
Analytics). Two in-page tabs: **Doctor Analytics & Payouts** (gated on `canAccessDoctorAnalytics()` —
admin, or anyone granted `can_access_doctor_analytics`) and **Clinic Expenses** (admin-only, plain
`getAppRole() === 'admin'`, no permission-flag override — see §15b-vi). The page itself self-redirects
to `/dashboard` only if the user has neither gate. Doctors keep their own separate, unrelated sidebar
entry — "Doctor Analytics", self-locked to their own work — untouched by any of this. **Staff Analytics
used to be a second tab here; it moved into the admin-only HR & Payroll page 2026-08-08 (§15c)** — a
non-admin holding only `can_access_staff_analytics` no longer gets a Financial Analysis sidebar link
(it would have redirected them straight back out).

### 15b-i. Doctor Analytics — two-part payout ledger

Replaced an earlier version that computed each treatment's `Total Paid` as its cost × the parent
invoice's payment ratio — produced fractional, never-actually-paid amounts (e.g. BDT 3,333.33
against a still-incomplete BDT 4,000 crown). Now two independent logs (Work Done, Collections)
feeding one shared `patientGroups` computation, rendered as two switchable views (**Statement** /
**Detailed** toggle, same tab pattern as the Doctor/Staff toggle one level up) so the two layouts can
never disagree on a number — both are exports of the same underlying data, not two separate
calculations:

- **Work Done** — one row per treatment (Date, Patient, Ref By, Source of Income, Amount, Note), no
  money columns. Answers "what was performed", nothing else. Filtered to **Completed + In Progress**
  only (Planned/Cancelled excluded — chair time was spent on in-progress work, nothing was spent on
  work not yet started or abandoned), sorted by date ascending. Bucketed by `completed_at` (falling
  back to `created_at` for treatments not yet Completed — see DATABASE.md).
- **Collections** — one row per real `payments` row (Date, Patient, Ref By, Total Paid, TxC, Net A,
  %, Clinic Income, Dr. Income), sorted by date ascending. `Total Paid` is always a real payment
  amount, never a derived slice. Attribution: `payment → invoice → its linked treatments →
  doctor_name`. Exactly one distinct doctor across an invoice's treatments → the whole payment is
  theirs; TxC is that payment's pro-rata share of the invoice's total lab cost; `%` is the
  cost-weighted average `doctor_share_pct` across the invoice's treatments (default **30%**,
  migration 044, or the doctor's own default — see below).
- **Statement view** (default) — one table, grouped per patient (a reference statement from another
  clinic drove this design: work rows and payments for the same patient sum to one line, not two
  disconnected sections). A patient group renders if they have either work rows or collections in
  the period — a payment with no matching work this month, or work not yet paid, both still show,
  with the empty side blank. Group `%` is derived from the real money (`drIncome / netA`), not
  averaged from the underlying rows.
- **Detailed view** — the original two separate tables (Work Done, then Collections), with
  Collections now also grouped per patient with a subtotal row instead of listing repeat payments
  from the same patient as scattered, disconnected rows.
- **Needs Attention** panel (only shown in the unscoped "All Doctors" admin view — never inside a
  specific/self-locked doctor's view, since these payments don't have one confirmed doctor):
  payments on invoices with **two or more distinct doctors** across their treatments, payments on
  invoices with **no linked treatments**, and standing **reconciliation gaps** (`invoice.paid_amount`
  with no matching `payments` row on file — a legacy fallback in `recordInvoicePayment` can update
  the invoice total without writing a ledger row). Never silently folded into any doctor's total.
  Each row carries a typed `reasonCode` (`unknown_invoice` / `no_linked_treatments` /
  `no_doctor_assigned` / `mixed_doctors` / `reconciliation_gap`) driving which of the below applies.
  - **Resolve action** (admin only, `no_linked_treatments` rows): an inline "Resolve" control picks
    a doctor + share % and creates one synthetic `treatments` row (`treatment_type: 'Other / Manual
    Charge'`, `status: 'Completed'`, `cost` = the payment amount) to retroactively attribute the
    payment through the existing `payment → invoice → treatments → doctor_name` chain, rather than
    building a second, parallel attribution mechanism. The row is visibly marked in its notes as
    auto-created for this purpose.
- **Bulk-assign default doctor** (admin only, inside Needs Attention): picks one doctor, applies to
  every treatment currently missing `doctor_name` in one action. Only fills blanks — never
  overwrites an existing assignment (even a wrong one), never touches the mixed-doctor or
  no-linked-treatment flags above (those need per-invoice judgment). Each affected row is
  individually revertible afterward via the normal edit-history/Admin restore flow, though the bulk
  action itself has no single undo. **Picks whatever string the admin selects from the dropdown** —
  if that string doesn't exactly match the doctor's own `app_users.full_name`, their self-locked view
  will show nothing for the newly-assigned rows (see DATABASE.md's `treatments.doctor_name` risk
  note); keep the account name and the bulk-assign selection in sync.
- **Doctor Share % (admin-only field)** and the **doctor picker** in New Treatment Plan / Edit
  Treatment: a logged-in `doctor` role sees the doctor field locked to themselves (can't reassign a
  treatment to a colleague); `operator` sees an open picker with **no default** (never silently
  attributed to the operator's own name — an earlier bug); `admin` sees the full picker, sourced from
  `app_users` roster (role=doctor only — role=admin/operator accounts are never a valid "who
  performed this procedure" answer other than the current session's own self-attribution, fixed
  2026-08-02, was pulling in every admin account as a fake doctor option). Doctor Share % itself is
  hidden from non-admins entirely (`can_set_doctor_share_pct` permission overrides this) — it's an
  admin-set figure that only feeds the month-end payout calculation above, not something a
  doctor/operator needs to see per treatment. Field labeled "Attending Doctor".
  - **Per-doctor default share % (2026-08-02):** Admin → Users → Add/Edit Account gains a "Default
    Doctor Share %" field for doctor-role accounts (`app_users.default_share_pct`, migration 048).
    When set, New Treatment Plan pre-fills that doctor's own default the moment they're picked in the
    Attending Doctor dropdown (or immediately for a self-locked doctor session, via an effect since
    there's no dropdown to trigger on) — still editable per item, same as before. Doctors with no
    default set keep the flat 30% clinic default, unchanged.
- Export: CSV and PDF, both following whichever view (Statement/Detailed) is currently active on
  screen, so the downloaded file always matches what was visible when it was generated.

### 15b-vi. Clinic Expenses tab (admin-only, added 2026-08-11, migration 059; Recurring Expenses sub-menu added 2026-08-11, migration 062)

Fulfills the "Expense tracking / cashbook alongside income reports" line from PRODUCT-ROADMAP.md.
Rolls up four cash-basis expense lines for a selected month into a Total Expenses figure and a
Profit/Loss vs. Total Collected — self-fetches its own copy of `invoices`/`treatments`/`patients`/
`payments`/`lab_work`/`staff`/`staff_salary_payments`/`clinic_expenses` independently of the Doctor
Analytics tab (same "each tab re-fetches" precedent as HR & Payroll's Overview vs. Staff & Salary
tabs — kept `DoctorAnalytics.tsx` untouched rather than lifting its fetch into a shared parent).

- **Doctor Payouts** — `calculateDoctorFinancialSummary(..., 'ALL', periodMonth).totalDrIncome`
  (`src/lib/doctorAnalytics.ts`), the same cash-basis payout figure the Doctor Analytics tab shows.
- **Staff Salary** — `calculateStaffSalarySummary(..., 'ALL', periodMonth).totalPaid`
  (`src/lib/staff.ts`) — actually paid to staff this month, not the full amount owed.
- **Lab Charges** — sum of `lab_work` rows with `is_paid = true` (excludes `Cancelled`), cost computed
  as `pricing_mode === 'flat' ? flat_price : unit_price * unit_count`, bucketed by `date_sent`
  (falling back to `created_at` — `lab_work` has no "date paid" column, see 030_lab_work.sql).
- **Other Expenses** — new `clinic_expenses` table (migration 059), admin-only RLS via
  `is_app_admin()`. Ad-hoc entries with a fixed category (`Instrument Purchase`, `Material Purchase`,
  `Machine Repair`, `Other`), description, amount, date, optional vendor/notes. Full CRUD with a
  category-filter pill row, add/edit modal, delete confirmation; writes go through
  `src/lib/clinicExpenses.ts` and log to `activity_log` via `logActivity()` (same lighter audit
  pattern as `staff.ts` — not part of the tracked-entity delete/edit-history revert system).
- **Total Collected** — raw `sum(payments.amount)` for the month (`calculateTotalCollected`,
  bucketed by `payment_date` falling back to `created_at`). Deliberately NOT
  `DoctorFinancialSummary.totalPaid`, which silently excludes payments that can't be attributed to
  exactly one doctor (see §15b-i's flaggedRows) — using it here would understate real revenue.
- **Profit/Loss** = Total Collected − (Doctor Payouts + Staff Salary + Lab Charges + Other Expenses).
- Breakdown shown as one horizontal bar chart (`ChartCard`/`CHART_COLORS`, same style as HR &
  Payroll's Payroll Summary chart) plus KPI tiles for each line and a Profit/Loss hero tile that
  flips green/red on sign. CSV export (`exportClinicExpensesCSV`) — no PDF statement yet.
- No new route, no new sidebar entry — this stays a tab inside `/financial-analysis`. No new
  grantable permission flag; admin-only is a plain role check, matching HR & Payroll's gate rather
  than the more permissive `canAccessDoctorAnalytics()` flag that gates the sibling tab.

#### Recurring Expenses sub-menu (inner tab, added 2026-08-11, migration 062)

A second in-page tab nested inside Clinic Expenses (`Other Expenses` / `Recurring Expenses`, same
`useState` + underline-tab pattern one level up) for monthly-repeating bills — rent, electricity,
subscriptions — that would otherwise mean re-entering the same one-off expense every month.

- New `recurring_expenses` table (migration 062), admin-only RLS, same `is_app_admin()` pattern as
  `clinic_expenses`. A row is a **template**, not an expense: `category` (`Rent`, `Utilities`,
  `Subscription`, `Other` — a separate fixed list from Other Expenses' four categories, since rent
  isn't an instrument purchase), `description`, `amount`/month, optional `vendor`/`notes`,
  `is_active` (soft-disable without losing history — matches `staff.is_active`).
- **"Generate `<month>`"** button (`generateRecurringExpensesForMonth`, `src/lib/recurringExpenses.ts`)
  creates one real `clinic_expenses` row per active template, dated the 1st of the selected month,
  tagged via a new `clinic_expenses.recurring_expense_id` column — from that point on it's an
  ordinary `clinic_expenses` row (editable/deletable in the Other Expenses tab like any other, shown
  there with a "Recurring" badge), so the recurring and one-off ledgers stay unified instead of
  duplicating totals logic. Idempotent: `UNIQUE (recurring_expense_id, expense_date)` on
  `clinic_expenses` + an `upsert(..., { ignoreDuplicates: true })` means re-clicking "Generate" for a
  month that's already been generated is a safe no-op — directly mirrors `staff.ts`'s
  `ensureMonthRows()`/`staff_salary_payments` `UNIQUE(staff_id, period_month)` pattern.
- `clinic_expenses.category`'s CHECK constraint was widened (migration 062) to accept both the
  one-off categories and the three recurring-only ones, so a generated row's category always
  validates. Deleting a recurring template (`ON DELETE SET NULL`) unlinks — but does not delete —
  any `clinic_expenses` rows already generated from it; they remain as plain one-off entries.
- Full CRUD (`src/lib/recurringExpenses.ts`, same shape as `clinicExpenses.ts`) — add/edit modal,
  active/inactive toggle, delete with confirmation. Deliberately monthly-only (no
  weekly/quarterly/yearly frequency) and manual generation only (no automatic month-start
  generation) — matches how Staff Salary's own "Generate `<month>`" step already works, and avoids
  silently counting a recurring bill before anyone's reviewed/adjusted that month's amount.

## 15c. HR & Payroll (`/hr-payroll`, admin-only, added 2026-08-08)

Sidebar entry sits directly below Financial Analysis, admin section only (`getAppRole() ===
'admin'` — self-redirects to `/dashboard` for anyone else, no permission-flag override, unlike
Financial Analysis). Three in-page tabs: Overview, Leave Requests, Staff & Salary.

### 15c-i. Overview tab

Real figures only, computed by `getHRMetrics()` (`src/lib/hr.ts`) from data already fetched for the
other two tabs — no extra round-trips, and it reuses `calculateStaffSalarySummary()`
(`src/lib/staff.ts`, the same function Staff & Salary's own statement uses) so these numbers can
never drift from what that tab shows for the same month:

- KPI tiles: Total Staff, Active Staff, On Leave Today (Approved leave spanning today), Net Payroll
  for the current month (with Paid/Due underneath), plus a pending-approvals badge on the Leave
  Requests tab button.
- **Payroll Summary** — real base/bonus/deduction/advance totals for the current month (bar chart);
  empty state, not an invented split, when the month hasn't been generated yet.
- **Staff Mix** — active staff grouped by designation.
- **Payroll Trend** — net payable vs. paid across the last 6 generated months.
- **Recent HR Activity** — `activity_log` rows for `staff`/`staff_salary`/`staff_leave` entity types,
  newest first (`listHrActivity()`).

### 15c-ii. Leave Requests tab

Admin review surface for `staff_leaves` (migration 052, DATABASE.md). Filter by status
(Pending/Approved/Rejected/All, defaults to Pending). Approve/Reject opens a small modal for an
optional decision note; both actions stamp `decided_by`/`decided_at` and write an `activity_log`
entry. **Add Leave For Staff** lets the admin file a request on a roster member's behalf (e.g. a
staff member without an app login) — same table, same trigger-filled identity, admin bypasses the
"own rows only" self-service policy per `staff_leaves_insert_admin`.

Every active `doctor`/`operator` account can submit their own request independently, from **My Leave**
in their Zone (§13) — see DATABASE.md for the RLS split between admin and self-service rows.

### 15c-iii. Staff & Salary tab (moved from Financial Analysis 2026-08-08, feature itself unchanged since 2026-08-01, migration 045)

Renders the same `StaffAnalyticsSection` component that used to live in Financial Analysis — moved,
not rewritten, so nothing about how it works changed:

- **Roster:** salaried staff (name, phone, designation, monthly salary, active/inactive, `leave_quota_days`
  — annual leave entitlement, default 20, migration 053) — includes any fixed-salary doctors, not just
  non-clinical staff. Admin CRUD; delete admin-only (matches the `staff_delete`/`staff_salary_payments_delete`
  RLS policy, which stays admin-only even though select/insert/update are `can_access_staff_analytics`-gated,
  same convention as `doctor_profiles_delete`).
- **Monthly salary statement:** pick a month, "Generate" seeds one row per active staff member
  (idempotent — re-running never overwrites figures already entered, `UNIQUE(staff_id,
  period_month)`), `base_salary` snapshotted from the roster's current `monthly_salary` at that
  moment so a later raise doesn't rewrite an already-generated month. Record bonus/deduction/
  advance/amount-paid per staff member per month; export CSV/PDF.

Because the page itself is now strictly admin-only, `can_access_staff_analytics` (§1) no longer has
any effect on who can reach this tab — a non-admin account holding that permission keeps its RLS
access to the underlying tables but has no UI route to them. Not removed as part of this change;
flagged for a separate decision.

## 16. Notifications

Header bell with a real notification center: backup results/reminders and system messages; read/unread state. Entries can be scoped to a role (`audience`) so role-specific content never leaks to a different role who logs in later on the same device/browser — mechanism still in place, but backup notifications stopped using it 2026-08-03 (now `audience: null`, i.e. every role, once Backup & Restore opened to operator — see §14) since the schema only supports one role or "everyone," not an arbitrary subset. Also shows **live** entries computed fresh each poll (not stored, so identical across every device): admin sees a pending-count entry for network access requests (§1); a doctor/operator with an already-active session sees an informational entry when one of their *other* devices has a request awaiting approval. Panel position is computed from the bell button's on-screen rect (not a CSS anchor) so it can't overflow the viewport on narrow screens — the bell isn't the header's rightmost icon.
- **Billing alerts (2026-07-20, admin only):** the bell's live poll also surfaces recent invoice/payment **edits and deletes** (any actor, including admin's own — not creates) via `listRecentBillingAlerts()` (`src/lib/billingAlerts.ts`), reading straight from `activity_log` so it's identical across every admin device. Unread state uses a per-device localStorage watermark (`getBillingAlertsSeen`/`setBillingAlertsSeen`) that advances only when the bell is opened; entries stay listed afterward as a recent-activity feed. Clicking an entry opens that patient's Pt. Log (`/patients/:id?section=ptlog`).

## 17. Cross-cutting behaviors

- **Audit everything:** edits snapshot-then-write; deletes snapshot full row; both restorable by admin; activity log records usage. Deleting/reverting is permission-gated.
- **Stale-deploy recovery:** if a lazy chunk 404s after a redeploy, the app auto-reloads once to pick up the new build.
- **Mobile-first:** every flow above works on a phone; print/share flows have mobile-specific modals.
- **Offline today:** viewing/writing needs network (admin login excepted). Offline viewing arrives with roadmap M1.
