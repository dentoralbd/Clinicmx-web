// Cloudflare Pages Function: lists the device backups currently in
// "<ClinicMx Backups>/device-backups/" on Google Drive, newest first.
// Read-only counterpart to upload-backup.ts — same credentials, same folder.

import { type Env, json, hasCredentials, getAccessToken, ensureSubfolder, driveList } from './_lib'

export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const { env } = context

  if (!hasCredentials(env)) {
    return json(503, { ok: false, error: 'Backup listing is not configured on the server yet.' })
  }

  try {
    const token = await getAccessToken(env)
    const folderId = await ensureSubfolder(token, env.GOOGLE_DRIVE_FOLDER_ID)
    const files = await driveList(
      token,
      `'${folderId}' in parents and trashed = false`,
      'id, name, size, modifiedTime'
    )
    return json(200, {
      ok: true,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size ? Number(f.size) : 0,
        modifiedTime: f.modifiedTime,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Listing backups failed.'
    return json(502, { ok: false, error: message })
  }
}
