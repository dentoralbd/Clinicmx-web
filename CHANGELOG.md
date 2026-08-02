# CHANGELOG.md — Version History

Curated from git history (302 commits). No semantic versioning — the app deploys continuously from `main`; entries are grouped by date (newest first). For the forward plan see [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md).

---

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
`treatments.doctor_name` column for the general risk and how to avoid it recurring.

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
