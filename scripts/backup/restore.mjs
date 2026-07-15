// ClinicMx restore tool. ALWAYS dry-runs first; writes nothing without --confirm.
//
//   node restore.mjs --zip clinicmx-db-2026-07-14.zip --table invoices --id <uuid>   # one row
//   node restore.mjs --zip <file> --patient <patient-uuid>                           # everything for one patient
//   node restore.mjs --zip <file> --table patients                                   # whole table (skips existing)
//   node restore.mjs --zip <file> --all                                              # full DB, dependency order
//   node restore.mjs --files <patient-uuid>                                          # re-upload images from Drive mirror
//
// Add --overwrite to replace existing rows instead of skipping them.
// Add --confirm to actually write. --zip can be a local path, or a backup name
// that exists in Drive's db-backups folder (it will be downloaded).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs } from 'node:util';
import AdmZip from 'adm-zip';
import {
  TABLES_IN_DEPENDENCY_ORDER,
  PATIENT_LINKED_TABLES,
  DB_BACKUP_FOLDER,
  FILES_MIRROR_FOLDER,
  STORAGE_BUCKET,
  loadEnv,
  getSupabase,
  getDrive,
  getOrCreateRootFolder,
  driveList,
  listDrivePathsRecursive,
} from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    zip: { type: 'string' },
    table: { type: 'string' },
    id: { type: 'string', multiple: true },
    patient: { type: 'string' },
    all: { type: 'boolean', default: false },
    files: { type: 'string' },
    overwrite: { type: 'boolean', default: false },
    confirm: { type: 'boolean', default: false },
  },
});

async function resolveZip(drive, rootFolderId) {
  if (fs.existsSync(args.zip)) return args.zip;
  // Not a local file — try to fetch it from Drive's db-backups folder by name.
  const name = path.basename(args.zip);
  console.log(`Local file not found; looking for "${name}" in Drive/${DB_BACKUP_FOLDER}...`);
  const folders = await driveList(
    drive,
    `name = '${DB_BACKUP_FOLDER}' and '${rootFolderId}' in parents and trashed = false`
  );
  if (!folders.length) throw new Error(`Drive folder "${DB_BACKUP_FOLDER}" not found.`);
  const files = await driveList(
    drive,
    `name = '${name}' and '${folders[0].id}' in parents and trashed = false`
  );
  if (!files.length) throw new Error(`"${name}" not found in Drive/${DB_BACKUP_FOLDER}.`);
  const res = await drive.files.get({ fileId: files[0].id, alt: 'media' }, { responseType: 'arraybuffer' });
  const local = path.join(os.tmpdir(), name);
  fs.writeFileSync(local, Buffer.from(res.data));
  console.log(`Downloaded to ${local}`);
  return local;
}

function readTable(zip, table) {
  const entry = zip.getEntry(`${table}.json`);
  if (!entry) throw new Error(`${table}.json not found in the zip.`);
  return JSON.parse(entry.getData().toString('utf8'));
}

// Which of these ids already exist in the live table?
async function existingIds(supabase, table, ids) {
  const found = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.from(table).select('id').in('id', ids.slice(i, i + 500));
    if (error) throw new Error(`check ${table}: ${error.message}`);
    for (const r of data) found.add(String(r.id));
  }
  return found;
}

async function upsertRows(supabase, table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: !args.overwrite });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

// Build { table -> rows[] } for what this invocation should restore.
function selectRows(zip) {
  const plan = new Map();
  if (args.all) {
    for (const t of TABLES_IN_DEPENDENCY_ORDER) plan.set(t, readTable(zip, t));
  } else if (args.patient) {
    const patients = readTable(zip, 'patients').filter((r) => String(r.id) === args.patient);
    if (!patients.length) throw new Error(`Patient ${args.patient} not found in this backup.`);
    plan.set('patients', patients);
    const invoiceIds = new Set();
    for (const t of PATIENT_LINKED_TABLES) {
      const rows = readTable(zip, t).filter((r) => String(r.patient_id) === args.patient);
      if (rows.length) plan.set(t, rows);
      if (t === 'invoices') for (const r of rows) invoiceIds.add(String(r.id));
    }
    for (const t of ['payments', 'payment_plans', 'invoice_history']) {
      const rows = readTable(zip, t).filter((r) => invoiceIds.has(String(r.invoice_id)));
      if (rows.length) plan.set(t, rows);
    }
  } else if (args.table) {
    let rows = readTable(zip, args.table);
    if (args.id?.length) {
      const wanted = new Set(args.id.flatMap((v) => v.split(',')));
      rows = rows.filter((r) => wanted.has(String(r.id)));
      const missing = [...wanted].filter((id) => !rows.some((r) => String(r.id) === id));
      if (missing.length) throw new Error(`Not found in backup ${args.table}: ${missing.join(', ')}`);
    }
    plan.set(args.table, rows);
  } else {
    throw new Error('Nothing selected. Use --table [--id], --patient, --all, or --files. See header comment.');
  }
  // Keep dependency order regardless of how the plan was built.
  return new Map([...plan.entries()].sort(
    (a, b) => TABLES_IN_DEPENDENCY_ORDER.indexOf(a[0]) - TABLES_IN_DEPENDENCY_ORDER.indexOf(b[0])
  ));
}

async function restoreDb(supabase, drive, rootFolderId) {
  const zipPath = await resolveZip(drive, rootFolderId);
  const zip = new AdmZip(zipPath);
  const plan = selectRows(zip);

  console.log('\n--- DRY-RUN SUMMARY ---');
  let totalNew = 0;
  let totalExisting = 0;
  for (const [table, rows] of plan) {
    const existing = await existingIds(supabase, table, rows.map((r) => r.id));
    const newCount = rows.length - existing.size;
    totalNew += newCount;
    totalExisting += existing.size;
    const existingNote = existing.size
      ? args.overwrite ? `${existing.size} OVERWRITTEN` : `${existing.size} skipped (already exist)`
      : '';
    console.log(`  ${table}: ${rows.length} rows in backup → ${newCount} would be inserted${existingNote ? ', ' + existingNote : ''}`);
  }
  console.log(`  TOTAL: ${totalNew} inserted, ${totalExisting} ${args.overwrite ? 'overwritten' : 'skipped'}`);

  if (!args.confirm) {
    console.log('\nDry run only — nothing was written. Re-run with --confirm to apply.');
    return;
  }
  console.log('\nApplying...');
  for (const [table, rows] of plan) {
    await upsertRows(supabase, table, rows);
    console.log(`  ${table}: done`);
  }
  console.log('✅ Restore complete.');
}

async function restoreFiles(supabase, drive, rootFolderId) {
  const mirrors = await driveList(
    drive,
    `name = '${FILES_MIRROR_FOLDER}' and '${rootFolderId}' in parents and trashed = false`
  );
  if (!mirrors.length) throw new Error(`Drive folder "${FILES_MIRROR_FOLDER}" not found.`);
  const patientFolders = await driveList(
    drive,
    `name = '${args.files}' and '${mirrors[0].id}' in parents and trashed = false`
  );
  if (!patientFolders.length) throw new Error(`No mirrored files for patient ${args.files}.`);
  const drivePaths = await listDrivePathsRecursive(drive, patientFolders[0].id, args.files);

  console.log('\n--- DRY-RUN SUMMARY ---');
  const toRestore = [];
  for (const [p, fileId] of drivePaths) {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).download(p);
    const exists = !error;
    console.log(`  ${p}: ${exists ? 'already in bucket (skip)' : 'would be re-uploaded'}`);
    if (!exists) toRestore.push([p, fileId]);
  }
  console.log(`  TOTAL: ${toRestore.length} files to re-upload of ${drivePaths.size} mirrored`);

  if (!args.confirm) {
    console.log('\nDry run only — nothing was written. Re-run with --confirm to apply.');
    return;
  }
  for (const [p, fileId] of toRestore) {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(p, Buffer.from(res.data));
    if (error) throw new Error(`upload ${p}: ${error.message}`);
    console.log(`  restored ${p}`);
  }
  console.log('✅ File restore complete.');
}

async function main() {
  loadEnv();
  const supabase = getSupabase();
  const drive = getDrive();
  const rootFolderId = await getOrCreateRootFolder(drive);
  if (args.files) {
    await restoreFiles(supabase, drive, rootFolderId);
  } else {
    if (!args.zip) throw new Error('--zip <backup file> is required for database restores.');
    await restoreDb(supabase, drive, rootFolderId);
  }
}

main().catch((err) => {
  console.error(`❌ Restore failed: ${err.message}`);
  process.exit(1);
});
