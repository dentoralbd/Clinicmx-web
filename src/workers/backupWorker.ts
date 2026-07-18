// Off-main-thread engine for device backups. All CPU-heavy work happens here
// (JSON stringify/parse, gzip, encryption, hashing) so the UI never freezes,
// even with 3000+ patients (50–150 MB of JSON). See deviceBackup.ts for the
// main-thread side of the protocol.
//
// Serialization is incremental: the JSON document is written table-by-table
// into the CompressionStream and references are released as we go, so peak
// memory is roughly one table's rows — never the whole database as one
// string. The `kind` field is written FIRST so the server can validate a
// gzipped upload by decompressing only the first few KB.

import { encryptBytes, decryptBytes, gunzipBytes, isEncrypted, isGzip, sha256Hex } from '../lib/backupCrypto'

type Row = Record<string, unknown>

interface SerializeStartMsg {
  type: 'serialize-start'
  /** Everything except `tables`, pre-ordered: kind must be first. */
  meta: { kind: string; version: number; app: string; created_at: string; counts: Record<string, number> }
  passphrase: string | null
}
interface SerializeTableMsg {
  type: 'serialize-table'
  table: string
  rows: Row[]
}
interface SerializeFinishMsg {
  type: 'serialize-finish'
  localSettings: unknown
}
interface ParseMsg {
  type: 'parse'
  buffer: ArrayBuffer
  passphrase: string | null
}

type InMsg = SerializeStartMsg | SerializeTableMsg | SerializeFinishMsg | ParseMsg

// --- serialization state (one job at a time; UI enforces single-flight) ---

let writer: WritableStreamDefaultWriter | null = null
let collected: Promise<ArrayBuffer> | null = null
let passphrase: string | null = null
let firstTable = true
const encoder = new TextEncoder()

async function startSerialize(msg: SerializeStartMsg) {
  const cs = new CompressionStream('gzip')
  collected = new Response(cs.readable).arrayBuffer()
  writer = cs.writable.getWriter()
  passphrase = msg.passphrase
  firstTable = true
  // kind first — the server's cheap prefix validation depends on this order.
  const { kind, version, app, created_at, counts } = msg.meta
  const head =
    `{"kind":${JSON.stringify(kind)},"version":${version},"app":${JSON.stringify(app)},` +
    `"created_at":${JSON.stringify(created_at)},"counts":${JSON.stringify(counts)},"tables":{`
  await writer.write(encoder.encode(head))
}

async function writeTable(msg: SerializeTableMsg) {
  if (!writer) throw new Error('serialize-table before serialize-start')
  const prefix = firstTable ? '' : ','
  firstTable = false
  await writer.write(encoder.encode(`${prefix}${JSON.stringify(msg.table)}:${JSON.stringify(msg.rows)}`))
}

async function finishSerialize(msg: SerializeFinishMsg) {
  if (!writer || !collected) throw new Error('serialize-finish before serialize-start')
  await writer.write(encoder.encode(`},"local_settings":${JSON.stringify(msg.localSettings)}}`))
  await writer.close()
  let bytes: Uint8Array = new Uint8Array(await collected)
  writer = null
  collected = null
  if (passphrase) {
    bytes = await encryptBytes(bytes, passphrase)
  }
  const sha256 = await sha256Hex(bytes)
  const buffer = bytes.buffer as ArrayBuffer
  postMessage({ type: 'serialized', buffer, sha256, encrypted: !!passphrase }, { transfer: [buffer] })
  passphrase = null
}

async function parse(msg: ParseMsg) {
  let bytes: Uint8Array = new Uint8Array(msg.buffer)
  let encrypted = false
  if (isEncrypted(bytes)) {
    if (!msg.passphrase) {
      postMessage({ type: 'needs-passphrase' })
      return
    }
    encrypted = true
    bytes = await decryptBytes(bytes, msg.passphrase)
  }
  if (isGzip(bytes)) {
    bytes = await gunzipBytes(bytes)
  }
  const text = new TextDecoder().decode(bytes)
  const backup = JSON.parse(text)
  postMessage({ type: 'parsed', backup, encrypted })
}

self.onmessage = async (event: MessageEvent<InMsg>) => {
  const msg = event.data
  try {
    if (msg.type === 'serialize-start') await startSerialize(msg)
    else if (msg.type === 'serialize-table') await writeTable(msg)
    else if (msg.type === 'serialize-finish') await finishSerialize(msg)
    else if (msg.type === 'parse') await parse(msg)
  } catch (error) {
    writer = null
    collected = null
    passphrase = null
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Backup worker failed.',
    })
  }
}
