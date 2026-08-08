# CLAUDE.md — Claude Code Development Instructions (Clinicmx-web)

Repo-level instructions for AI-assisted development. The workspace-level `D:\Claude\CLAUDE.md` (not committed here) covers the two-repo workspace; this file is self-contained for working inside Clinicmx-web. Doc set index: [CLINICMX.md](CLINICMX.md).

## Hard rules

1. **The Supabase database is LIVE PRODUCTION data** (`https://mgzmxnkrbdawymdviclv.supabase.co`, real patients of a real clinic). Local dev connects straight to it. Normal app usage is fine; anything data-modifying beyond that (migrations, manual writes/deletes, scripts) is high-risk — staging-first, explicit user sign-off, fresh backup, written rollback. See [DATABASE.md](DATABASE.md).
2. **Scope discipline:** implement exactly what was asked. Never touch, "improve", refactor, or consolidate existing features that weren't part of the request — even if related or convenient. Surface suggestions instead. (A 2026-06-29 over-scoped change broke a working flow; this rule is the consequence.)
3. **The Prescriptions page patient-selection flow is frozen.** Don't modify it without an explicit request.
4. **`sk-dental` (sibling repo) is frozen** — never port changes there unless explicitly asked.
5. **Pushing `main` deploys production** (Cloudflare Pages). Make changes locally, let the user review, push only when the user says so. Merge to `main` only after user verification.
6. ~~Backup-system changes go to two remotes~~ — **retired 2026-07-20: the `gsbanikudc-byte/Clinicmx-web` scheduled GitHub Actions backup is disabled by user decision; the in-app Backup & Restore page (`/backup`) is now the primary backup mechanism.** Changes under `scripts/backup/` or `.github/workflows/backup.yml` only need the normal push to `dentoralbd/Clinicmx-web`.
7. **Dead code stays until the user approves removal:** `src/routes.tsx` + `src/pages/DentalChart.tsx`, `src/services/` (Google sync, unimported), `netlify.toml`, duplicate root `logo.png`.
8. **Test patients must not consume real `PT-1xxxxx` numbers.** Deleting a patient never frees its number (`patient_code_seq` is a plain sequence) — test patients created and deleted during verification permanently push the next real patient's number forward (this happened 2026-07-22, fixed by migration 037). Before creating any test patient in the live DB, bump the sequence out of the real range; after deleting the test data, reset it back to the real current max. Ask the user to run in the Supabase SQL editor:
   ```sql
   -- before testing (test patients land at PT-300001+)
   SELECT setval('patient_code_seq', 200000, true);
   -- after testing + deleting the test patients
   DO $$ DECLARE highest bigint; BEGIN
     SELECT COALESCE(MAX(SUBSTRING(patient_code FROM 4)::bigint - 100000), 0) INTO highest
       FROM patients WHERE patient_code ~ '^PT-[0-9]+$' AND SUBSTRING(patient_code FROM 4)::bigint < 300000;
     PERFORM setval('patient_code_seq', highest, true);
   END $$;
   ```
   The `consultation_code_seq`/`CO-` series doesn't need this — migration 036 already recomputes from live `MAX()`, so it self-corrects once test consultations are deleted.

## Commands

```bash
npm install        # required once before dev server works
npm run dev        # Vite dev server (workspace launch.json pins port 5173)
npm run build      # production build — ALWAYS run before declaring a change done
npm run preview    # serve the build locally
npx tsc --noEmit   # typecheck (no npm script yet; adding one is roadmap M0)
```

No tests, no linter. Verification = typecheck + build + manually exercising the affected flow in the dev server (login PINs below).

## Login (app-level gate, not Supabase)

- Admin PIN: see `VITE_ADMIN_PASSWORD` in `.env` (must match `ADMIN_PIN` in the Cloudflare dashboard / `.dev.vars`). Doctor/Operator accounts live in the `app_users` table (created via DoctorProfile → Admin zone → Users).
- **Admin 2FA (2026-07-19):** once the Cloudflare secrets are set, an unknown device also needs a Telegram OTP after the PIN (7-day trusted-device token afterward; recovery code as fallback). Unconfigured/local dev = PIN-only. Endpoint `functions/api/admin-otp.ts`; secrets + `ADMIN_AUTH` KV binding live in the Cloudflare Pages dashboard (see API.md §2). The `ADMIN_PASSWORD` constant in Login.tsx must stay — it derives the secure-storage encryption key for every role.

## Environment

- `.env` (gitignored, already present): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. All `VITE_` vars are bundled client-side.
- Cloudflare Pages Functions local testing: `.dev.vars` (gitignored) + `npx wrangler pages dev dist`.
- Backup scripts run locally via `scripts/backup/.env.backup` (gitignored, fully configured). Restore is dry-run unless `--confirm`.

## Sync-in-lockstep gotchas (each has bitten before or will)

- **Schema change → three files:** the SQL migration in `supabase/migrations/`, `src/lib/database.types.ts` (hand-maintained), and `src/lib/entityTables.ts` (`ENTITY_TABLE_COLUMNS`, if the entity is audit-tracked). See [DATABASE.md](DATABASE.md) for migration conventions.
- **New `app_users` column → also grant it, same migration.** `app_users` uses column-level grants (`REVOKE ALL` + an explicit `GRANT SELECT (...)` allow-list, not a table-wide grant — see DATABASE.md §3), so `ALTER TABLE app_users ADD COLUMN` alone leaves the column invisible to `authenticated`. Found out live 2026-08-02: shipped a new column without its grant, broke the Users tab + doctor roster load in prod with `permission denied for table app_users` (not a column-specific message — easy to misdiagnose as an RLS regression) until a follow-up migration added the grant.
- **New drug category → three places:** the `category` union in `src/lib/dentalDrugDatabase.ts`, plus `CATEGORY_META` and `CATEGORY_ORDER` in `src/components/DrugPicker.tsx`. Missing either DrugPicker list makes those drugs invisible in the default dropdown (happened with Antifibrinolytic).
- **Audit ordering:** `logEdit`/`logDeletion` must snapshot the row **before** the write, or restore breaks.
- **Any new PDF "download" → `sharePdf()`, never `jsPDF.save()`** (2026-08-01) — the app also ships as a native Android APK with no download handler; `.save()` silently does nothing there. See UI-UX.md §7 for the full pattern; found three PDF generators that skipped it and were broken in the app.
- `main.tsx`'s `vite:preloadError` reload is now loop-guarded (max once/minute) — landed as part of the offline-m1 PWA work (2026-08-07), no longer an open item.
- **Offline outbox (2026-08-07, branch `offline-m1`):** any new write path added to `PatientProfile.tsx`/`InvoiceModal.tsx` that should work offline needs an explicit `if (!navigator.onLine) { ... } else { ... }` branch calling `enqueueMutation` from `src/lib/offlineSync.ts` — there's no automatic interception of `supabase.from(...)` calls. Dependent mutations (e.g. an insert another mutation's row references) must share a `groupId`/`seq` or they can sync out of order. Approval is account-scoped (`canActOn()`) — a mutation's `meta`/`actor` fields aren't cosmetic, they gate who can sync/discard it. See FEATURES.md §1b for what's covered today and OFFLINE_ROADMAP.md's status note for the full picture.
- **`supabase.from(...)` never rejects on a network failure (2026-08-08).** `@supabase/postgrest-js` catches the fetch rejection and *resolves* with `status: 0` and `error.message` **prefixed** (`"TypeError: Failed to fetch"`, not the bare string). Any `catch`-only offline detection, and any `err.message === 'Failed to fetch'` / `err.name === 'TypeError'` test, is dead code — it silently never matches, which is exactly what broke two earlier "fix the offline dropdown/save" attempts. Route on the **resolved** `error`/`status` via `isOfflineFailure()` in `src/lib/supabaseErrors.ts`. Also: `navigator.onLine` frequently reports `true` on a dead network (captive portals, flaky clinic wifi, the Capacitor Android WebView) — it's a hint, never a decision.
- **Cross-device offline approval (2026-08-08, migration 055):** offline edits are now staged server-side with an AES-GCM-encrypted payload (`src/lib/payloadCrypto.ts`) so the creator (or admin) can approve from a different device, not just the one that queued the edit. Three things to protect when touching this: (1) **never revert `reportPendingToServer()`'s actor filter** (`src/lib/offlineSync.ts`) back to reporting the whole device outbox — on a shared clinic device that would let whoever's logged in at report time get stamped as the creator of someone else's queued edit; (2) **any new sync path must call `claimMutation()` before executing** — it's the only thing preventing two devices from both executing the same edit; (3) **any sync path that calls `claimMutation()` must release the claim if execution then fails** (`claimed_at`/`claimed_by_device` back to `null`, mirroring `releaseClaim()`) **and must never delete local outbox data on a claim conflict unless the server row is confirmed `synced`/`discarded`** — an unreleased claim plus a delete-on-conflict is silent data loss (this exact bug shipped and was fixed same-day: a failed sync left its claim held, and a retry within the 10-minute claim TTL deleted the still-unsynced local mutation while reporting success). **Rotating `ADMIN_PIN`/`VITE_ADMIN_PASSWORD` orphans every currently-staged payload** (the derived key changes) — drain the offline outbox first.
- **`SnapshotDetails` (2026-08-08, `src/components/SnapshotDetails.tsx`) is shared by three views:** Delete History, Edit History (both `DoctorProfile.tsx`), and Admin → Offline Edits (`components/admin/OfflineEditsTab.tsx`). Changing how it renders a field changes all three — don't fork a local copy for one of them.

## Where things are

- Technical reference: [CLINICMX.md](CLINICMX.md) · Schema: [DATABASE.md](DATABASE.md) · Data access & functions: [API.md](API.md) · Feature behavior: [FEATURES.md](FEATURES.md) · Design system: [UI-UX.md](UI-UX.md)
- Offline/Android plan (approved, not started): [OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md) — start with "Start M1 from OFFLINE_ROADMAP.md"
- The core screen is `src/pages/PatientProfile.tsx` (~5,900 lines; tabs for visits, treatments, prescriptions, files, dental chart, billing). Edit it surgically.
- **`D:\Claude\Clinicmx-web-apk`** (sibling directory, own repo, not documented elsewhere) is a bare Capacitor Android wrapper for the ClinicMx APK — `capacitor.config.json`'s `server.url` points straight at the live `clinicmx-web.pages.dev` deployment, so **any web-app change here ships to the APK automatically on the next Cloudflare deploy, no separate Android build needed** — only a genuinely native change (new Capacitor plugin, Android permission, manifest edit) requires touching that project and rebuilding. No plugins installed there as of 2026-08-01 (bare `@capacitor/core`/`android`/`cli` only) — no filesystem/share bridge exists, which is why `sharePdf()` (Web Share API) rather than native file APIs is the load-bearing mechanism for anything the app needs to save/share on Android.

## Workflow expectations

- Local-first: change → typecheck/build → user reviews in dev → commit → push on request.
- Feature branch for anything multi-commit or risky; `main` must always deploy cleanly.
- When a related improvement seems worthwhile, propose it — don't bundle it.
