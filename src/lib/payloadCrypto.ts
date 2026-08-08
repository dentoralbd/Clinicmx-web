import { getStoredSessionKey } from '@/lib/secureLocalStorage'

/**
 * Encrypts an offline mutation's payload before it's staged server-side
 * (see migration 055) so a user can approve their own queued edits from a
 * different device. Reuses the same session AES-GCM key secureLocalStorage.ts
 * derives at login (PBKDF2 over VITE_ADMIN_PASSWORD) — see that file's
 * getStoredSessionKey() — but never touches its localStorage-bound
 * read/write helpers, which hardcode a different storage target.
 *
 * Honest security note: because the KDF passphrase is a VITE_ build-time
 * constant shipped in the public bundle, this key is not a secret from
 * anyone who can read the client source. It still keeps clinical/financial
 * plaintext out of the Supabase dashboard, PostgREST responses, and DB
 * dumps — RLS (creator-or-admin) is the actual access control.
 */

const encoder = new TextEncoder()

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)).buffer
}

async function fingerprintOf(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  const hash = await crypto.subtle.digest('SHA-256', raw)
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `A256GCM-v1:${hex.slice(0, 8)}`
}

/** Null when there's no active session key (logged out / session storage cleared). */
export async function getKeyFingerprint(): Promise<string | null> {
  const key = await getStoredSessionKey()
  if (!key) return null
  return fingerprintOf(key)
}

export interface EncryptedPayload {
  payload_encrypted: string
  payload_iv: string
  payload_alg: string
}

/**
 * Encrypts `value` (JSON-serialized). `aad` (the mutation's client id) is
 * bound into the GCM auth tag via additionalData so ciphertext can't be
 * cut-and-pasted onto a different row. Returns null when there's no session
 * key to encrypt with — callers must omit the payload columns entirely in
 * that case (see offlineSync.ts's upsert-column-erasure guard).
 */
export async function encryptPayload(value: unknown, aad: string): Promise<EncryptedPayload | null> {
  const key = await getStoredSessionKey()
  if (!key) return null

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    key,
    plaintext
  )

  return {
    payload_encrypted: bufferToBase64(ciphertext),
    payload_iv: bufferToBase64(iv.buffer),
    payload_alg: await fingerprintOf(key),
  }
}

export type DecryptResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'no-key' | 'key-mismatch' | 'corrupt' }

/**
 * Reverses encryptPayload. `aad` must be the same client_mutation_id passed
 * at encrypt time or the GCM auth tag check fails (treated as 'corrupt').
 */
export async function decryptPayload<T>(
  encrypted: string,
  iv: string,
  alg: string | null,
  aad: string
): Promise<DecryptResult<T>> {
  const key = await getStoredSessionKey()
  if (!key) return { ok: false, reason: 'no-key' }

  if (alg) {
    const currentAlg = await fingerprintOf(key)
    if (currentAlg !== alg) return { ok: false, reason: 'key-mismatch' }
  }

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBuffer(iv)), additionalData: encoder.encode(aad) },
      key,
      base64ToBuffer(encrypted)
    )
    return { ok: true, value: JSON.parse(new TextDecoder().decode(decrypted)) as T }
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
}
