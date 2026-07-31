# PRODUCT-ROADMAP.md — Product Roadmap & Release Plan

**Purpose:** the product-level view of where ClinicMx is going. Engineering detail for the offline/Android track lives in [OFFLINE_ROADMAP.md](OFFLINE_ROADMAP.md) (authoritative where they overlap); shipped history is in [CHANGELOG.md](CHANGELOG.md).

> Naming note: an earlier `PRODUCT-ROADMAP.md` was a ChatGPT draft superseded by OFFLINE_ROADMAP.md and never saved to the repo. This file replaces it, rewritten 2026-07-18 consistent with the approved plan.

---

## 1. Product vision

A dental clinic app the dentist can open **chairside on a phone with no internet** and trust with the clinic's only copy of its records. Three pillars:

1. **Complete daily workflow** — patient → appointment → visit → treatment → prescription → invoice → payment, with printing/sharing at each step. *(Largely shipped.)*
2. **Data safety** — layered backups, audit trail with restore, and eventually real auth + offline-capable sync. *(Backups shipped; auth/sync planned.)*
3. **Offline & installable** — PWA on the phone, full offline read then offline write. *(Planned, approved, not started.)*

## 2. Shipped (v1, June–July 2026)

Highlights; full list in [CHANGELOG.md](CHANGELOG.md) and specs in [FEATURES.md](FEATURES.md).

- **Core modules:** Patients (PT-1xxxxx codes, phone-normalized search), Appointments (conflict checks, reschedule, complete→visit prompt), Treatments (multi-tooth plans, grouped billing, discounts), Prescriptions (BD drug database, age/weight dosing, Bengali output, QR, print/PDF/WhatsApp), Billing (partial payments, merge, receipt/detailed formats, statements, reports), Inventory, Dental chart (FDI arch, age-aware), Visit history with running dues.
- **Roles & audit:** Admin/Doctor/Operator, per-user permissions, activity log, edit/delete history with restore.
- **Backups (2026-07-15→18):** nightly Supabase+Storage → Google Drive; daily/weekly/monthly schedules with tiered retention, verification, anomaly detection, encryption; in-app device backup/restore page with one-tap Drive upload; notification center.

## 3. Now / Next — the offline track (approved 2026-07-17, not started)

| Milestone | User-visible outcome | Status |
|---|---|---|
| M0 Prep | (internal) typecheck script, branch | Not started — first up |
| **M1 PWA + offline viewing** | "Install app" on Android; opens in airplane mode; Dashboard/Patients/Appointments/Patient Profile show last-synced data with an offline banner | Not started |
| M2 Repository layer | Invisible; the enabler for M4 | Not started |
| M3 Supabase Auth + RLS | Real logins; database no longer readable with the extracted key; staff can cold-start offline | Not started |
| M4 PowerSync offline writes | Full offline operation — create patients/visits/invoices in airplane mode; auto-sync on reconnect; sub-second loads | Not started |
| M5 Capacitor APK | **Conditional** — only if the PWA hits concrete Android problems | Decision after M4 |

Each milestone has a gate (real-world bake-in on the dentist's phone) before the next starts. To begin: tell a Claude Code session **"Start M1 from OFFLINE_ROADMAP.md."**

## 4. Later — feature backlog (M6, reorder freely by clinic need)

- Inventory auto-deduction when treatments complete
- Per-tooth treatment timeline view
- Drug-interaction / allergy checks in prescriptions
- Expense tracking / cashbook alongside income reports
- WhatsApp/SMS appointment reminders and invoice sends (server-side, not just share-sheet)
- AI assist modules (dose suggestions, summaries — assist only, never auto-apply clinical decisions)
- Patient image uploads re-enabled with client-side compression
- Multi-clinic support (`clinic_id` scoping) — deliberately **last**
- **Cloudflare network fence** (hardening of the 2026-07-18 in-app IP gate, chosen "gate now, fence later"): `functions/_middleware.ts` checks `CF-Connecting-IP` against a KV-stored allow-list before serving anything; admin bypass via an `/unlock` page + long secret setting a 30-day signed HttpOnly cookie; admin "Allow this network" button writes to KV. Blocks the site itself (immune to dev-tools bypass; admin PIN alone no longer enough from outside). Needs a KV namespace binding + 2 secrets in the Cloudflare Pages dashboard.

## 5. Small approved-on-request cleanups (parked)

Awaiting explicit user approval (see OFFLINE_ROADMAP §12): delete legacy `netlify.toml`; remove dead code (`src/routes.tsx` + `DentalChart.tsx`, unimported `src/services/` Google sync); remove duplicate root `logo.png`; add ESLint; offline "last updated" stamp on Dashboard.

## 6. Non-goals

- Patient-facing portal or online booking — not planned.
- Play Store distribution — sideload/PWA only.
- Multi-tenant SaaS — ClinicMx serves this clinic; `sk-dental` (the second clinic's fork) is frozen and diverges freely.
