# CHANGELOG.md — Version History

Curated from git history (302 commits). No semantic versioning — the app deploys continuously from `main`; entries are grouped by date (newest first). For the forward plan see [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md).

---

## 2026-07-22 — Consultation tab (migration 033)
- **New `/consultations` page** (sidebar: Patients → Consultation, above Treatments): entry point for walk-in patients who only came for a paid consultation, no treatment yet. New `patients.patient_type` column (`'full' | 'consultation'`, default `'full'`, `supabase/migrations/033_patient_type.sql`) — consultation entries are regular `patients` rows (get a real `PT-1xxxxx` code) tagged so they're hidden from the main Patients list, Dashboard patient count, and Analytics new-patient charts until converted.
- **Add Consultation modal:** only name, age, and sex are required; phone/email/DOB/address/notes sit behind a collapsed "More details (optional)" section, reusing the same optional-field pattern as the full Add Patient form. Adds a required Consultation Fee field. On save, creates the patient (`createPatient()` in `src/lib/patients.ts`, extended with a `patient_type` param) then immediately opens `InvoiceModal` prefilled with a single "Consultation" line item via a synthetic `InvoiceTemplateData` (`id: ''` so it doesn't try to FK to a real `invoice_templates` row) — reuses the existing invoice/payment/WhatsApp-thank-you pipeline unchanged, so the fee flows into Analytics Revenue like any other invoice.
- **Row actions:** Invoice fee (re-opens `InvoiceModal` for a follow-up consultation), **Convert to patient** (flips `patient_type` to `'full'`, audited via `logEdit`+`logActivity`), Write prescription (routes to `/prescriptions`, now selectable there — see below), Edit, Delete (existing `logEdit`/`logDeletion`/`canDelete()` pattern).
- **Prescriptions can now be written for consultation-only patients:** removed the `patient_type` filter from the Prescriptions page's patient list (the only page-specific change made to the frozen Prescriptions patient-selection flow — the flow itself wasn't touched, just its dataset). Every other full-patient screen (Patients, Dashboard, Billing, Treatments, Lab, Appointments) filters consultation entries out of patient pickers/lists; QrSearch and PatientProfile deliberately don't filter (QR resolves by code; a consultation patient's profile is viewable like any other).
- `src/lib/database.types.ts` and `src/lib/entityTables.ts` (`ENTITY_TABLE_COLUMNS.patient`) updated with the new column so audit snapshots/restores carry it.
- **Post-intake prescription prompt:** once the invoice step for a freshly-added consultation is done (saved or skipped), a small dialog asks "Write a prescription now?" — Write Prescription routes to `/prescriptions`, Not now just dismisses.
- **New Prescription → New Patient can create a consultation-only patient directly:** a "Consultation only" checkbox above the name fields (with a required Consultation Fee field when checked) creates the patient with `patient_type = 'consultation'` instead of the default `'full'`. After the prescription saves, the same synthetic-template `InvoiceModal` flow used by the Consultation page's Add Consultation modal opens automatically for the fee. This is the one addition to the Prescriptions page's frozen patient-creation path — done at the user's explicit request.

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
