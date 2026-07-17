// Cloudflare Pages Function: fetches one device backup's content by Drive
// file id, for the "Restore from Google Drive" flow.
//
// SECURITY-CRITICAL: this endpoint is same-origin and unauthenticated, and
// the OAuth token it uses (drive.file scope) also has access to files this
// app's token has created OUTSIDE device-backups/ — specifically the nightly
// GitHub Actions backup's db-backups/ (full database dumps) and
// patient-files/ (patient photos/X-rays) under the same root Drive folder.
// A client-supplied ?id= must NEVER be trusted directly: we re-list
// device-backups/ and only serve content for an id that is actually a
// member of that listing. Do not remove this check.

import { type Env, json, hasCredentials, getAccessToken, ensureSubfolder, driveList, driveGetContent } from './_lib'

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context

  if (!hasCredentials(env)) {
    return json(503, { ok: false, error: 'Backup download is not configured on the server yet.' })
  }

  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) {
    return json(400, { ok: false, error: 'Missing id.' })
  }

  try {
    const token = await getAccessToken(env)
    const folderId = await ensureSubfolder(token, env.GOOGLE_DRIVE_FOLDER_ID)
    const files = await driveList(token, `'${folderId}' in parents and trashed = false`, 'id, name')

    const match = files.find((f) => f.id === id)
    if (!match) {
      return json(404, { ok: false, error: 'Backup not found in device-backups.' })
    }

    const content = await driveGetContent(token, id)
    return new Response(content, { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed.'
    return json(502, { ok: false, error: message })
  }
}
