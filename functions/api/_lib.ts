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

// --- Resilient Google calls -------------------------------------------------
// Google occasionally answers with a plain-text body ("Service Unavailable")
// instead of JSON, especially on 503s. A bare `await res.json()` then throws a
// SyntaxError whose message ("Unexpected token 'S', "Service Unavailable" is
// not valid JSON") used to reach the client verbatim as the upload error —
// seen live 2026-09-29 in a failed Daily auto-upload. Every Google response is
// now parsed with readGoogleJson (never throws) and turned into a readable
// message with describeGoogleFailure.

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504])
const RETRY_DELAYS_MS = [1000, 3000]

/** Marker class so callers (upload-backup.ts) can tell a temporary Google
 * outage from a real rejection (bad credentials, quota, permissions). */
export class GoogleTransientError extends Error {}

export function isTransientGoogleError(err: unknown): boolean {
  return err instanceof GoogleTransientError
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Parses a Google response body as JSON, or returns null for an empty/non-JSON body. */
export async function readGoogleJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text()
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

/** Builds the error for a failed Google call — a GoogleTransientError for
 * 429/5xx, so the caller can decide to retry. */
export function describeGoogleFailure(
  prefix: string,
  res: Response,
  data: { error?: { message?: string } | string; error_description?: string } | null
): Error {
  if (TRANSIENT_STATUSES.has(res.status)) {
    return new GoogleTransientError(
      `Google Drive is temporarily unavailable (HTTP ${res.status}) — try again shortly.`
    )
  }
  const detail =
    typeof data?.error === 'string'
      ? data.error_description || data.error
      : data?.error?.message
  const fallback = res.ok ? `unexpected response from Google (HTTP ${res.status})` : `HTTP ${res.status}`
  return new Error(`${prefix}: ${detail || fallback}`)
}

/**
 * fetch() for idempotent Google calls (token refresh, GETs, PATCH, DELETE):
 * retries a network failure or a 429/5xx response up to twice (~1s, ~3s)
 * before handing the last response back. Never use it for a POST that creates
 * a file (uploadNew) — a retry there could leave a duplicate in Drive.
 */
export async function googleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS_MS.length
    try {
      const res = await fetch(input, init)
      if (!TRANSIENT_STATUSES.has(res.status) || last) return res
      // Discard the unused body before retrying so the Workers runtime
      // doesn't hold the connection open.
      await res.body?.cancel().catch(() => {})
    } catch (err) {
      if (last) {
        throw new GoogleTransientError(
          `Could not reach Google Drive (${err instanceof Error ? err.message : 'network error'}) — try again shortly.`
        )
      }
    }
    await sleep(RETRY_DELAYS_MS[attempt])
  }
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
  const res = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  const data = await readGoogleJson<{ access_token?: string; error?: string; error_description?: string }>(res)
  if (!res.ok || !data?.access_token) throw describeGoogleFailure('Google auth failed', res, data)
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
    const res = await googleFetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await readGoogleJson<{
      files?: DriveFile[]
      nextPageToken?: string
      error?: { message?: string }
    }>(res)
    if (!res.ok || !data) throw describeGoogleFailure('Drive list failed', res, data)
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
  const data = await readGoogleJson<{ id?: string; error?: { message?: string } }>(res)
  if (!res.ok || !data?.id) throw describeGoogleFailure('Drive folder create failed', res, data)
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
  // Plain fetch, not googleFetch: a blind retry of this create could leave a
  // duplicate file. A network failure is still reported as transient so
  // upload-backup.ts's saveToDrive can retry safely (it re-lists by name first).
  let res: Response
  try {
    res = await fetch(
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
  } catch (err) {
    throw new GoogleTransientError(
      `Could not reach Google Drive (${err instanceof Error ? err.message : 'network error'}) — try again shortly.`
    )
  }
  const data = await readGoogleJson<{ id?: string; sha256Checksum?: string; error?: { message?: string } }>(res)
  if (!res.ok || !data?.id) throw describeGoogleFailure('Drive upload failed', res, data)
  return { id: data.id, sha256Checksum: data.sha256Checksum }
}

export async function updateExisting(
  token: string,
  fileId: string,
  content: string | Uint8Array,
  contentType = 'application/json'
): Promise<UploadedFile> {
  const res = await googleFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,sha256Checksum`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      body: content as BodyInit,
    }
  )
  const data = await readGoogleJson<{ id?: string; sha256Checksum?: string; error?: { message?: string } }>(res)
  if (!res.ok) throw describeGoogleFailure('Drive update failed', res, data)
  return { id: data?.id || fileId, sha256Checksum: data?.sha256Checksum }
}

export async function getWebViewLink(token: string, fileId: string): Promise<string | undefined> {
  const res = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return undefined
  const data = await readGoogleJson<{ webViewLink?: string }>(res)
  return data?.webViewLink
}

// Returns raw bytes — backups may be gzipped or encrypted binary, so text
// decoding here would corrupt them.
export async function driveGetContent(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw describeGoogleFailure('Drive download failed', res, null)
  return res.arrayBuffer()
}

// Idempotent: a 404 (already gone) counts as success, so overlapping prune
// runs from two devices can't throw on the same file id.
export async function driveDelete(token: string, fileId: string): Promise<void> {
  const res = await googleFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) {
    const data = await readGoogleJson<{ error?: { message?: string } }>(res)
    throw describeGoogleFailure('Drive delete failed', res, data)
  }
}
