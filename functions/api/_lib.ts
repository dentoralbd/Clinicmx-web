// Shared Google Drive / OAuth helpers for functions/api/*.ts. This file has no
// onRequest* export, so Cloudflare Pages never binds a route to it directly.
//
// Credentials (same 4 vars everywhere): GOOGLE_OAUTH_CLIENT_ID,
// GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID
// — same OAuth client + refresh token the nightly GitHub Actions backup uses
// (drive.file scope). IMPORTANT: that same token can also see db-backups/ and
// patient-files/ under the same root folder (full DB dumps + patient images) —
// any endpoint that serves file content by id MUST verify the id is a member
// of the folder it claims to be browsing before returning content.

export interface Env {
  GOOGLE_OAUTH_CLIENT_ID: string
  GOOGLE_OAUTH_CLIENT_SECRET: string
  GOOGLE_OAUTH_REFRESH_TOKEN: string
  GOOGLE_DRIVE_FOLDER_ID: string
}

export const SUBFOLDER = 'device-backups'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function hasCredentials(env: Env): boolean {
  return !!(
    env.GOOGLE_OAUTH_CLIENT_ID &&
    env.GOOGLE_OAUTH_CLIENT_SECRET &&
    env.GOOGLE_OAUTH_REFRESH_TOKEN &&
    env.GOOGLE_DRIVE_FOLDER_ID
  )
}

export async function getAccessToken(env: Env): Promise<string> {
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

export interface DriveFile {
  id: string
  name: string
  size?: string
  modifiedTime?: string
  createdTime?: string
}

// Paginated (Drive caps each page; a bare call without paging silently loses
// files past the first page) and explicitly sorted by name descending — Drive
// does not guarantee any particular order unless `orderBy` is requested.
export async function driveList(
  token: string,
  q: string,
  fields = 'id, name'
): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('q', q)
    url.searchParams.set('fields', `nextPageToken, files(${fields})`)
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = (await res.json()) as {
      files?: DriveFile[]
      nextPageToken?: string
      error?: { message?: string }
    }
    if (!res.ok) throw new Error(`Drive list failed: ${data.error?.message || res.status}`)
    files.push(...(data.files || []))
    pageToken = data.nextPageToken
  } while (pageToken)
  files.sort((a, b) => b.name.localeCompare(a.name))
  return files
}

export async function ensureSubfolder(token: string, parentId: string): Promise<string> {
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

export interface UploadedFile {
  id: string
  sha256Checksum?: string
}

export async function uploadNew(
  token: string,
  folderId: string,
  filename: string,
  content: string | Uint8Array,
  contentType = 'application/json'
): Promise<UploadedFile> {
  const boundary = 'clinicmx-' + crypto.randomUUID()
  // Multipart body built as a Blob so binary payloads (gzip/encrypted
  // backups) pass through byte-exact — string concatenation would corrupt them.
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: filename, parents: [folderId] }) +
      `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    content as BlobPart,
    `\r\n--${boundary}--`,
  ])
  // fields=id,sha256Checksum: Drive computes the checksum server-side during
  // upload, so we get a verified-correct hash for free — no re-download needed.
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,sha256Checksum',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )
  const data = (await res.json()) as { id?: string; sha256Checksum?: string; error?: { message?: string } }
  if (!res.ok || !data.id) throw new Error(`Drive upload failed: ${data.error?.message || res.status}`)
  return { id: data.id, sha256Checksum: data.sha256Checksum }
}

export async function updateExisting(
  token: string,
  fileId: string,
  content: string | Uint8Array,
  contentType = 'application/json'
): Promise<UploadedFile> {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,sha256Checksum`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      body: content as BodyInit,
    }
  )
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(`Drive update failed: ${data?.error?.message || res.status}`)
  }
  const data = (await res.json()) as { id?: string; sha256Checksum?: string }
  return { id: data.id || fileId, sha256Checksum: data.sha256Checksum }
}

export async function getWebViewLink(token: string, fileId: string): Promise<string | undefined> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return undefined
  const data = (await res.json()) as { webViewLink?: string }
  return data.webViewLink
}

// Returns raw bytes — backups may be gzipped or encrypted binary, so text
// decoding here would corrupt them.
export async function driveGetContent(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`)
  return res.arrayBuffer()
}

// Idempotent: a 404 (already gone) counts as success, so overlapping prune
// runs from two devices can't throw on the same file id.
export async function driveDelete(token: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(`Drive delete failed: ${data?.error?.message || res.status}`)
  }
}
