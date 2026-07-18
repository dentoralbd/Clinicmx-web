// Shared helpers for backup.mjs / restore.mjs (Node 20+, ESM).
// Standalone tooling — not imported by the app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// All 24 tables as of migration 027. Ordered parents-before-children so a
// full restore satisfies foreign keys (patients → appointments → invoices → payments...).
export const TABLES_IN_DEPENDENCY_ORDER = [
  'patients',
  'medication_templates',
  'investigation_templates',
  'inventory_items',
  'invoice_templates',
  'payment_methods',
  'invoice_settings',
  'doctor_profiles',
  'app_users',
  'authorized_ips', // after app_users: authorized_ips.user_id (migration 027)
  'delete_history',
  'edit_history',
  'activity_log',
  'appointments',
  'patient_visits',
  'patient_files',
  'dental_records',
  'prescriptions',
  'invoices',
  'treatments', // after invoices: treatments.invoice_id (migration 010)
  'payments',
  'payment_plans',
  'invoice_history',
  'inventory_movements',
];

// Tables with a patient_id column, for --patient restores.
export const PATIENT_LINKED_TABLES = [
  'appointments',
  'patient_visits',
  'patient_files',
  'dental_records',
  'prescriptions',
  'invoices',
  'treatments',
];

export const STORAGE_BUCKET = 'patient-files';
export const DB_BACKUP_FOLDER = 'db-backups';
export const FILES_MIRROR_FOLDER = 'patient-files';
export const ROOT_FOLDER_NAME = 'ClinicMx Backups';
export const OAUTH_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// --- env ---------------------------------------------------------------

const ENV_FILE = path.join(SCRIPT_DIR, '.env.backup');

export function loadEnv() {
  // Local runs read scripts/backup/.env.backup (gitignored); CI uses real env vars.
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  }
}

export function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    console.error('Locally: put them in scripts/backup/.env.backup — see README.md.');
    process.exit(1);
  }
}

// Persists a key=value into .env.backup (only meaningful for local runs — in CI
// this file doesn't exist and the value is just logged for the user to save as a secret).
export function saveEnvLocal(key, value) {
  if (!fs.existsSync(ENV_FILE)) return false;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  const line = `${key}=${value}`;
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  fs.writeFileSync(ENV_FILE, lines.join('\n'));
  return true;
}

export function getSupabase() {
  requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function getOAuth2Client() {
  requireEnv(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']);
  return new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function getDrive() {
  requireEnv(['GOOGLE_OAUTH_REFRESH_TOKEN']);
  const auth = getOAuth2Client();
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

// Reuses GOOGLE_DRIVE_FOLDER_ID if it's still valid (accessible with our drive.file
// scope), otherwise creates a fresh "ClinicMx Backups" folder the app owns — since
// drive.file only grants access to files the app itself created, this is the folder
// backup.mjs/restore.mjs will use going forward.
export async function getOrCreateRootFolder(drive) {
  const existingId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (existingId) {
    try {
      await drive.files.get({ fileId: existingId, fields: 'id' });
      return existingId;
    } catch {
      console.log(`GOOGLE_DRIVE_FOLDER_ID (${existingId}) is not accessible with this token — creating a new folder.`);
    }
  }
  const res = await drive.files.create({
    requestBody: { name: ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  const id = res.data.id;
  console.log(`Created Drive folder "${ROOT_FOLDER_NAME}" (id: ${id})`);
  if (saveEnvLocal('GOOGLE_DRIVE_FOLDER_ID', id)) {
    console.log('Saved GOOGLE_DRIVE_FOLDER_ID to .env.backup');
  } else {
    console.log(`⚠️  Save this as the GOOGLE_DRIVE_FOLDER_ID GitHub secret: ${id}`);
  }
  return id;
}

// --- supabase helpers ---------------------------------------------------

export async function fetchAllRows(supabase, table) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetch ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

// Recursively walk the storage bucket; returns paths like "pid/category/file.jpg".
export async function listStoragePaths(supabase, prefix = '') {
  const paths = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(prefix, { limit: pageSize, offset });
    if (error) throw new Error(`storage list "${prefix}": ${error.message}`);
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        paths.push(...(await listStoragePaths(supabase, full)));
      } else {
        paths.push(full);
      }
    }
    if (data.length < pageSize) break;
  }
  return paths;
}

// --- drive helpers ------------------------------------------------------

export async function driveList(drive, q, fields = 'id, name') {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken,
    });
    files.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export async function ensureFolder(drive, name, parentId) {
  const esc = name.replace(/'/g, "\\'");
  const existing = await driveList(
    drive,
    `name = '${esc}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`
  );
  if (existing.length) return existing[0].id;
  const res = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
  });
  return res.data.id;
}

// Walk a Drive folder tree; returns Map of "relative/path" -> fileId.
export async function listDrivePathsRecursive(drive, folderId, prefix = '') {
  const map = new Map();
  const entries = await driveList(
    drive,
    `'${folderId}' in parents and trashed = false`,
    'id, name, mimeType'
  );
  for (const e of entries) {
    const full = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.mimeType === FOLDER_MIME) {
      for (const [p, id] of await listDrivePathsRecursive(drive, e.id, full)) map.set(p, id);
    } else {
      map.set(full, e.id);
    }
  }
  return map;
}

export async function uploadBufferToDrive(drive, { name, parentId, buffer, mimeType }) {
  const { Readable } = await import('node:stream');
  const res = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id',
  });
  return res.data.id;
}
