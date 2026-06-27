const SESSION_ENCRYPTION_KEY = 'clinicmx_session_encryption_key'
const KDF_SALT = 'clinicmx-web-secure-storage-v1'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bufferToBase64(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToBuffer(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)).buffer
}

async function deriveKeyMaterial(passphrase: string) {
  return crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
}

async function deriveSessionKey(passphrase: string) {
  const keyMaterial = await deriveKeyMaterial(passphrase)
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(KDF_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

async function importStoredKey(rawKey: string) {
  return crypto.subtle.importKey('raw', base64ToBuffer(rawKey), 'AES-GCM', true, ['encrypt', 'decrypt'])
}

async function getStoredSessionKey() {
  if (typeof window === 'undefined') return null

  const rawKey = sessionStorage.getItem(SESSION_ENCRYPTION_KEY)
  if (!rawKey) return null

  try {
    return await importStoredKey(rawKey)
  } catch {
    sessionStorage.removeItem(SESSION_ENCRYPTION_KEY)
    return null
  }
}

export function hasSessionEncryptionKey() {
  return typeof window !== 'undefined' && Boolean(sessionStorage.getItem(SESSION_ENCRYPTION_KEY))
}

export async function initializeSecureStorage(passphrase: string) {
  if (typeof window === 'undefined') return

  const sessionKey = await deriveSessionKey(passphrase)
  const rawKey = await crypto.subtle.exportKey('raw', sessionKey)
  sessionStorage.setItem(SESSION_ENCRYPTION_KEY, bufferToBase64(rawKey))
}

export function clearSecureStorageSession() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(SESSION_ENCRYPTION_KEY)
}

export async function writeSecureJson(storageKey: string, value: unknown) {
  if (typeof window === 'undefined') return false

  const sessionKey = await getStoredSessionKey()
  if (!sessionKey) return false

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const payload = encoder.encode(JSON.stringify(value))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, payload)

  localStorage.setItem(
    storageKey,
    JSON.stringify({
      iv: bufferToBase64(iv.buffer),
      payload: bufferToBase64(encrypted),
    })
  )

  return true
}

export async function readSecureJson<T>(storageKey: string) {
  if (typeof window === 'undefined') return null as T | null

  const rawValue = localStorage.getItem(storageKey)
  if (!rawValue) return null as T | null

  const sessionKey = await getStoredSessionKey()
  if (!sessionKey) return null as T | null

  try {
    const parsed = JSON.parse(rawValue) as { iv: string; payload: string }
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(base64ToBuffer(parsed.iv)) },
      sessionKey,
      base64ToBuffer(parsed.payload)
    )
    return JSON.parse(decoder.decode(decrypted)) as T
  } catch {
    return null as T | null
  }
}
