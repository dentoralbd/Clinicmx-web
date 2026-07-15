// Daily ClinicMx backup: dump all Supabase tables to a dated zip in Google Drive
// and mirror the patient-files storage bucket into Drive (upload-only, never deletes).
// Read-only against Supabase. Run: node backup.mjs  (env via .env.backup locally or CI secrets)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import archiver from 'archiver';
import {
  TABLES_IN_DEPENDENCY_ORDER,
  DB_BACKUP_FOLDER,
  FILES_MIRROR_FOLDER,
  STORAGE_BUCKET,
  loadEnv,
  getSupabase,
  getDrive,
  getOrCreateRootFolder,
  fetchAllRows,
  listStoragePaths,
  driveList,
  ensureFolder,
  listDrivePathsRecursive,
  uploadBufferToDrive,
} from './lib.mjs';

const RETENTION_DAYS = 30;

async function dumpDatabase(supabase) {
  const dumps = {};
  const counts = {};
  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    const rows = await fetchAllRows(supabase, table);
    dumps[table] = rows;
    counts[table] = rows.length;
    console.log(`  ${table}: ${rows.length} rows`);
  }
  if (counts.patients === 0) {
    throw new Error('Sanity check failed: patients table returned 0 rows — refusing to produce an empty backup.');
  }
  return { dumps, counts };
}

async function zipDumps(dumps, zipPath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const [table, rows] of Object.entries(dumps)) {
      archive.append(JSON.stringify(rows, null, 1), { name: `${table}.json` });
    }
    archive.finalize();
  });
  return fs.statSync(zipPath).size;
}

async function uploadDbZip(drive, rootFolderId, zipPath, zipName) {
  const dbFolderId = await ensureFolder(drive, DB_BACKUP_FOLDER, rootFolderId);
  // Same-day rerun: replace rather than duplicate.
  const dupes = await driveList(
    drive,
    `name = '${zipName}' and '${dbFolderId}' in parents and trashed = false`
  );
  for (const d of dupes) await drive.files.delete({ fileId: d.id });
  await uploadBufferToDrive(drive, {
    name: zipName,
    parentId: dbFolderId,
    buffer: fs.readFileSync(zipPath),
    mimeType: 'application/zip',
  });
  return dbFolderId;
}

async function pruneOldZips(drive, dbFolderId) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = await driveList(
    drive,
    `'${dbFolderId}' in parents and trashed = false`,
    'id, name, createdTime'
  );
  let pruned = 0;
  for (const f of files) {
    const m = f.name.match(/^clinicmx-db-(\d{4}-\d{2}-\d{2})\.zip$/);
    if (!m) continue; // never touch files we didn't create
    if (new Date(`${m[1]}T00:00:00Z`).getTime() < cutoff) {
      await drive.files.delete({ fileId: f.id });
      pruned++;
      console.log(`  pruned old backup: ${f.name}`);
    }
  }
  return pruned;
}

async function mirrorPatientFiles(supabase, drive, rootFolderId) {
  const mirrorId = await ensureFolder(drive, FILES_MIRROR_FOLDER, rootFolderId);
  const [storagePaths, drivePaths] = await Promise.all([
    listStoragePaths(supabase),
    listDrivePathsRecursive(drive, mirrorId),
  ]);
  const missing = storagePaths.filter((p) => !drivePaths.has(p));
  console.log(`  storage files: ${storagePaths.length}, already in Drive: ${storagePaths.length - missing.length}, to upload: ${missing.length}`);

  const folderCache = new Map(); // "relative/dir" -> drive folder id
  async function folderFor(dir) {
    if (dir === '') return mirrorId;
    if (folderCache.has(dir)) return folderCache.get(dir);
    const parent = await folderFor(path.posix.dirname(dir) === '.' ? '' : path.posix.dirname(dir));
    const id = await ensureFolder(drive, path.posix.basename(dir), parent);
    folderCache.set(dir, id);
    return id;
  }

  let uploaded = 0;
  for (const p of missing) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(p);
    if (error) throw new Error(`storage download ${p}: ${error.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const dir = path.posix.dirname(p) === '.' ? '' : path.posix.dirname(p);
    await uploadBufferToDrive(drive, {
      name: path.posix.basename(p),
      parentId: await folderFor(dir),
      buffer,
      mimeType: data.type || undefined,
    });
    uploaded++;
    console.log(`  uploaded ${p} (${uploaded}/${missing.length})`);
  }
  return { total: storagePaths.length, uploaded };
}

async function main() {
  loadEnv();
  const supabase = getSupabase();
  const drive = getDrive();
  const rootFolderId = await getOrCreateRootFolder(drive);
  const today = new Date().toISOString().slice(0, 10);
  const zipName = `clinicmx-db-${today}.zip`;

  console.log(`ClinicMx backup ${today}`);
  console.log('Dumping database tables...');
  const { dumps, counts } = await dumpDatabase(supabase);

  const zipPath = path.join(os.tmpdir(), zipName);
  const zipSize = await zipDumps(dumps, zipPath);
  console.log(`Zipped ${Object.keys(dumps).length} tables → ${zipName} (${(zipSize / 1024).toFixed(1)} KB)`);

  console.log('Uploading database zip to Drive...');
  const dbFolderId = await uploadDbZip(drive, rootFolderId, zipPath, zipName);
  fs.unlinkSync(zipPath);

  console.log(`Pruning zips older than ${RETENTION_DAYS} days...`);
  await pruneOldZips(drive, dbFolderId);

  console.log('Mirroring patient-files bucket to Drive...');
  const mirror = await mirrorPatientFiles(supabase, drive, rootFolderId);

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log('');
  console.log(`✅ Backup complete: ${Object.keys(counts).length} tables / ${totalRows} rows in ${zipName}; ` +
    `${mirror.total} patient files mirrored (${mirror.uploaded} new).`);
}

main().catch((err) => {
  console.error(`❌ Backup FAILED: ${err.message}`);
  process.exit(1);
});
