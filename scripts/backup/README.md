# ClinicMx daily backup (Supabase → Google Drive)

Every night at **3:00 AM Bangladesh time** a GitHub Actions job:

1. Dumps **all 23 database tables** to JSON and uploads a dated zip to Google Drive → `db-backups/clinicmx-db-YYYY-MM-DD.zip` (zips older than 30 days are pruned automatically).
2. Mirrors the **`patient-files` storage bucket** (photos, clinical images, x-rays) into Drive → `patient-files/…`. Upload-only: files deleted from Supabase **stay** in Drive.

A failed backup shows as a red ❌ run under the repo's **Actions** tab.

---

## One-time setup

**Why OAuth and not a service account:** personal Gmail accounts don't support
service accounts writing to Drive at all (that's a Google Workspace-only feature
called Shared Drives) — you'll get a "Service Accounts do not have storage quota"
error. So the backup authenticates as *you* instead, via a one-time consent screen,
and creates its own "ClinicMx Backups" folder in your Drive that it manages from
then on.

### 1. Google Cloud: enable the Drive API

1. Go to https://console.cloud.google.com/ → create (or pick) a project.
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.

### 2. Google Cloud: OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** → Create. Fill in an app name (e.g. "ClinicMx Backup") and your own email for the required fields → Save and continue through the Scopes and Test users steps (nothing to add) → Back to dashboard.
3. On the consent screen's summary page, click **Publish App** (moves it from "Testing" to "In production"). You'll see a warning that it needs verification for some scopes — that's fine to ignore for personal use; you'll just click through an "unverified app" screen once during step 4. Verification is only required if this were a public, multi-user product.

### 3. Google Cloud: OAuth Client ID

1. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
2. Application type: **Desktop app** → name it anything → **Create**.
3. Copy the **Client ID** and **Client secret** shown.

### 4. Authorize (one-time, run locally)

Put the values from step 3 into `scripts/backup/.env.backup`:
```
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```
Then:
```bash
cd scripts/backup
npm install
npm run authorize
```
It prints a URL — open it in your own browser, sign in with the Google account
you want backups saved to, and click **Allow** (you'll see an "unverified app"
warning first — click **Continue**/**Advanced → Go to ClinicMx Backup**, this is
expected since we skipped Google's review process). It then saves
`GOOGLE_OAUTH_REFRESH_TOKEN` into `.env.backup` automatically.

### 5. Supabase: service_role key

Supabase dashboard → your ClinicMx project → **Settings → API** → copy the **service_role** key (NOT the anon key — the backup needs it to read `doctor_profiles`). Never put this key in the app or commit it.

### 6. GitHub: repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**, add all five:

| Secret name | Value |
|---|---|
| `SUPABASE_URL` | `https://mgzmxnkrbdawymdviclv.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key from step 5 |
| `GOOGLE_OAUTH_CLIENT_ID` | from step 3 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | from step 3 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | from step 4 (saved in `.env.backup`) |
| `GOOGLE_DRIVE_FOLDER_ID` | printed by the first successful `npm run backup` (also saved in `.env.backup`) |

That's it. Trigger a first run manually: **Actions → Daily backup → Run workflow**, then check Drive.

---

## Running locally

Once `.env.backup` has all the values from setup:

```bash
cd scripts/backup
npm install
npm run backup
```

---

## Restoring data

All restore commands are **dry-run by default** — they print exactly what would change
and write **nothing** until you add `--confirm`. Run them from `scripts/backup/`.
`--zip` accepts a local file or just the name of a backup in Drive (auto-downloaded).

**One deleted row** (e.g. an invoice) — find its id in the zip's JSON, then:
```bash
node restore.mjs --zip clinicmx-db-2026-07-14.zip --table invoices --id <uuid>
node restore.mjs --zip clinicmx-db-2026-07-14.zip --table invoices --id <uuid> --confirm
```

**Everything for one patient** (patient row + appointments, treatments, prescriptions, invoices, payments, files metadata):
```bash
node restore.mjs --zip clinicmx-db-2026-07-14.zip --patient <patient-uuid> --confirm
```

**A whole table** (existing rows are skipped; add `--overwrite` to replace them with backup values):
```bash
node restore.mjs --zip clinicmx-db-2026-07-14.zip --table patients --confirm
```

**Entire database** (disaster recovery — tables restored in foreign-key order):
```bash
node restore.mjs --zip clinicmx-db-2026-07-14.zip --all --confirm
```

**A patient's images** back into the storage bucket (from the Drive mirror):
```bash
node restore.mjs --files <patient-uuid> --confirm
```

⚠️ `--overwrite` replaces live rows with backup values — only use it when you're sure
the backup version is the one you want.

---

## Notes

- Files count against **your own Drive's 15 GB free quota**. DB zips are small and
  auto-pruned; patient images accumulate over time — worth keeping an eye on.
- The backup uses `drive.file` scope — it can only see/manage files and folders it
  created itself (the "ClinicMx Backups" folder and everything inside it). It has no
  access to the rest of your Drive.
- The backup is read-only against Supabase. Restore writes only when `--confirm` is given.
- Runs on days the clinic PC is off too — it's GitHub's servers doing the work.
- If `npm run backup` ever fails with an auth error (refresh token revoked/expired),
  re-run `npm run authorize` to get a new one.
