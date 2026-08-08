# ClinicMx — Offline & Android Roadmap

**Status update (2026-08-07):** M1 (PWA + offline viewing), M2 (repository layer for the read/write paths covered below), and a working M4-equivalent (offline writes) have been implemented on branch `offline-m1`, ported from a prototype built in the sibling `Clinicmx-web-redesign` clone and hardened against several bugs found in that prototype during review (silent mutation loss on concurrent sync, an invoice schema-fallback that dropped the client-generated id and orphaned queued payments, offline invoices never linking their treatments server-side, and more — see `src/lib/offlineSync.ts` comments). **Supersedes §8 below: the sync engine is a custom IndexedDB outbox (`src/lib/offlineSync.ts`), not PowerSync** — PowerSync was evaluated in the redesign prototype but never actually wired up there, so this build didn't adopt it either. **M3 (Supabase Auth + RLS) was already live in production before this work started**, so it wasn't a blocker. Sync is **manual-only**: nothing uploads until a user presses Approve & Sync on `/offline-outbox` (Sidebar → Patients → Verify Offline Edits). **Approval is account-scoped** — a doctor/operator can only sync/discard their own queued edits; admin can act on anyone's, both from that page and from a dedicated **Admin zone → Offline Edits** audit log (styled like Delete/Edit History, not a copy of `/offline-outbox`). Write coverage: treatments, invoices, payments, delete/edit audit logs, patient visits, and new prescriptions — see FEATURES.md §1b "Offline support" for the exact behavior contract and known gaps (patient add/edit, appointments, dental chart, files, lab, and prescription *edits* still require network). Not yet merged to `main` — awaiting user review/testing per the branch's own verification plan.

**Status:** Approved plan, implementation not started. **Date:** 2026-07-17.
**Purpose:** The authoritative, codebase-grounded implementation roadmap for making ClinicMx offline-first and installable on Android. Written to be handed to a future AI/developer session and executed milestone by milestone.
**Supersedes:** `PRODUCT-ROADMAP.md` and `CLINICMX-GPT.md` (ChatGPT drafts). Consistent with and extends `CLINICMX.md` §14 (which remains the broader technical reference for the app itself).

**User decisions recorded 2026-07-17:**
1. Plan document first; implementation of M1 starts only when the user says go.
2. **PWA first; Capacitor APK only if concrete problems appear** (camera/QR trouble, Android evicting offline storage, need for encrypted native storage).
3. **Unencrypted on-device cache accepted for now** (personal, screen-locked devices). Encryption upgrade path lands with the PowerSync/Capacitor phases.
4. **PowerSync Cloud (free tier) approved** as the sync-engine backend for M4.

---

## 1. Goal

A phone-installable ClinicMx that opens with no internet and shows patient data chairside, evolving in safe, independently shippable milestones toward full offline read/write:

```
React UI → Repository layer → Local DB (React Query cache now, SQLite/PowerSync later) → Sync → Supabase
```

Milestone order (M1 delivers the visible win first; §14's phase 1/2 order is deliberately swapped — harmless architecturally):

| Milestone | Outcome | Effort | Touches live DB? |
|---|---|---|---|
| M0 Prep | typecheck script, branch | S | No |
| **M1 PWA + offline viewing** | Installable app, opens offline, views cached data | M | No |
| M2 Repository layer complete | All ~198 Supabase callsites behind one seam | L | No |
| M3 Supabase Auth + real RLS | Anon key harmless; JWT prerequisite for sync | M–L | **Yes (staged)** |
| M4 PowerSync offline writes | Full offline operation, auto-sync | L | **Yes (staged)** |
| M5 Capacitor APK | Native wrapper — **conditional, may never be needed** | M | No |
| M6 Features | Per CLINICMX.md §14 Phase 6, reorder by clinic need | — | Varies |

---

## 2. Locked decisions

Inherited from CLINICMX.md §14:
- **PowerSync**, not a hand-rolled sync engine. Last-write-wins conflict resolution is acceptable for a small clinic.
- Do **not** pre-add `version`/`sync_status` columns (PowerSync tracks its own state). Soft-delete `deleted` flag deferred until a concrete need appears.
- `patient_code` and `invoice_number` are server sequences → **provisional codes replaced at sync time** (design in M4).
- **Supabase Auth + RLS before PowerSync** (sync auth needs JWTs).
- Browser = PowerSync Web SDK; Android = Capacitor. The repository layer hides the difference.
- Business data moves out of localStorage into the DB (M4).

New decisions made in this plan:
- **Silent service-worker auto-update** (`registerType: 'autoUpdate'`) — matches the app's existing "reload picks up the new build" philosophy. The `vite:preloadError` reload listener gets a **loop guard**, not removal.
- **React Query persistence to IndexedDB** (`@tanstack/query-async-storage-persister` + `idb-keyval`) with a **manual cache-buster constant** — never per-deploy, which would wipe the offline cache on every push.
- New **`src/repositories/`** folder is the PowerSync swap seam; existing `src/lib/` data helpers become repo internals (absorbed, not duplicated). One `qk` query-key factory module.
- **M1 converts reads only.** Writes stay untouched and fail loudly offline; the offline banner sets expectations.
- **M3 auth shape:** all roles become Supabase Auth users; staff get synthetic emails from their identifier; permissions stay in `app_users`, joined in RLS via SECURITY DEFINER helpers (no custom JWT claims). Admin PIN survives as the offline unlock / encryption-key gate layered over a persisted Supabase session.
- **M4 storage:** PowerSync **IndexedDB VFS** (default), not OPFS — avoids COOP/COEP headers that could break cross-origin Supabase images. Audit tables (`activity_log`, `edit_history`, `delete_history`) become **insert-only client tables**: local writes upload, nothing syncs down.
- **Provisional numbering is server-assigned:** `BEFORE INSERT` triggers assign the real `patient_code`/`invoice_number` when the incoming value is provisional. No device-prefixed numbering (ugly forever).
- **M5 is conditional** (user decision) — see its trigger list. PWABuilder/TWA: skip (same Chrome storage semantics; only relevant if a Play Store listing is ever wanted).
- Feature branch per milestone; page-per-commit; merge to `main` **only after user verification** (pushing `main` = deploying production via Cloudflare Pages).

---

## 3. Verified starting state (codebase recon, 2026-07-17)

Recorded so future sessions don't re-derive it. All paths relative to `D:\Claude\Clinicmx-web`.

- Plain Vite 5 + React 18 + TypeScript (strict) SPA. **No** manifest, service worker, PWA plugin, or Capacitor anywhere. Single icon `public/logo.png` (1.1 MB, also the favicon; a duplicate unused `logo.png` sits at repo root). Bare `index.html`. `netlify.toml` is legacy (site is on Cloudflare Pages; its `/dist/*` cache rules match nothing actually served). No `_headers` file.
- `src/main.tsx` registers `window.addEventListener('vite:preloadError', () => window.location.reload())` — an **unconditional reload**. Hazard: can loop once a service worker exists; must gain a guard in M1.
- `src/App.tsx`: `new QueryClient()` fully default; `BrowserRouter`; every page lazy-loaded except Login; `ProtectedRoute` + per-page `RequirePage` guards.
- **~198 direct Supabase callsites across 30 files** (~92 selects, ~123 writes, 1 rpc `generate_patient_code`, 3 storage calls — all three in PatientProfile.tsx). React Query is installed and mounted but used by exactly one component (`components/admin/UsersTab.tsx`).
- **The key enabler:** every page fetches through consolidated loader functions — `Dashboard.loadDashboardData()`, `Patients.loadPatients()`, `Appointments.loadAppointments()`/`loadWeekAppointments()`, and `PatientProfile.loadPatientData()` (defined once at `src/pages/PatientProfile.tsx:455`: an 8-query `Promise.all` + payments follow-up + 9 state setters, re-invoked at ~19 write callsites). Reads convert to React Query with near-zero JSX changes by redefining each loader as a cache-invalidation wrapper.
- Existing proto-repositories in `src/lib/` to absorb (not replace): `entityTables.ts` (keystone: `ENTITY_TABLE_COLUMNS` registry + `sanitizeSnapshot`), `patients.ts` (create + search; update/delete still inline in pages), `patientCode.ts`, `payments.ts` (`recordInvoicePayment`), `invoiceSync.ts`, `editHistory.ts`/`deleteHistory.ts` (snapshot-first audit), `activityLog.ts` (fire-and-forget, swallows failures), `appUsers.ts`, `doctorProfile.ts` (best template: remote upsert + local encrypted mirror + offline fallback).
- Client-only business data with **no Supabase column today**: doctor-profile `logo_data` (encrypted localStorage), prescription section templates (encrypted localStorage), prescription autocomplete memory (plaintext localStorage). Moves to DB in M4.
- Auth: admin PIN compared client-side → **admin login works offline by construction**. Doctor/operator login queries `app_users` → needs network until M3. The sessionStorage AES key dies when the tab closes, so an offline cold start always lands on Login; the admin PIN path works there.
- Manifest theme colors verified in `tailwind.config.cjs`: primary `#0D9488`, background `#F0FDFB`.
- Dead code (do **not** remove without user approval): `src/routes.tsx` + `src/pages/DentalChart.tsx` (only imported by routes.tsx); `src/services/` (Google Sheets sync) has no importers.
- Hygiene: npm scripts are dev/build/preview only (no typecheck/lint/test); no test suite; working tree clean on `main`.

---

## 4. M0 — Prep (effort: S)

1. `package.json`: add `"typecheck": "tsc --noEmit"`.
2. Create branch `offline-m1`.

**Verify:** `npm run typecheck` passes on the untouched tree (baseline). May be folded into the first M1 commit.

---

## 5. M1 — Installable PWA + offline read cache (effort: M — the fast visible win)

**Outcome:** Chrome on Android offers "Install app". In airplane mode the installed app launches, admin PIN login works, and Dashboard / Patients / Appointments / full Patient Profile render the last-synced data with an amber "Offline — showing saved data" banner. Writes offline fail with the existing error messages (honest, expected).

### Packages

```
npm i @tanstack/react-query-persist-client @tanstack/query-async-storage-persister idb-keyval
npm i -D vite-plugin-pwa sharp
```

(Persist packages must match installed react-query ^5.17. `sharp` is only for the one-off icon script.)

### Steps

1. **Icons** — new `scripts/generate-icons.mjs` (run once, outputs committed) from `public/logo.png` into `public/icons/`: `icon-192.png`, `icon-512.png`, `maskable-512.png` (logo at ~66% safe zone on `#F0FDFB`), `apple-touch-icon.png` (180×180 opaque). Keep `public/logo.png` untouched (Login page and PDF letterhead reference it). Favicon link → `/icons/icon-192.png`.

2. **`vite.config.ts`** — add `VitePWA({...})` to plugins:
   - `registerType: 'autoUpdate'`
   - manifest: name `ClinicMx - Dental Clinic Management`, short_name `ClinicMx`, `theme_color '#0D9488'`, `background_color '#F0FDFB'`, `display 'standalone'`, `start_url '/'`, icons incl. maskable.
   - workbox: `navigateFallback '/index.html'`, `cleanupOutdatedCaches: true`, `globIgnores: ['design-preview/**']`, `maximumFileSizeToCacheInBytes: 3 * 1024 * 1024` (default 2 MiB would silently skip the 1.1 MB logo → broken image on offline Login), and **no `runtimeCaching` for `*.supabase.co`** — React Query owns data offline; never SW-cache API/auth responses.

3. **`index.html`** — add `<meta name="theme-color" content="#0D9488">` and apple-touch-icon link; favicon → icon-192. (Manifest link injected by the plugin.)

4. **`public/_headers`** (new; Cloudflare Pages):
   ```
   /*
     Cache-Control: no-cache

   /assets/*
     ! Cache-Control
     Cache-Control: public, max-age=31536000, immutable

   /icons/*
     ! Cache-Control
     Cache-Control: public, max-age=604800
   ```
   Hashed assets immutable; `index.html`/`sw.js`/`manifest.webmanifest` revalidate every load — this is what makes `autoUpdate` reliable. Keep `public/_redirects` as-is.

5. **`src/main.tsx`** — register the SW and guard the reload listener:
   ```ts
   import { registerSW } from 'virtual:pwa-register'
   registerSW({ immediate: true })

   const RELOAD_AT = 'clinicmx_chunk_reload_at'
   window.addEventListener('vite:preloadError', (event) => {
     const last = Number(sessionStorage.getItem(RELOAD_AT) || '0')
     if (Date.now() - last < 60_000) return   // max one recovery reload per minute — kills loops
     sessionStorage.setItem(RELOAD_AT, String(Date.now()))
     event.preventDefault()
     window.location.reload()
   })
   ```
   Add `/// <reference types="vite-plugin-pwa/client" />` to `src/vite-env.d.ts`.

6. **`src/lib/queryClient.ts`** (new) — exported `queryClient` (`staleTime 30_000`, `gcTime` 7 days, `retry 2`; default `networkMode 'online'` means offline mounts render persisted data while fetches pause), `CACHE_BUSTER = 'v1'` (bump **only** when a queryFn's return shape changes), and an idb-keyval-backed `createAsyncStoragePersister` (key `clinicmx-query-cache`, `throttleTime 2000`).

7. **`src/App.tsx`** — replace `QueryClientProvider` with `PersistQueryClientProvider`, options `{ persister, maxAge: 7 days, buster: CACHE_BUSTER, dehydrateOptions: { shouldDehydrateMutation: () => false } }`. Mutations are never persisted — there is no offline write queue in M1, by design.

8. **Repositories** (new; reads moved **verbatim**, no query changes):
   - `src/repositories/keys.ts` — `qk` factory (`qk.dashboard`, `qk.patients.list`, `qk.patients.bundle(id)`, `qk.appointments.day(iso)`, `qk.appointments.week(isoStart)`, `qk.clinicalTemplates`). Dates pre-formatted `yyyy-MM-dd`; never Date objects in keys.
   - `dashboardRepo.ts`, `patientsRepo.ts`, `appointmentsRepo.ts`, `patientProfileRepo.ts` (`fetchPatientBundle(id)` = the existing 8-query Promise.all + payments; `fetchClinicalTemplates()`).
   - Contract: repos return plain row data and throw plain `Error`s — no supabase client/builder types leak to pages. That contract is the whole PowerSync swap seam.

9. **Page conversions** (zero-JSX-change pattern):
   - **Dashboard.tsx**: one `useQuery`; `loading = isPending`; Refresh → `refetch()`.
   - **Patients.tsx**: list via `useQuery`; **redefine `loadPatients()` as an `invalidateQueries` wrapper** so every write-handler callsite stays byte-identical.
   - **Appointments.tsx**: two date-keyed `useQuery`s (key change replaces the `[selectedDate]` effect); loaders become invalidate wrappers.
   - **PatientProfile.tsx** (5,872 lines — handled surgically): one bundle `useQuery` (`enabled: !!id`) + one hydration `useEffect` calling the existing 9 setters; **redefine `loadPatientData` as an async invalidate wrapper** so all ~19 existing callsites are untouched. Templates as a second query (`staleTime` 10 min). Total diff ≈ 40 lines at the top of the file; zero JSX, zero write-handler, zero form-state changes.
   - Prescriptions page: **untouched in M1** (its patient-selection flow is frozen by working agreement).

10. **Offline UI** — `src/lib/useOnlineStatus.ts` via `useSyncExternalStore` over React Query's `onlineManager` (the same signal that pauses fetches, so the banner and behavior can't disagree); amber strip in `DashboardLayout.tsx`: *"Offline — showing saved data. Changes can't be saved until you're back online."*

11. **Storage persistence request** — call `navigator.storage.persist()` once at startup (cheap insurance against Android evicting site storage; its result feeds the M5 decision).

### Behavior deltas to flag to the user (both improvements)
- Refetch-after-write no longer flashes the full-page loading skeleton — data updates in place.
- Returning focus to the tab/app triggers a background refresh (React Query default) — useful in a multi-device clinic; cannot clobber in-progress form state.

### Known M1 limits (accepted)
- Staff (doctor/operator) login requires network until M3. Admin PIN works offline.
- Patient photos / X-rays (Supabase Storage URLs) are not offline yet (optional runtime cache in M2).
- Cached data is unencrypted in IndexedDB (user-accepted; encryption arrives with M4/M5).

### Verification
1. `npm run typecheck && npm run build`.
2. `npm run preview` → login → browse all four converted pages + one patient profile → **kill the preview server** → reload → shell and data still render (true SW test, no DevTools needed). Iterate with DevTools Network "Offline".
3. Online write regression: patient add/edit/delete; appointment create/status-change; visit, prescription, invoice, payment on PatientProfile — every list must refresh after the write (proves the invalidate wrappers).
4. Deploy → spot-check headers (`curl -I` on `/`, `/sw.js`, an `/assets/*.js`) → on the phone: install prompt, airplane mode, launch, PIN login, browse cached patients.
5. Push a second trivial change → installed app self-updates without a reload loop.

**Gate to M2:** ~1 week of chairside use; ≥2 deploys with no update loops; offline viewing confirmed on the real phone.

---

## 6. M2 — Finish the repository layer (effort: L)

**Outcome:** invisible (that's the point). All ~198 callsites live behind `src/repositories/`; `grep -r "from '@/lib/supabase'" src/pages src/components` returns **zero**. The seam PowerSync swaps into is complete.

Order (one page per commit; app working at every commit; risk-ascending):
1. Conventions doc (`docs/REPOSITORIES.md`): repos take/return `database.types.ts` Row shapes; throw `Error`; audit calls (`logEdit`/`logDeletion`/`logActivity`) move **inside** repo write functions preserving snapshot-before-write ordering; reads = `useQuery` + `qk`; writes = plain async repo calls from existing handlers + invalidation (full `useMutation` adoption optional).
2. **Inventory** (~8 callsites) → `inventoryRepo`.
3. **Treatments** (~9) → `treatmentsRepo`; absorb `invoiceSync.ts`.
4. **Billing + InvoiceModal + payment modals** (~28 across files) → `billingRepo`; absorb `payments.ts` and invoice-settings access.
5. **PatientProfile writes** (~55 callsites) → split by domain: `visitsRepo`, `dentalRepo`, `prescriptionsRepo`, `filesRepo` (the 3 storage calls), reusing `treatmentsRepo`/`billingRepo`. Several commits, one tab-domain each.
6. **Prescriptions page LAST, reads-only re-plumbing** — identical queries moved behind `prescriptionsRepo`, identical UX, extra manual pass on the frozen patient-selection flow.
7. Remainders: Patients/Dashboard/QrSearch/DoctorProfile; absorb `patients.ts` (add `updatePatient`/`deletePatient` from the inline page logic); `patientCode.ts` becomes internal to `patientsRepo`; `appUsers.ts` re-exported as `usersRepo`.
8. Optional (recommended): workbox `runtimeCaching` CacheFirst for the Supabase storage host (maxEntries ~100, 30 days) → photos viewable offline after first view.

**Risks:** write-path regressions (mitigate: verbatim moves + per-page regression checklist covering create/edit/delete/print per entity); audit ordering must stay snapshot-first; the Prescriptions flow.
**Gate to M3:** boundary grep clean; full regression pass; a week of normal production use.

---

## 7. M3 — Supabase Auth + real RLS (effort: M–L; first milestone touching the DB; staging-first)

**Outcome:** the anon key becomes harmless (today it grants full DB read/write to anyone who extracts it from the JS bundle); every query runs as an authenticated user; PowerSync's JWT prerequisite is satisfied. Staff can cold-start offline once signed in (session persists in localStorage).

1. **Staging:** create a second free Supabase project; restore the latest nightly backup into it via the existing `scripts/backup/restore.mjs` (dry-run first; if the script is hardwired to prod, parameterizing the target is a small approved change). Point a local `.env` at staging.
2. **Identities:** admin → real Auth user (the dentist's email); doctor/operator → Auth users with synthetic emails derived from their identifier (e.g. `<phone>@staff.clinicmx.local`). PBKDF2 hashes cannot port into GoTrue → **re-create the 2–3 staff accounts manually** (minutes, zero migration code). `app_users` gains `user_id uuid references auth.users`; password columns retire from active use. Admin PIN remains as the offline unlock + encryption-key gate on top of the persisted session. *(Confirm identity details with the user at M3 kickoff.)*
3. **Migration 026:** enable real RLS on all 23 tables; SECURITY DEFINER helpers `current_app_user()`/`current_app_role()` reading `app_users` by `auth.uid()` (active accounts only); base policy = any active authenticated user gets select/insert/update (the goal is "no anonymous access", not intra-staff secrecy); deletes gated on admin/`can_delete`; storage policies on the `patient-files` bucket; revoke anon on everything incl. the `generate_patient_code` RPC.
4. **`Login.tsx` rework ships in the same deploy as the migration** (the current pre-auth `app_users` lookup is the first thing RLS breaks): staff → `signInWithPassword` then load permissions row; admin → PIN unlock if a session exists (offline-capable), else email+password once per device. Same three-role selector UI.
5. **UsersTab:** permissions editing keeps working; account creation/password reset needs service-role → interim procedure = Supabase dashboard (documented); optional tiny Edge Function later.
6. **Cutover (user sign-off, quiet hours):** fresh manual backup → apply migration → create prod auth users → deploy → verify each role → keep a written rollback (`ALTER TABLE … DISABLE ROW LEVEL SECURITY` for all tables + app revert).

**Risky bits:** locking yourself out (test with bare-anon-key curl + each role on staging first); storage policies breaking photo upload/view; backup job must stay green (it uses the service role — verify after cutover).
**Gate to M4:** ≥1 week on RLS with no access errors; anon-key curl returns zero rows on every table.

---

## 8. M4 — PowerSync: offline writes (effort: L; the big one)

**Outcome:** local SQLite on-device; reads become watched local queries; writes work offline (create patients, visits, prescriptions, invoices in airplane mode) and upload automatically on reconnect; sub-second page loads.

**Go/no-go spike first (1–2 days, staging only, throwaway):** PowerSync Cloud instance ↔ staging Supabase (publication + dedicated replication role — **verify the free-tier IPv6-only direct-connection question against PowerSync's current Supabase guide**); Supabase JWT auth into PowerSync; initial full-dataset sync on the actual phone (measure size/duration — a solo clinic's tables should be trivially small); write→server→second-device round-trip latency. If any leg fails hard: reassess (self-hosted PowerSync, or stay M1–M3 read-offline).

1. **Sync rules:** one global bucket (single clinic, all authenticated users see all) over the ~19 business tables. **Audit tables (`activity_log`, `edit_history`, `delete_history`) = insert-only client tables** — local inserts flow up the upload queue; nothing syncs down (they grow unbounded and are only read in the online Admin zone). This is also the answer to "what do the audit helpers do offline": they queue like any write.
2. **Client:** `@powersync/web` + `@powersync/tanstack-react-query`; AppSchema mirrored from `database.types.ts` (leverage `entityTables.ts`); **IndexedDB VFS**; wasm assets join the SW precache (+~1–1.5 MB; keep total precache under ~6 MB).
3. **Connector:** `fetchCredentials` = Supabase session token; `uploadData` = ordered CRUD batch → supabase-js. LWW is server-authoritative on the next sync-down (accepted).
4. **Repo swap:** reads become watched local SQL via PowerSync's TanStack bindings under the **same `qk` keys** — components untouched (the M2 payoff). Writes become instant local executes. Retire the M1 IndexedDB persister for PowerSync-backed keys (bump `CACHE_BUSTER`).
5. **Provisional numbering (schema change — user sign-off, staging-first):** `BEFORE INSERT` trigger on `patients` assigns the real code from the existing sequence when `patient_code` is NULL or `LIKE 'PT-TMP-%'`; offline clients insert `PT-TMP-<uuid8>` rendered visibly provisional until sync replaces it. Same pattern for `invoice_number` via the `invoice_settings` counter under a row lock (concurrent offline devices cannot collide — the entire justification for server-side assignment). The client-side `ensurePatientCode` RPC path retires so exactly one assignment path exists. UX: codes finalize seconds after reconnect; printing an unsynced invoice shows "PROVISIONAL".
6. **localStorage business data → DB (schema additions — sign-off):** `doctor_profiles.logo_data text`; new `prescription_section_templates` table (section, items jsonb, scope); autocomplete memory → small table (recommended). `doctorProfile.ts`'s mirror pattern collapses into a plain repo read once PowerSync is the local store.
7. **Encryption fast-follow:** evaluate PowerSync web encryption keyed from the PIN-derived key (upgrades the accepted unencrypted posture).

**Verification:** staging two-phone drill — both offline, both create patients+visits+invoices, reconnect → converged data, unique codes/numbers, audit rows landed; kill-app-mid-sync recovery; then production enablement (publication + triggers + deploy) with a fresh backup and sign-off.
**Gate to M5:** two weeks of daily offline-write production use without manual data repair.

---

## 9. M5 — Capacitor APK (effort: M; CONDITIONAL)

**Build only if a trigger fires** (assess after M4 bake-in):
(a) Android evicts site storage despite `navigator.storage.persist()`; (b) html5-qrcode camera flow unreliable in the installed PWA; (c) hard durability/encrypted-native-SQLite requirement.

If triggered:
1. `@capacitor/{core,cli,android}`; `npx cap init` (appId `com.clinicmx.app`), `webDir: 'dist'`, default `androidScheme: 'https'` → app served from `https://localhost` origin, so BrowserRouter/localStorage/supabase-js behave — **smoke-build first to confirm**.
2. PowerSync in the WebView: keep `@powersync/web` with **multi-tab disabled** (no SharedWorker in Android WebView — documented PowerSync limitation); IndexedDB VFS works. Optional: native SQLite adapter + encryption if (c) drove the milestone.
3. Camera: `CAMERA` permission in AndroidManifest + verify Capacitor's bridge grants `getUserMedia` to html5-qrcode; small MainActivity override if not.
4. PDF/share: route `sharePdf.ts`/`domToPdf.ts` through `@capacitor/filesystem` + `@capacitor/share` behind `Capacitor.isNativePlatform()` (single adapter module; page code untouched).
5. Signing: generate a keystore and **store it safely — losing it means the APK can never be updated**; `assembleRelease`; sideload to clinic devices. Each app update = rebuild + reinstall; the PWA remains the primary channel.

**Gate:** the dentist prefers the APK over the PWA in daily use; otherwise archive the branch — the PWA is the product.

---

## 10. M6 — Feature layer (pointer)

Only after the foundation: inventory auto-deduction, per-tooth timeline, drug-interaction/allergy checks, expense tracking/cashbook, WhatsApp/SMS invoices & reminders, AI modules (assist only, never auto-apply clinical decisions), image uploads re-enabled with client-side compression, multi-clinic `clinic_id` scoping last. See CLINICMX.md §14 Phase 6. Reorder freely by clinic need — nothing here blocks the architecture.

---

## 11. Cross-cutting rules

- **Always-working app:** feature branch per milestone; page-per-commit conversions; merge to `main` only after user verification (main auto-deploys to production).
- **Verification ladder per milestone:** `npm run typecheck` → `npm run build` → dev-server manual flows → offline recipe (build + preview → load + login → kill preview server → reload) → **real acceptance = airplane mode on the dentist's phone**.
- **DB safety:** every schema-touching step (M3 RLS, M4 triggers/tables) runs staging-first off the nightly backups, needs explicit user sign-off, and lands with a fresh manual backup + a written rollback. Any change to `scripts/backup/` or `.github/workflows/backup.yml` must be pushed to **both** remotes (`gsbanikudc-byte/Clinicmx-web` runs the real scheduled job).
- **Privacy posture:** unencrypted device cache accepted (user decision 2026-07-17) until the M4/M5 encryption step.
- **Scope discipline:** `sk-dental` is frozen — none of this touches it. No unrequested feature/behavior changes; the Prescriptions patient-selection flow is explicitly frozen.
- **Bundle watch:** current precache ~2.5–3 MB (incl. the 1.1 MB logo); M4 adds ~1–1.5 MB wasm; keep total under ~6 MB.

---

## 12. Suggestions needing user approval (NOT in scope until approved)

- Delete legacy `netlify.toml` (site is on Cloudflare Pages; its cache rules match nothing).
- Remove dead code: `src/routes.tsx` + `src/pages/DentalChart.tsx`; unimported `src/services/` Google Sheets sync + `GOOGLE_INTEGRATION_SETUP.md`.
- Remove the duplicate root-level `logo.png` (~378 KB; `public/logo.png` is the served one).
- Add minimal ESLint + `lint` script.
- "Last updated <time>" stamp on the Dashboard when offline.

---

## 13. How to resume

To start implementation, tell a Claude Code session: **"Start M1 from OFFLINE_ROADMAP.md"** (it begins with M0+M1 on branch `offline-m1`). Each milestone ends with its Gate criteria; do not start the next milestone until the gate is met and the user agrees.
