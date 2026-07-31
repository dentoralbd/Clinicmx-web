# CLINICMX-GPT.md — Future Architecture & Engineering Principles

**Purpose:** the target architecture ClinicMx is evolving toward, and the engineering principles every change must follow. The concrete step-by-step implementation plan for the offline/Android work is [OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md) — where the two overlap, that document wins. Current-state reference: [CLINICMX.md](CLINICMX.md).

> Naming note: an earlier `CLINICMX-GPT.md` was a ChatGPT draft that was superseded by OFFLINE_ROADMAP.md and never saved to the repo. This file replaces it, rewritten 2026-07-18 to be consistent with the approved plan.

---

## 1. Target architecture

```
React UI (pages/components — no data-access code)
   │
   ▼
Repository layer (src/repositories/ — the only place that talks to a data source)
   │
   ▼
Local-first data store
   • today: React Query cache (+ IndexedDB persistence from M1)
   • future: PowerSync-managed local SQLite (M4)
   │
   ▼  bidirectional sync (PowerSync)
Supabase (PostgreSQL + Storage + Auth) — server of record
```

Principles embodied in that diagram:

1. **Local-first, server-of-record.** The device is the fast path; Supabase is the truth. Reads come from local state; writes apply locally and sync up. Until M4, writes remain online-only and must fail loudly offline — never silently queue without real sync infrastructure.
2. **One seam.** All ~198 Supabase callsites migrate behind `src/repositories/` (M2). Repos take and return plain row shapes from `database.types.ts` and throw plain `Error`s — no supabase-js builder/client types leak to pages. That contract is the entire PowerSync swap: M4 changes repo internals, not components.
3. **Server-assigned identity.** `patient_code` and `invoice_number` are server sequences. Offline clients write visibly-provisional values (`PT-TMP-<uuid8>`); `BEFORE INSERT` triggers assign real values at sync time. Exactly one assignment path.
4. **Real auth before sync.** Supabase Auth + RLS (M3) precedes PowerSync (M4): sync needs JWTs, and the anon key must become harmless first. Roles/permissions stay in `app_users`, joined via SECURITY DEFINER helpers — no custom JWT claims.
5. **Business data lives in the database.** localStorage-only business data (logo, section templates, autocomplete memory) moves into tables in M4. localStorage is for session/device state only.
6. **Audit is insert-only.** `activity_log`, `edit_history`, `delete_history` sync up but never down (unbounded growth; read only in the online Admin zone). The snapshot-before-write ordering of the audit helpers is preserved inside repo write functions.

## 2. Engineering principles

### Always-working app
- Production deploys on every push to `main` (Cloudflare Pages). Merge to `main` **only after user verification.**
- Feature branch per milestone; page-per-commit conversions; the app must build and work at every commit.
- Verification ladder per change: `npm run typecheck` → `npm run build` → manual flows in dev → (for offline work) build+preview, kill server, reload → real acceptance on the dentist's phone.

### Live-database safety
- The Supabase project is production with real patient data. Schema changes are staging-first (restore a nightly backup into a scratch Supabase project), need explicit user sign-off, and land with a fresh manual backup plus a written rollback.
- Restore tooling is dry-run by default; writing requires `--confirm`.
- Backup-system changes must be pushed to both remotes (`gsbanikudc-byte/Clinicmx-web` runs the real scheduled job).

### Scope discipline
- Implement exactly what was asked. Do not touch, "improve", or consolidate neighboring features — surface suggestions instead and let the user decide. (This rule exists because a 2026-06-29 over-scoped change broke the Prescriptions patient-selection flow, which is now explicitly frozen.)
- `sk-dental` is frozen; nothing gets ported there.
- Dead code (`src/routes.tsx`, `src/services/`, `netlify.toml`, duplicate logo) is removed only with user approval.

### Data integrity
- Snapshot-first auditing: capture the row before mutating it, so restore/revert always works.
- Every schema change updates three places in lockstep: the SQL migration, `src/lib/database.types.ts`, and `src/lib/entityTables.ts` (if the entity is tracked).
- Money math: amounts are numerics in BDT; discounts are typed (`fixed`/`percent`); paid/due are derived from the `payments` table, not stored aggregates, wherever possible.

### Clinical safety
- AI/automation features assist only — they never auto-apply clinical decisions (dosing suggestions are prefills the dentist confirms).
- The drug database is data, not logic: adding drugs must not require code changes beyond the known `DrugPicker` category-list sync.

### Simplicity bias
- A solo clinic's data is small. Prefer boring solutions (one global sync bucket, LWW conflict resolution, no premature multi-tenancy). `clinic_id` scoping is deliberately last in the feature backlog.
- Don't pre-add speculative columns (e.g. `version`/`sync_status` — PowerSync tracks its own state; soft-delete flags wait for a concrete need).

## 3. Security hardening path

See `SECURITY-HARDENING.md` for the full plan. Phase 1 (2026-07-25, perimeter hardening — no DB
changes) is done: the three backup Cloudflare Functions now require the admin trusted-device
token (`X-ClinicMx-Auth`); admin login in production hard-fails instead of silently falling back
to PIN-only if the 2FA endpoint reports `unconfigured`/`unreachable`. Confirmed live at the time:
admin 2FA was already configured in production (good), but `GET /api/list-backups` was reachable
with zero credentials and returned real backup filenames/Drive IDs (fixed by this phase).

| Layer | Today (post Phase 1) | Target |
|---|---|---|
| Identity | Admin PIN + PBKDF2 rows in `app_users`, verified client-side; server is now authoritative for the admin PIN check (`admin-otp.ts`) and production no longer falls back to the client-only check on misconfiguration | Supabase Auth users (staff via synthetic emails); PIN survives as offline unlock / key gate (M3) |
| Authorization | **Anon key still has full read/write on all 27 tables — this is the biggest remaining gap, unchanged by Phase 1.** Allow-all RLS; app-level page/permission checks only | Real RLS: any active authenticated user reads/writes; deletes gated on admin/`can_delete`; anon revoked everywhere incl. RPCs and storage (M3) |
| Transport of secrets | Anon key in bundle (accepted, harmless post-M3); backup/2FA secrets stay Cloudflare-only | Service-role and Google OAuth secrets only in GitHub secrets / Cloudflare dashboard / gitignored env files — never in client code |
| Backup endpoints | **Authenticated (Phase 1)** — require a valid trusted-device token, same one minted by admin login | (done) |
| At-rest on device | Unencrypted IndexedDB cache (user-accepted 2026-07-17); `secureLocalStorage.ts`'s key is derivable from the public PIN constant + a hardcoded salt, so it's obfuscation, not real encryption (user declined rotating the PIN, 2026-07-25) | PowerSync encryption keyed from the PIN-derived key (M4/M5 fast-follow) |
| Patient files | `patient-files` bucket is public with permanent URLs; upload UI exists but the user reports uploads have been disabled from the start | Private bucket + storage policies + signed URLs (Phase 2 / M3) |

## 4. Platform strategy

**PWA first.** Installable app via vite-plugin-pwa with silent auto-update; Cloudflare `_headers` make `index.html`/`sw.js` revalidate while hashed assets are immutable. **Capacitor APK only if a concrete trigger fires** (Android evicting storage despite `navigator.storage.persist()`, camera/QR failures in the installed PWA, or a hard encrypted-native-storage requirement). No Play Store/TWA plans.

## 5. Conventions for new code

- TypeScript strict; functional React components; hooks over classes; Tailwind utility classes over custom CSS (see [UI-UX.md](UI-UX.md)).
- Data access in repositories only (post-M2); query keys from the single `qk` factory; dates in keys pre-formatted `yyyy-MM-dd`, never `Date` objects.
- Repos return data or throw `Error` — pages own loading/error UI.
- Match surrounding code style; comments only for non-obvious constraints.
- User-facing money is BDT; user-facing dates via `date-fns`; prescription-facing clinical text supports Bengali where the print layout does.
