// Cloudflare Pages Function: receives a device backup JSON from the app and
// uploads it to Google Drive under "<ClinicMx Backups>/device-backups/".
//
// Uses the same OAuth client + refresh token as the nightly GitHub Actions
// backup (drive.file scope), so it shares that app's Drive access and writes
// into the same folder tree. Credentials live ONLY in the Pages project's
// environment variables (Settings -> Environment variables, encrypted):
//   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//   GOOGLE_OAUTH_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID
//
// Security posture: the endpoint is same-origin and unauthenticated (the app
// has no server-side auth). Mitigations: strict filename/kind validation, a
// size cap, and writes confined to the device-backups subfolder — worst case
// is junk JSON files appearing there.

import {
  type Env,
  json,
  hasCredentials,
  getAccessToken,
  driveList,
  ensureSubfolder,
  uploadNew,
  updateExisting,
  getWebViewLink,
  driveDelete,
} from './_lib'

const MAX_BODY_BYTES = 25 * 1024 * 1024
const FILENAME_PATTERN = /^clinicmx-backup-(?:(daily|weekly|monthly)-)?\d{4}-\d{2}-\d{2}-\d{6}\.json$/

// Scheduled categories are pruned to their own fixed retention automatically
// (they're system-managed by "smart upload" — no user toggle needed). Manual
// (untagged) backups keep the existing opt-in behavior, gated by the `prune`
// flag from the Backup & Restore page's checkbox.
const CATEGORY_LIMITS: Record<string, number> = { daily: 20, weekly: 5, monthly: 2 }
const MANUAL_LIMIT = 20

function categoryOf(filename: string): string {
  return FILENAME_PATTERN.exec(filename)?.[1] ?? 'manual'
}

// Best-effort only: a pruning failure must never turn a successful upload
// into an error response — the backup itself already landed safely.
async function pruneOldUploads(token: string, folderId: string, manualPruneEnabled: boolean): Promise<void> {
  try {
    const files = await driveList(
      token,
      `'${folderId}' in parents and trashed = false`,
      'id, name'
    )
    const byCategory = new Map<string, typeof files>()
    for (const f of files) {
      const cat = categoryOf(f.name)
      const list = byCategory.get(cat) ?? []
      list.push(f)
      byCategory.set(cat, list)
    }
    for (const [cat, list] of byCategory) {
      const limit = cat === 'manual' ? (manualPruneEnabled ? MANUAL_LIMIT : Infinity) : CATEGORY_LIMITS[cat]
      for (const f of list.slice(limit)) {
        await driveDelete(token, f.id)
      }
    }
  } catch (err) {
    console.error('Backup prune failed (non-fatal):', err)
  }
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context

  if (!hasCredentials(env)) {
    return json(503, { ok: false, error: 'Upload service is not configured on the server yet.' })
  }

  const contentLength = Number(request.headers.get('Content-Length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'Backup is too large to upload this way.' })
  }

  let payload: { filename?: unknown; backup?: unknown; prune?: unknown }
  try {
    payload = (await request.json()) as { filename?: unknown; backup?: unknown; prune?: unknown }
  } catch {
    return json(400, { ok: false, error: 'Invalid request body.' })
  }

  const filename = typeof payload.filename === 'string' ? payload.filename : ''
  if (!FILENAME_PATTERN.test(filename)) {
    return json(400, { ok: false, error: 'Invalid backup filename.' })
  }
  const backup = payload.backup as { kind?: unknown } | undefined
  if (!backup || backup.kind !== 'clinicmx-device-backup') {
    return json(400, { ok: false, error: 'Not a ClinicMx backup file.' })
  }
  const prune = payload.prune === true

  try {
    const token = await getAccessToken(env)
    const folderId = await ensureSubfolder(token, env.GOOGLE_DRIVE_FOLDER_ID)
    const content = JSON.stringify(backup)

    const existing = await driveList(
      token,
      `name = '${filename}' and '${folderId}' in parents and trashed = false`
    )
    let fileId: string
    if (existing.length) {
      fileId = existing[0].id
      await updateExisting(token, fileId, content)
    } else {
      fileId = await uploadNew(token, folderId, filename, content)
    }

    await pruneOldUploads(token, folderId, prune)

    const webViewLink = await getWebViewLink(token, fileId)
    return json(200, { ok: true, name: filename, webViewLink })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return json(502, { ok: false, error: message })
  }
}
