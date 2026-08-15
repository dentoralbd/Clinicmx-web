# API.md — Data Access, Serverless Functions, Sync Engine & Repository Specifications

ClinicMx has **no REST API of its own**. The client talks to Supabase directly with `supabase-js`; the only server-side code is five Cloudflare Pages Functions (four for backups, one for admin 2FA) and the GitHub-Actions backup scripts. This doc covers each surface plus the target repository-layer contract.

---

## 1. Supabase client access (current)

- Client: `src/lib/supabase.ts` — `createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`; types from `src/lib/database.types.ts`.
- **~198 direct callsites across ~30 files** (~92 selects, ~123 writes, 1 RPC, 3 storage calls). Every page fetches through a consolidated loader function (`loadDashboardData`, `loadPatients`, `loadAppointments`/`loadWeekAppointments`, `PatientProfile.loadPatientData` — an 8-query `Promise.all` re-invoked after every write). Writes are inline in page/modal handlers.
- RPC: `generate_patient_code` (via `lib/patientCode.ts`).
- Storage: `patient-files` bucket, upload/list/delete from `PatientProfile.tsx` only.
- React Query: mounted app-wide. As of branch `offline-m1` (2026-08-07), also used by `src/repositories/` for Dashboard/Patients/Appointments/patient-bundle reads (see `src/lib/queryClient.ts`, `src/repositories/keys.ts`), on top of its original use in `components/admin/UsersTab.tsx`.

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
| `lib/offlineSync.ts` (2026-08-07, branch `offline-m1`) | `enqueueMutation`/`syncMutationById`/`syncGroup`/`syncAll`/`discardMutation` — the offline outbox. Mutations optionally share a `groupId` + `seq` to sync as an ordered, all-or-blocked unit (e.g. invoice → treatment link → payment). Manual sync only — nothing auto-syncs on reconnect. Account-scoped: `getVisiblePendingMutations`/`syncVisiblePending`/`clearVisiblePending` restrict to the current session's own queued edits unless admin (`canActOn()`); `syncMutationById`/`discardMutation`/`syncGroup` all no-op for a mutation the caller isn't allowed to touch. `cleanUpOptimisticEntry(mut)` reverts a discarded insert's optimistic write to the patient bundle cache — call after every `discardMutation`/`clearVisiblePending`. See file header comments for the specific bugs this rewrite fixes vs. the redesign prototype it was ported from. |
| `lib/invoiceNumbering.ts` (2026-08-07) → `insertInvoiceWithAutoNumber` | The 3-tier auto-number-with-retry insert, extracted from `InvoiceModal`'s online submit so the offline sync path (finalizing a provisional `INV-TMP-*` invoice) uses the exact same numbering contract instead of a separate, potentially racy implementation. |
| `components/SnapshotDetails.tsx` (2026-08-08) → `SnapshotDetails` | Renders any DB row/payload as a labeled key-value list (dates formatted, id-ish keys de-emphasized to a footer line, arrays summarized). Shared by Delete History, Edit History, and Admin → Offline Edits (`components/admin/OfflineEditsTab.tsx`) — the one full-detail record view in the app. Extend this, not a local copy, if the rendering needs to change. |
| `lib/ipAccess.ts` | Per-user login network gate (`authorized_ips`): `fetchClientIp` (ipify, 3s, null on failure), `checkIpAccess`, `requestIpApproval` (never call on a denied row), admin approve/deny/remove (approve trims to 5 per user). Decisions log to `activity_log` as `ip_access`. |
| `lib/doctorProfile.ts` | Upsert + encrypted local mirror + offline fallback — the template for future repo design. |
| `lib/staff.ts` | Staff roster CRUD + monthly salary statement (generate/record/CSV/PDF export) — `calculateStaffSalarySummary()` is the one place the payroll math (`base + bonus − deduction − advance`) is computed; reused by `lib/hr.ts` rather than re-derived. |
| `lib/hr.ts` (2026-08-08) | HR & Payroll (`/hr-payroll`, admin) and My Leave (Doctor/Operator Zone) data layer, over `staff_leaves` (migration 052). `listLeaveRequests()` (admin, all rows) / `listMyLeaveRequests()` (self-service, own rows — same query, RLS does the filtering) / `createLeaveRequest()` / `decideLeaveRequest()` (admin approve/reject + `activity_log`) / `cancelMyLeaveRequest()` (own pending only). `getHRMetrics()` — pure function over already-fetched `staff`/`staff_salary_payments`/`staff_leaves` rows (no extra queries), built on `calculateStaffSalarySummary()` from `lib/staff.ts` so payroll totals can't drift between the two pages. `listHrActivity()` — `activity_log` filtered to `staff`/`staff_salary`/`staff_leave` entity types. `getMyLeaveBalance(year?)` (migration 053) — calls the `my_leave_balance` RPC (`(supabase as any).rpc(...)`, matching the untyped-RPC convention already used by `lib/patientCode.ts`/`lib/storageUsage.ts`, since this project's `database.types.ts` doesn't type `Functions`); returns `{ quotaDays, usedDays, remainingDays }` or `null` if the signed-in account isn't linked to a `staff` row. |

## 2. Cloudflare Pages Functions (`functions/api/`)

Deployed with the site; local testing via `.dev.vars` + `npx wrangler pages dev dist`. Shared Google Drive OAuth helpers in `_lib.ts`. Env (Cloudflare dashboard, encrypted): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` (same four as the nightly backup — OAuth, not a service account, because personal Gmail can't grant service accounts Drive quota).

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/upload-backup` | POST | Receives a device-backup JSON from the `/backup` page, uploads into Drive `ClinicMx Backups/device-backups`. **Requires a signed-in staff session.** |
| `/api/list-backups` | GET | Lists backups (filenames/dates/sizes only, no content) in Drive — feeds the Dashboard freshness tile and the restore-from-Drive picker. **Requires a signed-in staff session.** |
| `/api/download-backup` | GET | Streams a chosen Drive backup's actual **content** back for restore. **Requires admin auth.** |
| `/api/admin-otp` | POST | Admin login second factor: `action:'request'` (PIN + optional trusted-device token → Telegram OTP or `trusted`/`unconfigured`), `action:'verify'` (code or recovery code → 7-day signed device token) |
| `/api/queue-board` | GET | Sanitised, read-only Patient Queue feed for `dentoralbd.com/queue` (AGY repo's `functions/api/queue.js` proxies here with a shared bridge token). Reads `queue_entries`/`queue_settings` server-side with `SUPABASE_SERVICE_ROLE_KEY` and returns only what a public waiting-room board needs — the browser never sees a Supabase credential. **No auth required to call it**, but the response differs: a valid `X-Bridge-Token`/`?t=` matching `QUEUE_BOARD_TOKEN` gets the full payload (names per `queue_settings.privacy_mode`, room, procedure); a missing/invalid token gets a masked, serial-numbers-only fallback — deliberately never an error, so a wrong/missing token degrades gracefully rather than breaking the public board. Mirrors `dentoral-bridge.ts`'s cross-site bridge-token pattern in the opposite direction (there ClinicMx pulls FROM DentOral; here DentOral pulls FROM ClinicMx). |

**CORS for the Tauri desktop build (added 2026-08-08):** `functions/api/_middleware.ts` runs in front of every route above and adds `Access-Control-Allow-Origin` only for `Origin: http://tauri.localhost` / `https://tauri.localhost` — the origin the Windows exe (`D:\Claude\Clinicmx-web-redesign`, packaged with Tauri v2) serves its UI from. That lets the desktop app reach this deployment's `/api/*` for admin 2FA, Users management, and Drive backup, since it has no Functions layer of its own. All existing per-endpoint auth (PIN, device token, staff session) is unchanged — this only unblocks the cross-origin fetch at the browser/WebView2 level; every other origin gets no CORS headers and is still blocked as before.

**Auth on the backup endpoints (added 2026-07-25, Phase 1 of `SECURITY-HARDENING.md`; revised
2026-08-03):** until 2026-07-25 all three were unauthenticated at the HTTP layer and reachable by
anyone who could reach the deployed site — confirmed live (`GET /api/list-backups` returned real
backup filenames/Drive IDs with no credentials). The initial fix gated all three on
`X-ClinicMx-Auth: <trusted-device token>` (admin-only, `requireAdminToken()`).

**2026-08-03, opening Backup & Restore to operator accounts:** all three briefly swapped to
`requireStaffSession()` in `_authLib.ts` — accepts a plain `Authorization: Bearer <token>` header
carrying **any** signed-in staff member's Supabase Auth access token (admin, doctor, or operator;
verified against Supabase's own `/auth/v1/user`), the same pattern already used by
`dentoral-bridge.ts`. Same day, on reflection, `download-backup.ts` was **narrowed back to
`requireAdminToken`**: it's the one endpoint that returns actual backup content (a full database
dump), and the UI decision landed on Upload-only for operator ("Download backup" and "Restore from
a backup file" stayed admin-only in `BackupRestore.tsx`) — the API now matches that UI split.
`upload-backup.ts` and `list-backups.ts` stayed on `requireStaffSession`: upload is exactly what
operator needs, and list-backups only returns filenames/dates (no content) and is what the
operator's own Dashboard freshness tile depends on.

Admin already holds a real Supabase Auth session after PIN+2FA (minted via
`mintAdminSupabaseTokenHash`/redeemed client-side, `adminOtp.ts`), so none of this required any
change to the admin login flow — only which check each endpoint performs, and which header the
client sends it. Client-side: `src/lib/deviceBackup.ts`'s `staffAuthHeaders()` (Supabase session,
for upload/list) vs. `adminAuthHeaders()` (the `X-ClinicMx-Auth` trusted-device token, for
download) pick the right one per call. `requireAdminToken`/`X-ClinicMx-Auth` also still gates
`admin-users.ts` (Admin → Users management, genuinely admin-only) — unaffected throughout.

**Admin 2FA endpoint** (`admin-otp.ts`, helpers in `_authLib.ts`, delivery channels in `_otpChannels.ts` — Telegram now, Gmail slot reserved): needs its own env family (encrypted, Cloudflare dashboard): `ADMIN_PIN`, `ADMIN_AUTH_SECRET` (HMAC key for device tokens — also what gates the backup endpoints above), `ADMIN_RECOVERY_CODE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, optional `OTP_CHANNEL` (default `telegram`) — plus a **KV namespace bound as `ADMIN_AUTH`** (OTP hashes, TTL 300s; per-IP failure/send counters, TTL 1h). Missing config → `{unconfigured:true}`; in production this now **hard-fails** the login (see `CLINICMX-GPT.md` §3) rather than silently falling back to PIN-only — confirmed live that all of these vars are actually set, so a future `unconfigured` response in production means something broke and should be loud. Local dev (plain `npm run dev`, no Functions layer) still gets PIN-only, gated on `import.meta.env.DEV`. Local Functions testing: same vars in `.dev.vars` + `npx wrangler pages dev dist --kv ADMIN_AUTH`. Client counterpart: `src/lib/adminOtp.ts` (device token in `localStorage.clinicmx_admin_device`).

**Patient Queue board env (added 2026-08-15):** `queue-board.ts` reuses the existing
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` secrets (already set for `admin-otp.ts`) plus a new
`QUEUE_BOARD_TOKEN` secret, set as an encrypted var in **both** Cloudflare Pages projects
(ClinicMx and the DentOral/AGY project — env changes need a **redeploy** to reach an already-built
deployment, as with every other secret here). Local testing: add `QUEUE_BOARD_TOKEN` to
`.dev.vars` alongside the other secrets, `npx wrangler pages dev dist`.

## 3. Backup scripts (`scripts/backup/`)

Node scripts run by GitHub Actions (nightly, on `gsbanikudc-byte/Clinicmx-web` only) and runnable locally via `.env.backup`:

- `backup.mjs` — dumps all 29 tables (service-role key; needed pre-025 for RLS-restricted rows) to zipped JSON + mirrors the `patient-files` bucket → Google Drive. Daily/weekly/monthly schedules, tiered retention, verification/anomaly detection, compression+encryption.
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
