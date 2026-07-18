// Cloudflare Pages Function: receives a device backup from the app and
// uploads it to Google Drive under "<ClinicMx Backups>/device-backups/".
//
// Wire format: raw bytes (gzipped .json.gz or encrypted .json.enc) with
// ?filename=…&prune=1 query params. A legacy JSON body ({filename, backup,
// prune}) is still accepted so cached app bundles keep working during the
// rollout.
//
// Memory safety (Workers have a 128 MB limit): a .json.gz upload is
// validated by decompressing only the FIRST few KB and checking the JSON
// starts with the ClinicMx kind marker (the client serializer writes `kind`
// first) — the full backup is NEVER decompressed or parsed server-side.
// Encrypted uploads are validated by their CMXENC1 magic bytes (the server
// cannot decrypt them by design).
//
// Security posture: same-origin, unauthenticated (P1 auth planned).
// Mitigations: strict filename/prefix validation, a size cap, and writes
// confined to the device-backups subfolder.

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
const FILENAME_PATTERN =
  /^clinicmx-backup-(?:(daily|weekly|monthly)-)?\d{4}-\d{2}-\d{2}-\d{6}\.json(?:\.gz|\.enc)?$/
const KIND_PREFIX = '{"kind":"clinicmx-device-backup"'
const ENC_MAGIC = [0x43, 0x4d, 0x58, 0x45, 0x4e, 0x43, 0x31] // "CMXENC1"

// Scheduled categories are pruned to their own fixed retention automatically
// (they're system-managed by "smart upload" — no user toggle needed). Manual
// (untagged) backups keep the existing opt-in behavior, gated by the `prune`
// flag from the Backup & Restore page's checkbox.
const CATEGORY_LIMITS: Record<string, number> = { daily: 20, weekly: 5, monthly: 2 }
const MANUAL_LIMIT = 20

function categoryOf(filename: string): string {
  return FILENAME_PATTERN.exec(filename)?.[1] ?? 'manual'
}

function contentTypeFor(filename: string): string {
  if (filename.endsWith('.gz')) return 'application/gzip'
  if (filename.endsWith('.enc')) return 'application/octet-stream'
  return 'application/json'
}

function hasEncMagic(bytes: Uint8Array): boolean {
  if (bytes.length < ENC_MAGIC.length) return false
  return ENC_MAGIC.every((b, i) => bytes[i] === b)
}

/** Streams just the first ~4 KB of decompressed gzip output, then cancels —
 * bounded memory regardless of how large the backup is. */
async function gzipPrefixText(bytes: Uint8Array, maxBytes = 4096): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const joined = new Uint8Array(Math.min(total, maxBytes))
  let offset = 0
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, joined.length - offset)
    joined.set(chunk.subarray(0, take), offset)
    offset += take
    if (offset >= joined.length) break
  }
  return new TextDecoder().decode(joined)
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

interface ValidatedUpload {
  filename: string
  prune: boolean
  content: Uint8Array | string
  error?: Response
}

async function readAndValidate(request: Request): Promise<ValidatedUpload> {
  const fail = (status: number, error: string): ValidatedUpload => ({
    filename: '',
    prune: false,
    content: '',
    error: json(status, { ok: false, error }),
  })

  const contentLength = Number(request.headers.get('Content-Length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return fail(413, 'Backup is too large to upload this way.')
  }

  const contentType = request.headers.get('Content-Type') || ''

  // Legacy JSON wire format (older cached app bundles).
  if (contentType.includes('application/json')) {
    let payload: { filename?: unknown; backup?: unknown; prune?: unknown }
    try {
      payload = (await request.json()) as typeof payload
    } catch {
      return fail(400, 'Invalid request body.')
    }
    const filename = typeof payload.filename === 'string' ? payload.filename : ''
    // Legacy clients used date-only or date+time plain .json names.
    if (!/^clinicmx-backup-(?:(?:daily|weekly|monthly)-)?\d{4}-\d{2}-\d{2}(?:-\d{6})?\.json$/.test(filename)) {
      return fail(400, 'Invalid backup filename.')
    }
    const backup = payload.backup as { kind?: unknown } | undefined
    if (!backup || backup.kind !== 'clinicmx-device-backup') {
      return fail(400, 'Not a ClinicMx backup file.')
    }
    return { filename, prune: payload.prune === true, content: JSON.stringify(backup) }
  }

  // Bytes wire format.
  const url = new URL(request.url)
  const filename = url.searchParams.get('filename') || ''
  if (!FILENAME_PATTERN.test(filename)) {
    return fail(400, 'Invalid backup filename.')
  }
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length === 0) return fail(400, 'Empty upload.')
  if (bytes.length > MAX_BODY_BYTES) return fail(413, 'Backup is too large to upload this way.')

  if (filename.endsWith('.json.enc')) {
    if (!hasEncMagic(bytes)) return fail(400, 'Not an encrypted ClinicMx backup.')
  } else if (filename.endsWith('.json.gz')) {
    let prefix: string
    try {
      prefix = await gzipPrefixText(bytes)
    } catch {
      return fail(400, 'Not a valid gzip file.')
    }
    if (!prefix.startsWith(KIND_PREFIX)) {
      return fail(400, 'Not a ClinicMx backup file.')
    }
  } else {
    return fail(400, 'Unsupported backup format.')
  }

  return { filename, prune: url.searchParams.get('prune') === '1', content: bytes }
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context

  if (!hasCredentials(env)) {
    return json(503, { ok: false, error: 'Upload service is not configured on the server yet.' })
  }

  const validated = await readAndValidate(request)
  if (validated.error) return validated.error
  const { filename, prune, content } = validated

  try {
    const token = await getAccessToken(env)
    const folderId = await ensureSubfolder(token, env.GOOGLE_DRIVE_FOLDER_ID)
    const contentType = contentTypeFor(filename)

    const existing = await driveList(
      token,
      `name = '${filename}' and '${folderId}' in parents and trashed = false`
    )
    let fileId: string
    if (existing.length) {
      fileId = existing[0].id
      await updateExisting(token, fileId, content, contentType)
    } else {
      fileId = await uploadNew(token, folderId, filename, content, contentType)
    }

    await pruneOldUploads(token, folderId, prune)

    const webViewLink = await getWebViewLink(token, fileId)
    return json(200, { ok: true, name: filename, webViewLink, id: fileId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return json(502, { ok: false, error: message })
  }
}
