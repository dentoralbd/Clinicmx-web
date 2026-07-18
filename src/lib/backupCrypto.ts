// Compression, encryption, and hashing primitives for device backups.
// All native browser/worker APIs (CompressionStream, WebCrypto) — no deps.
//
// Encrypted backup envelope (.json.enc):
//   bytes 0-6   ASCII "CMXENC1"
//   bytes 7-22  PBKDF2 salt (16)
//   bytes 23-34 AES-GCM IV (12)
//   bytes 35+   AES-GCM ciphertext of the GZIPPED backup JSON
// The passphrase never leaves the device; losing it makes the file unreadable.

export const ENC_MAGIC = 'CMXENC1'
const ENC_MAGIC_BYTES = new TextEncoder().encode(ENC_MAGIC)
const SALT_LENGTH = 16
const IV_LENGTH = 12
const PBKDF2_ITERATIONS = 310_000

export const GZIP_MAGIC_0 = 0x1f
export const GZIP_MAGIC_1 = 0x8b

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1
}

export function isEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < ENC_MAGIC_BYTES.length) return false
  for (let i = 0; i < ENC_MAGIC_BYTES.length; i++) {
    if (bytes[i] !== ENC_MAGIC_BYTES[i]) return false
  }
  return true
}

export async function gzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function gunzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Encrypts (already-gzipped) bytes into the CMXENC1 envelope. */
export async function encryptBytes(gzipped: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, gzipped as BufferSource)
  )
  const out = new Uint8Array(ENC_MAGIC_BYTES.length + SALT_LENGTH + IV_LENGTH + ciphertext.length)
  out.set(ENC_MAGIC_BYTES, 0)
  out.set(salt, ENC_MAGIC_BYTES.length)
  out.set(iv, ENC_MAGIC_BYTES.length + SALT_LENGTH)
  out.set(ciphertext, ENC_MAGIC_BYTES.length + SALT_LENGTH + IV_LENGTH)
  return out
}

/** Decrypts a CMXENC1 envelope back to the gzipped bytes. Throws on wrong passphrase. */
export async function decryptBytes(envelope: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (!isEncrypted(envelope)) throw new Error('Not an encrypted ClinicMx backup.')
  const saltStart = ENC_MAGIC_BYTES.length
  const ivStart = saltStart + SALT_LENGTH
  const dataStart = ivStart + IV_LENGTH
  const salt = envelope.slice(saltStart, ivStart)
  const iv = envelope.slice(ivStart, dataStart)
  const ciphertext = envelope.slice(dataStart)
  const key = await deriveKey(passphrase, salt)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    )
    return new Uint8Array(plain)
  } catch {
    throw new Error('Wrong passphrase (or the file is corrupted).')
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
