# FEATURES.md — Detailed Functional Specifications

What each module does today (2026-07-18), as behavior — implementation notes live in [CLINICMX.md](CLINICMX.md), schema in [DATABASE.md](DATABASE.md). When modifying a module, the described behavior is the contract: don't change adjacent behavior without an explicit request.

---

## 1. Login & roles

- Role selector: **Admin** (PIN `6040`, client-side), **Doctor** / **Operator** (accounts in `app_users`, email-or-phone identifier + password).
- Roles: admin = everything incl. delete/revert/clinic-profile/users; doctor = default no-delete, can revert; operator = default no-delete/no-revert. Per-user permission overrides (page toggles + `can_delete`/`can_revert`/`can_edit_clinic_profile`) set by admin in Users tab. Unknown/legacy permission keys fail open.
- Page access enforced per-route (`RequirePage`); wrong login shakes; session persists in localStorage until logout.
- **Network access gate (2026-07-18):** doctor/operator logins (after the password verifies) check the device's public IP (ipify, 3s timeout) against that user's admin-approved list in `authorized_ips` — max 5 per user, oldest replaced on approval. Unknown IP → pending request + "Waiting for admin approval" screen (polls every 10s, auto-enters on approval); denied IP → refused. IP lookup failure → login **blocked** (fail-closed) unless the user has the **"Entry from any IP"** permission (`can_any_ip`, new Users-tab checkbox), which skips the gate entirely; missing key on old accounts = gated (fails closed, unlike page keys). Admin logins are never gated. Managed in Admin zone → **Network Access** tab; approve/deny/remove actions land in the Activity Log (`ip_access`).
- **Admin 2FA (2026-07-19):** after the PIN, an unknown device must enter a 6-digit code sent to the admin's **Telegram** (Cloudflare Pages Function `/api/admin-otp`; channel pluggable — Gmail planned). Behavior contract: code valid **5 min**, max **5 wrong codes** per code; successful verification stores a signed trusted-device token so that browser skips the OTP for **7 days**; ≥10 failures (PIN/code/recovery) per IP per hour → endpoint locks out for an hour; max 5 Telegram sends per IP per hour. If Telegram delivery fails, the card switches to the **recovery code** path (long passphrase, `ADMIN_RECOVERY_CODE` secret). While the Cloudflare secrets/KV are **not configured** the endpoint answers `unconfigured` and admin login stays PIN-only (deploy-safe); same PIN-only fallback in local dev where functions don't run. The hardcoded PIN constant remains in the bundle **only** as the secure-storage key-derivation input (all roles need it); the server holds its own `ADMIN_PIN` copy for the actual gate.

## 2. Dashboard (`/dashboard`)

Live stats (patients, today's appointments, revenue/dues) + today's appointment list with patient links. Refresh button re-runs the consolidated loader. First page after login. Admin-only dismissible banner when network access requests are pending (links to the Admin zone Network Access tab).

## 3. Patients (`/patients`, `/patients/:id`)

- **List:** unified search by name / phone (digit-normalized, handles `+880`/`0` prefixes) / patient code; add/edit via modal. **DOB or age** accepted — age-only patients get a derived DOB; age saves correctly on edit.
- **Patient code:** server-assigned `PT-1xxxxx` (sequence-backed, unique, shown everywhere, encoded in prescription QR).
- **Profile (the core screen):** smart header (identity, code, age/weight, quick stats), quick-add **FAB** (visit, appointment, prescription, treatment, invoice), tabs:
  - **Visits** — visit history with per-visit Billed/Due chips and running due (see §9); add-visit form captures clinical summary + treatments done + payment in one flow; grouped similar planned treatments; summary fields non-editable after save; edit/delete with audit.
  - **Treatments** — plan + history; multi-tooth display; status changes inline.
  - **Prescriptions** — per-patient list + create (full prescription form embedded).
  - **Files** — profile photo, clinical images, x-rays; upload to Supabase Storage bucket `patient-files`; preview in-browser.
  - **Dental chart** — see §10.
  - Activity timeline of everything that happened to the patient.
- **Medical history:** structured fields (`MedicalHistoryFields`) stored on the patient and pulled into prescriptions.
- Patient name is clickable → profile everywhere it appears.

## 4. Appointments (`/appointments`)

- Day + week calendar views; day dots for load; booking modal supports **existing patient** (search-select) or **inline new patient** (name/age/sex/mobile creates the patient record).
- **Conflict prevention:** same-time/overlap checks at create and reschedule, using local clinic time.
- Statuses (scheduled → completed/cancelled…); **Reschedule** action with its own modal; **completing an appointment prompts to add a visit** for that patient (2026-07-17).
- Appointment links propagate: prescriptions/treatments/invoices created from a visit carry `appointment_id`.
- **One-tap WhatsApp reminders (2026-07-20):** a collapsible "Reminders due today" queue at the top of the page lists Scheduled/Confirmed appointments happening today within the next 6 hours that haven't been reminded yet (`reminder_sent_at IS NULL`). One tap opens `wa.me` with a prefilled message and marks the appointment reminded (with an Undo until the next refresh); patients with no phone show a disabled row instead of disappearing. Rescheduling clears `reminder_sent_at` so the reminder becomes due again in the new window. Deliberately manual-tap, not the official WhatsApp Cloud API — that requires a per-message-billed Meta Business account and a dedicated phone number removed from the WhatsApp phone app; n8n was also considered and rejected since it only orchestrates and still needs the same Cloud API plus separate paid hosting.

## 5. Treatments (`/treatments` + profile tab)

- Treatment plan entries: type, multi-tooth support (per-tooth rows grouped by `treatment_plan_group_id`), description, cost, status (Planned / In Progress / Completed…), notes.
- **Plan → visit → invoice pipeline:** planned treatments appear in Add Visit (grouped, default In Progress); completing/billing marks `is_invoiced` + `invoice_id`; costs sync between treatment and invoice line (`invoiceSync`).
- **Treatment-plan discount (2026-07-17):** discount applied at plan level flows through Add Visit, invoices, and prints; `original_cost` preserves the pre-discount price.
- Status changeable directly from the history table; edit/delete audited; treatments creatable from prescriptions' Treatment Plan entries (linked via `prescription_id`/`prescription_entry_id`).

## 6. Lab (`/lab`, migration 030 — not yet applied to prod at the time of this entry)

- **Tracks labwork sent to a dental lab** — crowns, bridges, dentures, ortho appliances, veneers, inlay/onlay, implant prosthesis, post & core, splint/night guard. Nav: Patients → Lab (sidebar, below Treatments).
- **This is accounts payable to the lab vendor, not patient invoicing** — deliberately has no link to `invoices`/`payments`. Payment state is a single "Paid to lab" checkbox (no partial-payment tracking).
- Each record: lab/vendor name, work type, **teeth** (reuses the same `ToothSelector`/`ArchDentalChart` tooth chart as Treatments/Prescriptions — FDI numbers), shade, material, status (Pending → Sent → Received → Delivered, or Cancelled), dates sent/expected/received, notes.
- **Pricing toggle per record:** Per unit (price × number of teeth/units) or Flat (one price for the whole case); units default to the tooth count but are editable (e.g. one ortho appliance spanning many teeth is still 1 billable unit).
- **Auto-create from Treatments:** saving a treatment whose type matches a lab-related keyword (Crown, Bridge, Denture, Braces/aligner/retainer, Veneer, Implant, etc. — see `LAB_TYPE_KEYWORDS` in `src/lib/labWork.ts`) automatically creates a matching placeholder Lab record (lab name/price left blank, flagged "Needs details"). One record per (treatment-plan × work type) — a 3-tooth crown plan becomes one 3-unit case, not three rows. Fires from all three treatment-save paths (Treatments page, Patient Profile treatment plan, Add Visit); fire-and-forget and failure-isolated — a failure here never blocks or rolls back the treatment save. Idempotent (`UNIQUE(source_plan_group_id, work_type)`), so re-saving the same plan never duplicates. Not hooked on treatment edits — changing a treatment's type after the fact doesn't retroactively create/remove lab rows.
- **List page:** grouped by patient (collapsible, like Treatments), search by patient/vendor/work type, filter chips (All/Unpaid/Overdue), totals bar (Total billed by lab / Paid to lab / Due to lab) that narrows to the current search+filter.
- Fully audited (edit/delete history, restorable) like every other entity.

## 7. Prescriptions (`/prescriptions` + profile tab)

- **Patient selection flow on the Prescriptions page is FROZEN** — search existing or inline-create new patient; do not modify without explicit request.
- **Clinical fields (multi-entry):** Chief Complaint, On Examination, Diagnosis, Treatment Plan — each a list of entries with optional per-entry **tooth tags** (FDI selector + quadrant picker for C/C); autocomplete suggestions from prior entries (prescription memory); reusable **section templates** (saved encrypted locally).
- **Medications:** DrugPicker over the BD drug database — search by brand/generic/company, category-grouped dropdown with color chips; picking a drug prefills dosage/frequency/duration/instructions/route for the patient's **age tier** (infant/child/adult); syrup/suspension/drops forms with **weight-based ml-dose calculator** (mg/kg → ml, using patient weight; weight snapshot stored on the prescription). AI dose features are prefills only — dentist confirms.
- **Investigations:** list with templates.
- **Output:** print layout matching the physical pad (3-column letterhead, logo, Bengali route/dosage/frequency/duration/instructions, footer with Rx ID pinned to page bottom, **QR code**); share as real PDF via Email/WhatsApp (desktop-width capture); Bangla text and QR verified in shared PDFs.
- List groups prescriptions by patient; searchable by name/code/phone.

## 8. Billing (`/billing`)

- **Invoice creation:** from treatments (select uninvoiced work), from templates, or ad-hoc items; fixed/percent discount, tax, notes, payment terms; invoice number from settings counter; Basic vs Advanced types (`AdvancedInvoiceModal`).
- **Payments:** partial payments with method (cash/card/bKash…), recorded via `recordInvoicePayment` (single source of truth for paid/status); pay-against-invoice picker; payment history panel; payment receipts printable.
- **Payment WhatsApp thank-you (2026-07-20):** right after a payment is recorded (Record Payment modal, immediate payment on invoice creation, or the Patient Profile visit-form payment) a one-tap prompt offers to send a cordial `wa.me` thank-you message stating the amount paid, when the patient has a phone on file; Skip/close just dismisses it (nothing persisted). Not shown for the Billing page's bulk "mark selected invoices paid" action.
- **Invoice merging:** combine invoices into a survivor (`merged_into_invoice_id`); merged ones hidden from actives but auditable.
- **Prints/shares:** Detailed and Receipt formats (optional grouping, distinct filenames), single/combined/list printing, combined patient statements (grouped, page-break safe), embedded clinic logo, PDF share via Email/WhatsApp.
- **Page UX:** live search incl. patients with no invoices yet; recently-worked patients; per-patient color-accented cards; timeline panel per invoice (`invoice_history`); financial reports panel (`FinancialReportsPanel`); treatment estimates printable pre-invoice (`TreatmentEstimatePrint`).
- **Pt. Log (2026-07-20):** a "Pt. Log" sub-section under the patient profile's Billing tab (`PatientBillingLogPanel`) — a read-only, patient-scoped feed of invoice/payment creates, edits, and deletes (`activity_log` filtered to `entity_type in (invoice, payment)`), each row showing what changed and who did it (`formatAuditActor`). Invoice edits now snapshot to `edit_history` via `logEdit` (previously `activity_log`-only, not revertible); payment deletes now also write to `activity_log` (previously only an `invoice_history` event). Invoice deletes note in their log details when payments were also lost to the `payments.invoice_id` cascade.

## 9. Inventory (`/inventory`)

Categories Materials / Instruments / Others; quantity+unit, low-stock threshold with warnings, supplier, cost, expiry date; stock movements in/out logged (`inventory_movements`). Auto-deduction from treatments is backlog (M6), not implemented.

## 10. Visit history & running dues

Each visit shows what was **billed** that day and what was **paid**, including payments that only pay down an older invoice (visit links to that invoice too); the chip shows the **per-visit running due** (due as of that visit), not the invoice's final due. This area had many subtle fixes (2026-07-15) — treat the displayed numbers as carefully specified; verify against payment history when changing anything.

## 11. Dental chart (patient profile tab)

FDI-notation arch chart (`ArchDentalChart`) drawn as a vertical U-shape; **age-aware dentition** (deciduous vs permanent based on patient age); per-tooth records (condition/notes → `dental_records`); tooth selection feeds treatments and prescription tooth tags.

## 12. QR search (`/qr-search`)

Camera scanner (html5-qrcode) reads the QR printed on prescriptions → jumps straight to the patient. Manual code entry fallback.

## 13. Doctor profile & Admin zone (`/doctor-profile`, `/admin`)

- **Profile:** doctor name, multi-degree list, registration, chamber/clinic details, logo upload — feeds prescription/invoice letterheads; syncs across devices (Supabase singleton) with encrypted local mirror for offline.
- **Admin zone (admin only):** **Users** tab (create/edit doctor/operator accounts, activate/deactivate, per-user permissions incl. page toggles); **Network Access** tab (approve/deny/remove per-user login IPs, pending-count badge — see §1); **Activity Log** tab (who did what, when, filterable); **restore/revert center** — deleted records (from `delete_history`) restorable; edits revertible (from `edit_history`); actions labeled with the responsible role/user.

## 14. Backup & Restore (`/backup`, admin-only)

Device backup download (JSON, encrypted option), dry-run-first restore, restore-from-Drive picker, one-tap **Upload to Google Drive**, backup reminders (banner + notification center), auto-prune of old device backups. Complements the invisible nightly cloud backup ([CLINICMX.md](CLINICMX.md) §11).

## 15. Clinic Analytics (`/analytics`, admin-only)

Charts (recharts) over live data with a **6M / 12M / All** range selector (client-side filter, no refetch) and Refresh. Strictly read-only. Metric definitions:

- **Daily Earnings calendar** (above Monthly Revenue): month grid, own prev/next month navigation, independent of the 6M/12M/All selector. Each day shows Σ `payments.amount` for that `payment_date` — actual cash received that day, **not** the invoice-date basis the rest of this section uses, so day totals need not tie back to the month bar below. Payments on Merged invoices excluded. Tapping a day with earnings opens a breakdown **by patient** — who paid and how much (`×n` when someone paid more than once that day), names linking to their profile. Deliberately per-patient rather than per-treatment: a treatment-plan invoice mixes procedure types, so splitting a day's cash across types would be misleading. Rows sum to exactly that day's total.
- **Revenue:** Collected = Σ `paid_amount`, Outstanding = Σ max(`total_amount` − `paid_amount`, 0), non-Merged invoices grouped by `created_at` month (matches Dashboard/FinancialReportsPanel). **Revenue by Treatment** attributes each invoice's paid amount across its line items proportionally to line totals, mapping items to `treatment_type` via `source_treatment_id(s)`; manually added items (no treatment link) show as **"Other / Unlinked"** — buckets always sum to total collected. Top Revenue Sources = patients ranked by payments collected (names link to profiles).
- **Patients:** new registrations per month + cumulative growth; **Returning vs New** by appointments (Cancelled excluded) — a patient is *New* in the month of their first-ever appointment, *Returning* in any later month they visit.
- **Treatments:** procedure counts and average recorded cost per type (freeform `treatment_type` grouped case-insensitively, top 10 + Others; zero-cost rows excluded from averages), and a Planned → In Progress → Completed pipeline with completion rate (Cancelled shown separately).

Gated like `/backup`: page self-redirects non-admins to `/dashboard`; sidebar link renders only for admin.

## 16. Notifications

Header bell with a real notification center: backup results/reminders and system messages; read/unread state. Entries can be scoped to a role (`audience`) so admin-only content (e.g. backup reminders) never leaks to a doctor/operator who logs in later on the same device/browser. Also shows **live** entries computed fresh each poll (not stored, so identical across every device): admin sees a pending-count entry for network access requests (§1); a doctor/operator with an already-active session sees an informational entry when one of their *other* devices has a request awaiting approval. Panel position is computed from the bell button's on-screen rect (not a CSS anchor) so it can't overflow the viewport on narrow screens — the bell isn't the header's rightmost icon.
- **Billing alerts (2026-07-20, admin only):** the bell's live poll also surfaces recent invoice/payment **edits and deletes** (any actor, including admin's own — not creates) via `listRecentBillingAlerts()` (`src/lib/billingAlerts.ts`), reading straight from `activity_log` so it's identical across every admin device. Unread state uses a per-device localStorage watermark (`getBillingAlertsSeen`/`setBillingAlertsSeen`) that advances only when the bell is opened; entries stay listed afterward as a recent-activity feed. Clicking an entry opens that patient's Pt. Log (`/patients/:id?section=ptlog`).

## 17. Cross-cutting behaviors

- **Audit everything:** edits snapshot-then-write; deletes snapshot full row; both restorable by admin; activity log records usage. Deleting/reverting is permission-gated.
- **Stale-deploy recovery:** if a lazy chunk 404s after a redeploy, the app auto-reloads once to pick up the new build.
- **Mobile-first:** every flow above works on a phone; print/share flows have mobile-specific modals.
- **Offline today:** viewing/writing needs network (admin login excepted). Offline viewing arrives with roadmap M1.
