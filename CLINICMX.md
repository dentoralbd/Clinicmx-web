# CLINICMX.md — Current Implementation & Technical Reference

**App:** ClinicMx — dental clinic management system for a solo dental clinic in Bangladesh.
**Live site:** https://clinicmx-web.pages.dev/ (Cloudflare Pages, auto-deploys from `main`).
**Status of this doc:** describes the codebase as of 2026-07-18. This is the broad technical reference; for the offline/Android implementation plan see [OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md) (authoritative for that work — as of 2026-08-07 that work is implemented on branch `offline-m1`, not yet merged; see its status note and [FEATURES.md](FEATURES.md) §1b for the current behavior contract).

**Documentation set:**
| Doc | Purpose |
|---|---|
| [CLINICMX.md](CLINICMX.md) | This file — current implementation & technical reference |
| [CLINICMX-GPT.md](CLINICMX-GPT.md) | Future architecture & engineering principles |
| [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md) | Product roadmap & release plan |
| [OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md) | Approved offline-first/Android implementation plan (M0–M6) |
| [CLAUDE.md](CLAUDE.md) | Claude Code development instructions for this repo |
| [DATABASE.md](DATABASE.md) | Database schema & migration guidelines |
| [API.md](API.md) | Data access, serverless functions, sync & repository specs |
| [UI-UX.md](UI-UX.md) | Design system & UI standards |
| [FEATURES.md](FEATURES.md) | Detailed functional specifications |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## 1. Overview

Single-page web app managing the full workflow of a small dental clinic: patients, appointments, treatments, prescriptions (with a Bangladesh-market drug database), billing/payments, inventory, dental charting, and admin functions (users, permissions, audit logs, backups). One clinic, one shared dataset, 2–3 staff users. Mobile-responsive; used chairside on phones as much as on desktop.

A sibling repo, `sk-dental`, is a white-labeled fork for a second clinic. **It is frozen (user decision 2026-07-11)** — all development happens here only.

## 2. Tech stack

- **React 18 + TypeScript (strict) + Vite 5** — SPA; no SSR. On branch `offline-m1` (2026-08-07, not yet merged) it's also a PWA — service worker via `vite-plugin-pwa`, offline-capable — see [OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md) and FEATURES.md §1b.
- **react-router-dom v6** — `BrowserRouter`; all pages lazy-loaded except Login.
- **Tailwind CSS 3** — custom teal/pink theme in `tailwind.config.cjs` (see [UI-UX.md](UI-UX.md)).
- **@tanstack/react-query 5** — mounted app-wide. On `main` today still only used by `components/admin/UsersTab.tsx`; on `offline-m1` it's fully adopted for reads via `src/repositories/` (Dashboard/Patients/Appointments/PatientProfile) plus a 7-day IndexedDB persister (`src/lib/queryClient.ts`).
- **Supabase** (`@supabase/supabase-js`) — PostgreSQL + Storage; the only backend. No custom server except a few Cloudflare Pages Functions (backup upload/download).
- **PDF/print:** `jspdf` + `jspdf-autotable` + `html2canvas` (`src/lib/domToPdf.ts`, `invoicePdf.ts`, `estimatePdf.ts`, `sharePdf.ts`).
- **QR:** `qrcode.react` (generation on prescriptions), `html5-qrcode` (camera scanning on the QR Search page).
- **Icons:** `lucide-react`. **Dates:** `date-fns`.
- **Charts:** `recharts` — used only by the admin Analytics page (`pages/Analytics.tsx` + `components/analytics/`), so it code-splits into that lazy chunk.

No test suite, no linter; npm scripts are `dev` / `build` / `preview` on `main`, plus `typecheck` on `offline-m1` (roadmap M0). Verification is `vite build` (+ `npm run typecheck` where available) + manual flows.

## 3. Deployment & environments

- **Production:** Cloudflare Pages project `clinicmx-web`; pushing `main` = deploying production. `public/_redirects` provides the SPA fallback. `netlify.toml` is legacy (site is not on Netlify).
- **Database:** live Supabase project `https://mgzmxnkrbdawymdviclv.supabase.co`. **This is production data — treat all schema/data changes as high-risk** (see [DATABASE.md](DATABASE.md) and [CLAUDE.md](CLAUDE.md)).
- **Env vars** (`.env`, gitignored; also set in Cloudflare Pages): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. All `VITE_`-prefixed vars ship in the client bundle — the anon key is extractable, and today's RLS policies are allow-all, which is why real auth+RLS is roadmap M3.
- **Cloudflare Pages Functions env** (dashboard-configured, for `functions/api/*`): the 4 Google OAuth vars used by backup upload — see [API.md](API.md).
- **Local dev:** `npm install`, then `npm run dev` (workspace `launch.json` runs it on port 5173). Local `.env` points at the live database — normal app usage is fine; destructive operations are not.

## 4. Repository structure

```
Clinicmx-web/
├── functions/api/          Cloudflare Pages Functions: upload-backup, list-backups,
│                           download-backup, _lib (Google Drive OAuth helpers)
├── public/                 logo.png (1.1 MB — also favicon and PDF letterhead), _redirects
├── scripts/backup/         Nightly backup/restore tooling (backup.mjs, restore.mjs,
│                           authorize.mjs, lib.mjs, README.md, .env.backup [gitignored])
├── .github/workflows/      backup.yml — scheduled backup (see §12: runs on the
│                           gsbanikudc-byte remote, not this one)
├── supabase/migrations/    001–026 SQL migrations (see DATABASE.md)
└── src/
    ├── App.tsx             Router + QueryClientProvider + lazy routes
    ├── main.tsx            Mount + vite:preloadError auto-reload listener
    ├── index.css           Tailwind layers + mobile/touch/print/global styles
    ├── components/         Feature components & modals (invoice/payment modals, DrugPicker,
    │   │                   print layouts, selectors, panels, ErrorBoundary…)
    │   ├── admin/          UsersTab, ActivityLogTab, AccessRequestsTab, ClinicHoursTab
    │   │                   (Admin zone inside DoctorProfile)
    │   ├── layout/         DashboardLayout, Header, Sidebar, NotificationBell
    │   └── ui/             Button, Card primitives
    ├── lib/                Business logic & data helpers (see below)
    ├── pages/              Route-level pages
    ├── services/           google/ + sync/ — Google Sheets/Drive sync. DEAD CODE: no importers.
    └── workers/            backupWorker.ts (web worker for device backup)
```

**Branch `offline-m1` (2026-08-07, not yet merged)** adds: `src/repositories/` (React Query read repos — `keys.ts`, `patientsRepo.ts`, `appointmentsRepo.ts`, `dashboardRepo.ts`, `patientProfileRepo.ts`, `treatmentsRepo.ts`), `src/lib/offlineSync.ts` + `queryClient.ts` + `useOnlineStatus.ts` + `invoiceNumbering.ts`, `src/pages/OfflineOutbox.tsx`, `src/components/admin/OfflineEditsTab.tsx`, `src/components/SnapshotDetails.tsx` (extracted out of `DoctorProfile.tsx`, now also shared by Delete/Edit History), `public/_headers` + `public/icons/`. See FEATURES.md §1b and OFFLINE_ROADMAP.md for the behavior contract.

Key `src/lib/` modules:

| Module | Role |
|---|---|
| `supabase.ts` | Typed supabase-js client (`Database` generic) |
| `database.types.ts` | Hand-maintained TS mirror of the DB schema — **must be updated with every migration** |
| `entityTables.ts` | `ENTITY_TABLE_COLUMNS` registry + `sanitizeSnapshot` — keystone of audit/restore; **also must track schema changes** |
| `patients.ts`, `patientCode.ts` | Patient create/search; `PT-1xxxxx` code assignment via `generate_patient_code` RPC |
| `billing.ts`, `payments.ts`, `invoiceSync.ts`, `invoicePayload.ts` | Invoice math, payment recording, treatment↔invoice sync, legacy-safe insert payloads |
| `editHistory.ts`, `deleteHistory.ts`, `activityLog.ts` | Audit trail (snapshot-first; activity log is fire-and-forget) |
| `appUsers.ts`, `appSession.ts`, `secureLocalStorage.ts` | Staff accounts (PBKDF2), roles/permissions, AES-GCM encrypted localStorage |
| `doctorProfile.ts` | Remote upsert + encrypted local mirror + offline fallback (best repo-pattern template) |
| `dentalDrugDatabase.ts`, `medicationBengali.ts`, `weightDosing*.ts`, `liquidVolumeDosing.ts`, `ageTier.ts` | BD drug directory, Bengali translation, age/weight dosing |
| `prescriptionMemory.ts`, `prescriptionSectionTemplates.ts`, `clinicalEntries.ts`, `prescriptionQr.ts` | Prescription autocomplete memory, reusable section templates, multi-entry clinical fields, QR payloads |
| `treatmentPlan.ts`, `medicalHistory.ts`, `notifications.ts`, `backupCrypto.ts`, `deviceBackup.ts`, `backupReminders.ts` | Treatment-plan grouping, structured medical history, notification center, device backup engine |
| `domToPdf.ts`, `invoicePdf.ts`, `estimatePdf.ts`, `sharePdf.ts`, `logoImage.ts` | PDF capture/generation/share (Email/WhatsApp) |

## 5. Routing & pages

All routes nested under `ProtectedRoute` → `DashboardLayout` (`src/App.tsx`):

| Route | Page | Guard |
|---|---|---|
| `/login` | Login (role selector: Admin PIN / Doctor / Operator) | — |
| `/dashboard` | Dashboard (stats, today's appointments) | auth |
| `/patients`, `/patients/:id` | Patients list, PatientProfile (tabbed hub — the app's core screen, ~5,900 lines) | page `patients` |
| `/appointments` | Appointments (day/week calendar, conflicts, reschedule) | page `appointments` |
| `/treatments` | Treatments | page `treatments` |
| `/prescriptions` | Prescriptions | page `prescriptions` |
| `/billing` | Billing (invoices, payments, reports) | page `billing` |
| `/inventory` | Inventory | page `inventory` |
| `/qr-search` | QR Search (camera scan → patient) | page `qr-search` |
| `/doctor-profile`, `/admin` | DoctorProfile (profile + Admin zone: Users, Activity Log) | auth |
| `/backup` | BackupRestore (admin-only in UI) | auth |
| `/analytics` | Analytics (admin-only in UI; recharts, aggregations in `lib/analytics.ts`) | auth |

**Dead code:** `src/routes.tsx` and `src/pages/DentalChart.tsx` (only imported by routes.tsx) are an unused older router. The live dental chart is `components/ArchDentalChart.tsx` rendered inside PatientProfile. Do not remove without user approval.

## 6. Authentication, roles & permissions

Custom app-level auth — **not** Supabase Auth (that's roadmap M3):

- **Admin:** PIN compared client-side (`Login.tsx`, sourced from `VITE_ADMIN_PASSWORD`); works offline by construction.
- **Doctor / Operator:** accounts in the `app_users` table; PBKDF2-SHA256 (100k iterations) password hashes verified client-side (`lib/appUsers.ts`); requires network.
- Session state in localStorage (`clinicmx_auth`, `clinicmx_role`, `clinicmx_user`); an AES key in sessionStorage encrypts sensitive localStorage entries (`secureLocalStorage.ts`) — dies when the tab closes.
- **Permissions** (`lib/appSession.ts`): per-user JSON overriding role defaults — `can_delete`, `can_revert`, `can_edit_clinic_profile`, plus per-page toggles enforced by `RequirePage`. Admin bypasses all checks. Missing keys fail open (backward compatibility with pre-feature sessions).
- Admin manages accounts and permissions in DoctorProfile → Admin zone → Users tab.

**Security posture (known, accepted until M3):** the Supabase anon key is in the bundle and RLS policies are allow-all, so the DB itself is open to anyone who extracts the key. The login gate is app-level only. Mitigations: private URL, small user base, nightly backups, planned Supabase Auth + real RLS (M3).

## 7. Data layer

- **~198 direct supabase-js callsites across ~30 files** (~92 selects, ~123 writes, 1 RPC `generate_patient_code`, 3 storage calls in PatientProfile). No abstraction layer yet — the repository layer is roadmap M2 (spec in [API.md](API.md)).
- **Consolidated loader pattern:** each page fetches through one loader function (`loadDashboardData`, `loadPatients`, `loadAppointments`/`loadWeekAppointments`, `PatientProfile.loadPatientData` — an 8-query `Promise.all` re-invoked after every write). This is the key enabler for converting reads to React Query with near-zero JSX changes.
- **Audit trail:** `logEdit`/`logDeletion` snapshot the row **before** writing (using `ENTITY_TABLE_COLUMNS`), enabling restore/revert from the Admin zone. `logActivity` is fire-and-forget and swallows failures.
- **Client-only business data in localStorage** (no DB column yet; moves to DB in M4): doctor-profile logo (encrypted), prescription section templates (encrypted), prescription autocomplete memory (plaintext).

## 8. Prescriptions & the drug database

The clinically richest module — see [FEATURES.md](FEATURES.md) §6 for full behavior. Technical highlights:

- `lib/dentalDrugDatabase.ts`: BD-market directory — `GENERIC_DEFAULTS` (per-generic dosage/frequency/duration/instructions/route/category, with age-tier and weight-based variants) + `DRUG_SEEDS` (brands with company/pack/price) → computed `DENTAL_DRUGS`; helpers `searchDrugs`, `getDrugsByCategory`, `getDrugsByGeneric`.
- **Gotcha:** `DrugPicker.tsx` has its own `CATEGORY_META` (colors) and `CATEGORY_ORDER` (grouping) lists that **must stay in sync** with the `category` union in the database file. A category missing from either list makes its drugs invisible in the default no-search dropdown (hit once with Antifibrinolytic).
- Age tiers (`ageTier.ts`: infant/child/adult from DOB-or-age) and weight-based dosing (`weightDosing*.ts`, `liquidVolumeDosing.ts` — mg/kg → ml calculators for syrups/drops).
- Bengali output: `medicationBengali.ts` translates route/frequency/duration/instructions for the printed prescription.
- Multi-entry clinical fields (C/C, O/E, Diagnosis, Treatment Plan) with per-entry tooth tagging (`clinicalEntries.ts`, `MultiEntryClinicalField.tsx`, `ToothSelector`/`QuadrantSelector`).
- QR code on every prescription (`prescriptionQr.ts`) → scanned by the QR Search page for instant patient lookup.
- **The Prescriptions page patient-selection flow is frozen** (working agreement; a 2026-06-29 over-reach disrupted it once). Change nothing there without an explicit request.

## 9. Billing engine

Invoices with items JSON, fixed/percent discounts, tax, credit, late fees; partial payments (`payments` table via `recordInvoicePayment`); invoice merging (`merged_into_invoice_id`); Detailed vs Receipt print formats; combined statements; treatment↔invoice linkage (`is_invoiced`, `invoice_id` on treatments, kept consistent by `invoiceSync.ts`); per-visit running due; invoice numbering from the `invoice_settings` counter; financial reports panel. Legacy-safe insert payloads (`invoicePayload.ts`) exist because production once lacked the advanced columns — historical, but the pattern remains.

## 10. Printing, PDF & sharing

Print layouts are React components (`PrescriptionPrint`, `InvoicePrint`, `InvoiceListPrint`, `PaymentReceiptPrint`, `TreatmentEstimatePrint`) captured via `html2canvas` → `jspdf` (`domToPdf.ts`; desktop-width capture forced so phone-shared PDFs match the printed layout). `sharePdf.ts` routes to Email/WhatsApp via the Web Share API with file fallback. The clinic logo is embedded from `public/logo.png` (`logoImage.ts`).

## 11. Backups (three layers)

1. **Nightly automated** (3:00 AM BDT): GitHub Actions runs `scripts/backup/backup.mjs` — all 23 tables as zipped JSON + `patient-files` bucket mirror → Google Drive. **The scheduled workflow only actually runs on the private `gsbanikudc-byte/Clinicmx-web` remote** (this `dentoralbd` repo has an unresolved Actions issue). Any change to `scripts/backup/` or `.github/workflows/backup.yml` must be pushed to **both** remotes. Independent daily/weekly/monthly schedules, tiered Drive retention, verification/anomaly detection, compression+encryption (added 2026-07-18).
2. **In-app device backup** (`/backup` page, admin-only): JSON download to device, dry-run-first restore, backup reminders, and one-tap Upload to Google Drive via `functions/api/upload-backup.ts`.
3. **Manual:** `scripts/backup/.env.backup` (gitignored, fully configured) lets you run backup/restore locally. Restore is dry-run by default everywhere; `--confirm` required to write.

## 12. Notifications

`lib/notifications.ts` + `NotificationBell` in the header: real notification center fed by backup events and reminders (localStorage-backed).

## 13. Known quirks & technical debt

- Dead code (removal needs user approval): `src/routes.tsx` + `pages/DentalChart.tsx`; `src/services/` (Google Drive/Sheets sync — never imported) + `GOOGLE_INTEGRATION_SETUP.md`; legacy `netlify.toml`; duplicate root-level `logo.png`.
- `main.tsx` has an unconditional reload on `vite:preloadError` on `main` — **fixed on branch `offline-m1`** (loop-guarded, max once/minute, part of the PWA work; will resolve once that branch merges).
- Two pairs of duplicate migration numbers (`003`, `014`) — see [DATABASE.md](DATABASE.md).
- `database.types.ts` and `entityTables.ts` are hand-maintained and drift-prone — update both with every schema change.
- React Query mounted but unused outside UsersTab on `main`; no typecheck/lint/test scripts on `main` — **both addressed on `offline-m1`** (repository-layer adoption + `npm run typecheck`), pending merge.
- 1.1 MB logo is the single icon asset and favicon on `main`; `offline-m1` adds proper PWA icons (`public/icons/`).

## 14. Future architecture & phases (pointer)

The forward plan lives in two places:

- **[OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md)** — the approved implementation plan: M0 prep → M1 installable PWA + offline read cache → M2 complete repository layer → M3 Supabase Auth + real RLS → M4 offline writes → M5 conditional Capacitor APK → M6 features. **M0–M2 and a working M4 are implemented on branch `offline-m1` (2026-08-07, not yet merged)** — see that doc's status note. One locked decision changed during implementation: **M4 shipped as a custom IndexedDB outbox (`src/lib/offlineSync.ts`), not PowerSync** — PowerSync was evaluated in the `Clinicmx-web-redesign` prototype this was ported from but never actually wired up there, so the port didn't adopt it either. M3 (Supabase Auth + RLS) was already live in production before this work started. PWA-first with APK only if triggers fire is unchanged and already true — see CLAUDE.md's APK note.
- **Phase 6 feature layer** (after the foundation, reorder by clinic need): inventory auto-deduction from treatments, per-tooth treatment timeline, drug-interaction/allergy checks, expense tracking/cashbook, WhatsApp/SMS invoice & appointment reminders, AI assist modules (assist only — never auto-apply clinical decisions), re-enabled image uploads with client-side compression, and multi-clinic `clinic_id` scoping last. Product-level view in [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md); architecture principles in [CLINICMX-GPT.md](CLINICMX-GPT.md).
