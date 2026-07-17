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

interface Env {
  GOOGLE_OAUTH_CLIENT_ID: string
  GOOGLE_OAUTH_CLIENT_SECRET: string
  GOOGLE_OAUTH_REFRESH_TOKEN: string
  GOOGLE_DRIVE_FOLDER_ID: string
}

const MAX_BODY_BYTES = 25 * 1024 * 1024
const SUBFOLDER = 'device-backups'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function getAccessToken(env: Env): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  const data = (await res.json()) as { access_token?: string; error?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(`Google auth failed: ${data.error || res.status}`)
  }
  return data.access_token
}

async function driveList(token: string, q: string): Promise<Array<{ id: string; name: string }>> {
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('fields', 'files(id, name)')
  url.searchParams.set('pageSize', '10')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = (await res.json()) as { files?: Array<{ id: string; name: string }>; error?: { message?: string } }
  if (!res.ok) throw new Error(`Drive list failed: ${data.error?.message || res.status}`)
  return data.files || []
}

async function ensureSubfolder(token: string, parentId: string): Promise<string> {
  const existing = await driveList(
    token,
    `name = '${SUBFOLDER}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`
  )
  if (existing.length) return existing[0].id
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: SUBFOLDER, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
  const data = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || !data.id) throw new Error(`Drive folder create failed: ${data.error?.message || res.status}`)
  return data.id
}

async function uploadNew(token: string, folderId: string, filename: string, content: string): Promise<string> {
  const boundary = 'clinicmx-' + crypto.randomUUID()
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: filename, parents: [folderId] }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    content +
    `\r\n--${boundary}--`
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )
  const data = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || !data.id) throw new Error(`Drive upload failed: ${data.error?.message || res.status}`)
  return data.id
}

async function updateExisting(token: string, fileId: string, content: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: content,
    }
  )
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(`Drive update failed: ${data?.error?.message || res.status}`)
  }
}

async function getWebViewLink(token: string, fileId: string): Promise<string | undefined> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return undefined
  const data = (await res.json()) as { webViewLink?: string }
  return data.webViewLink
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context

  if (
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !env.GOOGLE_OAUTH_REFRESH_TOKEN ||
    !env.GOOGLE_DRIVE_FOLDER_ID
  ) {
    return json(503, { ok: false, error: 'Upload service is not configured on the server yet.' })
  }

  const contentLength = Number(request.headers.get('Content-Length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'Backup is too large to upload this way.' })
  }

  let payload: { filename?: unknown; backup?: unknown }
  try {
    payload = (await request.json()) as { filename?: unknown; backup?: unknown }
  } catch {
    return json(400, { ok: false, error: 'Invalid request body.' })
  }

  const filename = typeof payload.filename === 'string' ? payload.filename : ''
  if (!/^clinicmx-backup-\d{4}-\d{2}-\d{2}\.json$/.test(filename)) {
    return json(400, { ok: false, error: 'Invalid backup filename.' })
  }
  const backup = payload.backup as { kind?: unknown } | undefined
  if (!backup || backup.kind !== 'clinicmx-device-backup') {
    return json(400, { ok: false, error: 'Not a ClinicMx backup file.' })
  }

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

    const webViewLink = await getWebViewLink(token, fileId)
    return json(200, { ok: true, name: filename, webViewLink })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return json(502, { ok: false, error: message })
  }
}
