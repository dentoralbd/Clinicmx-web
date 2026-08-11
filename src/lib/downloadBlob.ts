import { IS_TAURI } from './runtimeEnv'

/**
 * Saves a Blob to the user's disk under the given file name.
 *
 * In a browser (or the Capacitor Android WebView) this is the classic
 * `<a download>` trick. Inside the Tauri desktop wrapper there is no
 * "Downloads" folder concept and no download-handling glue wired up on the
 * Rust side (see src-tauri/capabilities/default.json), so the same anchor
 * click is inert there — instead this opens a native Save dialog and writes
 * the bytes via the fs plugin.
 *
 * Returns `false` if the user cancelled the Tauri save dialog, `true`
 * otherwise (including the browser path, where there is no cancel signal).
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<boolean> {
  if (IS_TAURI) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: fileName })
    if (!path) return false
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return true
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Deferred, not synchronous: revoking immediately after .click() can race
  // the browser's own download handoff for the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
