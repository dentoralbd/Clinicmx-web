# API.md — Data Access, Serverless Functions, Sync Engine & Repository Specifications

ClinicMx has **no REST API of its own**. The client talks to Supabase directly with `supabase-js`; the only server-side code is five Cloudflare Pages Functions (four for backups, one for admin 2FA) and the GitHub-Actions backup scripts. This doc covers each surface plus the target repository-layer contract.

---

## 1. Supabase client access (current)

- Client: `src/lib/supabase.ts` — `createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`; types from `src/lib/database.types.ts`.
- **~198 direct callsites across ~30 files** (~92 selects, ~123 writes, 1 RPC, 3 storage calls). Every page fetches through a consolidated loader function (`loadDashboardData`, `loadPatients`, `loadAppointments`/`loadWeekAppointments`, `PatientProfile.loadPatientData` — an 8-query `Promise.all` re-invoked after every write). Writes are inline in page/modal handlers.
- RPC: `generate_patient_code` (via `lib/patientCode.ts`).
- Storage: `patient-files` bucket, upload/list/delete from `PatientProfile.tsx` only.
- React Query: mounted app-wide, currently used only by `components/admin/UsersTab.tsx`.

### Shared write-path helpers (call these, don't reimplement)

| Helper | Contract |
|---|---|
| `lib/payments.ts` → `recordInvoicePayment` | The only correct way to add a payment: inserts the `payments` row and updates invoice `paid_amount`/`status` consistently. |
| `lib/invoiceSync.ts` | Keeps `treatments.is_invoiced`/`invoice_id` consistent with invoice contents when invoices change. |
| `lib/editHistory.ts` / `deleteHistory.ts` | `logEdit`/`logDeletion` — **must run before** the mutation (they snapshot the current row via `ENTITY_TABLE_COLUMNS`). Restore/revert reads these tables. Both accept an optional `details` string, passed through to the `activity_log` fan-out (added 2026-07-20 for Pt. Log). |
| `lib/activityLog.ts` → `logActivity` | Fire-and-forget usage logging; swallows failures; never let it block a write. `listPatientBillingLog(patientId, page)` (2026-07-20) — patient-scoped feed (`entity_type in (invoice, payment)`, all actions), backs Pt. Log. |
| `lib/billingAlerts.ts` (2026-07-20) | `listRecentBillingAlerts()` — recent invoice/payment edits/deletes (last 7 days, any actor) for the admin notification bell's live poll; never throws. `getBillingAlertsSeen`/`setBillingAlertsSeen` — per-device localStorage watermark for the bell's unread state, advanced only when the bell is opened. |
| `lib/patients.ts`, `lib/patientCode.ts` | Patient create + unified search (name/phone/code, phone-normalized); server code assignment. |
| `lib/appUsers.ts` | Staff CRUD + PBKDF2 hash/verify + identifier normalization. |
| `lib/ipAccess.ts` | Per-user login network gate (`authorized_ips`): `fetchClientIp` (ipify, 3s, null on failure), `checkIpAccess`, `requestIpApproval` (never call on a denied row), admin approve/deny/remove (approve trims to 5 per user). Decisions log to `activity_log` as `ip_access`. |
| `lib/doctorProfile.ts` | Upsert + encrypted local mirror + offline fallback — the template for future repo design. |

## 2. Cloudflare Pages Functions (`functions/api/`)

Deployed with the site; local testing via `.dev.vars` + `npx wrangler pages dev dist`. Shared Google Drive OAuth helpers in `_lib.ts`. Env (Cloudflare dashboard, encrypted): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` (same four as the nightly backup — OAuth, not a service account, because personal Gmail can't grant service accounts Drive quota).

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/upload-backup` | POST | Receives a device-backup JSON from the `/backup` page, uploads into Drive `ClinicMx Backups/device-backups` |
| `/api/list-backups` | GET | Lists backups in Drive for the restore-from-Drive picker |
| `/api/download-backup` | GET | Streams a chosen Drive backup back for restore |
| `/api/admin-otp` | POST | Admin login second factor: `action:'request'` (PIN + optional trusted-device token → Telegram OTP or `trusted`/`unconfigured`), `action:'verify'` (code or recovery code → 7-day signed device token) |

The backup endpoints are unauthenticated at the HTTP layer (the page gating is app-side) — treat them as trusted-clinic-only, same posture as the anon key until M3.

**Admin 2FA endpoint** (`admin-otp.ts`, helpers in `_authLib.ts`, delivery channels in `_otpChannels.ts` — Telegram now, Gmail slot reserved): needs its own env family (encrypted, Cloudflare dashboard): `ADMIN_PIN`, `ADMIN_AUTH_SECRET` (HMAC key for device tokens), `ADMIN_RECOVERY_CODE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, optional `OTP_CHANNEL` (default `telegram`) — plus a **KV namespace bound as `ADMIN_AUTH`** (OTP hashes, TTL 300s; per-IP failure/send counters, TTL 1h). Missing config → `{unconfigured:true}` and the client stays PIN-only, so deploys can never lock the admin out. Local testing: same vars in `.dev.vars` + `npx wrangler pages dev dist --kv ADMIN_AUTH`. Client counterpart: `src/lib/adminOtp.ts` (device token in `localStorage.clinicmx_admin_device`).

## 3. Backup scripts (`scripts/backup/`)

Node scripts run by GitHub Actions (nightly, on `gsbanikudc-byte/Clinicmx-web` only) and runnable locally via `.env.backup`:

- `backup.mjs` — dumps all 23 tables (service-role key; needed pre-025 for RLS-restricted rows) to zipped JSON + mirrors the `patient-files` bucket → Google Drive. Daily/weekly/monthly schedules, tiered retention, verification/anomaly detection, compression+encryption.
- `restore.mjs` — dry-run by default; `--confirm` writes.
- `authorize.mjs` — one-time OAuth flow to mint the refresh token. `lib.mjs` — shared helpers.
- Full usage in `scripts/backup/README.md`. **Any change here must be pushed to both remotes.**

## 4. Google Sheets/Drive patient sync (`src/services/`)

`services/google/` (auth/drive/sheets) + `services/sync/` (appointmentSync, patientSync) — an older service-account-based sync described in `GOOGLE_INTEGRATION_SETUP.md`. **Dead code: no importers anywhere.** Superseded by the backup system. Do not build on it; do not delete without user approval.

## 5. Repository layer (target — roadmap M1/M2)

The seam everything migrates behind; PowerSync (M4) swaps repo internals without touching components.

- Location: `src/repositories/`. Existing `src/lib/` data helpers are **absorbed** into repos (become internals), not duplicated.
- **Contract:** repos accept/return plain Row shapes from `database.types.ts`; throw plain `Error`; no supabase-js client/builder types leak out. Audit calls (`logEdit`/`logDeletion`/`logActivity`) move **inside** repo write functions, preserving snapshot-before-write ordering.
- **Query keys:** one `qk` factory module (`repositories/keys.ts`): `qk.dashboard`, `qk.patients.list`, `qk.patients.bundle(id)`, `qk.appointments.day(iso)`, `qk.appointments.week(isoStart)`, `qk.clinicalTemplates`. Dates pre-formatted `yyyy-MM-dd`; never `Date` objects in keys.
- **Reads:** `useQuery` + `qk`. Page loaders are redefined as `invalidateQueries` wrappers so existing write-handler callsites stay byte-identical.
- **Writes:** plain async repo calls from existing handlers + invalidation (full `useMutation` adoption optional).
- Planned repos: `dashboardRepo`, `patientsRepo`, `appointmentsRepo`, `patientProfileRepo` (M1); then `inventoryRepo`, `treatmentsRepo`, `billingRepo`, `visitsRepo`, `dentalRepo`, `prescriptionsRepo`, `filesRepo`, `usersRepo` (M2). Done = `grep -r "from '@/lib/supabase'" src/pages src/components` returns zero.

## 6. Sync engine (target — roadmap M4)

- **PowerSync Cloud (free tier, approved)** ↔ Supabase; client `@powersync/web` + `@powersync/tanstack-react-query`; IndexedDB VFS (not OPFS).
- One global bucket over the ~19 business tables (single clinic, all authenticated users see all). Audit tables are insert-only client tables: local writes upload; nothing syncs down.
- Connector: `fetchCredentials` = Supabase session JWT (hence M3 first); `uploadData` = ordered CRUD batch via supabase-js. Conflict resolution: last-write-wins, server-authoritative.
- Reads become watched local SQL under the **same `qk` keys**; components untouched. Provisional `PT-TMP-*` / provisional invoice numbers replaced by `BEFORE INSERT` triggers at sync time.
- Full detail, spike plan, and verification drills: [OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md) §8.
