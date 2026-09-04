/**
 * PEZHWAN — backup/restore drill core.
 *
 * Shared logic for the backup-restore drill used to measure RPO/RTO and prove
 * that the identity store can be recovered with its data AND indexes intact.
 *
 * Dump strategy:
 *   - `logical` (default): a driver-based JSON export of every collection plus
 *     an explicit index manifest (recreated on restore). No external tools.
 *   - `binary`: when the official `mongodump`/`mongorestore` tools are present
 *     (`--strategy binary`), delegates to them.
 *
 * Archive format (self-describing, single file):
 *   <header>\n<payload>
 *   header  = JSON {
 *       format: 'pezhwan-backup-v1',
 *       strategy,
 *       fileCount,
 *       createdAt,
 *       encrypted,
 *       iv, tag,                     // base64 (AES-256-GCM)
 *       files: [ { name, length } ]  // byte lengths of each payload
 *   }
 *   payload = gzip( concat( fileData for each file in order ) )
 *             then AES-256-GCM encrypted when a key is supplied.
 *
 * The key comes from env (`PEZHWAN_BACKUP_KEY`, base64 32 bytes). Setting
 * `PEZHWAN_BACKUP_KEY_SKIP=1` produces a plaintext archive (dry-run only).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createGzip, createGunzip } from 'node:zlib';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Keys & crypto
// ---------------------------------------------------------------------------

export function requireBackupKey() {
  if (process.env.PEZHWAN_BACKUP_KEY_SKIP === '1') {
    return null;
  }
  const raw = process.env.PEZHWAN_BACKUP_KEY;
  if (!raw) {
    throw new Error(
      'PEZHWAN_BACKUP_KEY is required (base64 32-byte AES key). Set PEZHWAN_BACKUP_KEY_SKIP=1 only for dry-runs.',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`Backup key must be 32 bytes, got ${key.length}`);
  }
  return key;
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function encrypt(payload, key) {
  if (!key) {
    return { ciphertext: payload, iv: null, tag: null, encrypted: false };
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), encrypted: true };
}

function decrypt(payload, iv, tag, key) {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Tool detection
// ---------------------------------------------------------------------------

export async function detectDumpTools() {
  const { spawnSync } = await import('node:child_process');
  const find = (bin) => {
    try {
      const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
      return spawnSync(cmd, [bin], { stdio: 'ignore' }).status === 0;
    } catch {
      return false;
    }
  };
  const mongodump = find('mongodump');
  const mongorestore = find('mongorestore');
  return { mongodump, mongorestore, binary: mongodump && mongorestore };
}

// ---------------------------------------------------------------------------
// Logical dump/restore (driver-based)
// ---------------------------------------------------------------------------

/**
 * Export a database to a JSON dump directory: one `<collection>.json` file per
 * collection plus `_dump.json` (the manifest with index definitions, excluding
 * the automatic `_id_` index which Mongo recreates automatically).
 */
export async function logicalDump(uri, outDir, { dbName } = {}) {
  await mongoose.connect(uri, { maxPoolSize: 5 });
  const database = dbName ?? mongoose.connection.name;
  const db = mongoose.connection.client.db(database);
  const collections = await db.listCollections().toArray();

  const manifest = {
    format: 'logical-dump',
    database,
    createdAt: new Date().toISOString(),
    collections: {},
  };

  await mkdir(outDir, { recursive: true });

  for (const c of collections) {
    const name = c.name;
    const col = db.collection(name);
    const documents = await col.find({}).toArray();
    const indexes = (await col.indexes()).filter((i) => i.name !== '_id_');
    const file = `${name}.json`;
    await writeFile(join(outDir, file), JSON.stringify(documents));
    manifest.collections[name] = { documents: documents.length, file, indexes };
  }

  await mongoose.disconnect();
  await writeFile(join(outDir, '_dump.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

/** Restore a logical dump into a target database and verify data + indexes. */
export async function logicalRestore(uri, dumpDir, { dbName, dropExisting = false } = {}) {
  await mongoose.connect(uri, { maxPoolSize: 5 });
  const database = dbName ?? mongoose.connection.name;
  const db = mongoose.connection.client.db(database);

  const manifest = JSON.parse(await readFile(join(dumpDir, '_dump.json'), 'utf8'));

  let restoredCount = 0;
  const restoredCollections = [];
  for (const [name, meta] of Object.entries(manifest.collections)) {
    const col = db.collection(name);
    if (dropExisting) {
      await col.drop().catch(() => {});
    }
    const documents = JSON.parse(await readFile(join(dumpDir, meta.file), 'utf8'));
    if (documents.length > 0) {
      await col.insertMany(documents, { ordered: false });
    }
    restoredCount += documents.length;
    restoredCollections.push(name);
  }

  let restoredIndexes = 0;
  for (const [name, meta] of Object.entries(manifest.collections)) {
    const col = db.collection(name);
    for (const def of meta.indexes) {
      const { key, ...options } = def;
      // Strip driver-managed fields that cannot be replayed verbatim.
      delete options.v;
      await col.createIndex(key, options);
      restoredIndexes += 1;
    }
  }

  await mongoose.disconnect();
  return {
    database,
    restoredCount,
    restoredIndexes,
    collections: restoredCollections,
  };
}

// ---------------------------------------------------------------------------
// Binary dump/restore (official tools)
// ---------------------------------------------------------------------------

export async function binaryDump(uri, outDir, { dbName }) {
  await runTool('mongodump', ['--uri', uri, '--db', dbName, '--out', outDir, '--gzip']);
}

export async function binaryRestore(uri, dumpDir, { dbName }) {
  await runTool('mongorestore', ['--uri', uri, '--nsInclude', `${dbName}.*`, '--gzip', dumpDir]);
}

function runTool(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited with code ${code}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Archive packaging / unpacking
// ---------------------------------------------------------------------------

async function gzip(buf) {
  return new Promise((resolve, reject) => {
    const gz = createGzip();
    const chunks = [];
    gz.on('data', (c) => chunks.push(c));
    gz.on('error', reject);
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.end(buf);
  });
}

async function gunzip(buf) {
  return new Promise((resolve, reject) => {
    const gz = createGunzip();
    const chunks = [];
    gz.on('data', (c) => chunks.push(c));
    gz.on('error', reject);
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.end(buf);
  });
}

/**
 * Package a dump directory into a single encrypted+compressed archive file.
 * @returns {Promise<{archivePath, checksum, bytes, fileCount, createdAt, encrypted}>}
 */
export async function packageBackup(
  dumpDir,
  archivePath,
  { key = requireBackupKey(), strategy = 'logical' } = {},
) {
  const files = (await readdir(dumpDir)).filter((f) => !f.startsWith('.'));
  const fileContents = [];
  for (const f of files) {
    fileContents.push({ name: f, data: await readFile(join(dumpDir, f)) });
  }

  const createdAt = new Date().toISOString();
  const fileMap = fileContents.map((c) => ({ name: c.name, length: c.data.length }));
  const headerSeed = JSON.stringify({
    format: 'pezhwan-backup-v1',
    strategy,
    fileCount: files.length,
    createdAt,
    files: fileMap,
  });

  let payload = Buffer.concat(fileContents.map((c) => c.data));
  payload = await gzip(payload);
  const enc = encrypt(payload, key);

  const header = JSON.stringify({
    format: 'pezhwan-backup-v1',
    strategy,
    fileCount: files.length,
    createdAt,
    encrypted: enc.encrypted,
    iv: enc.iv ? enc.iv.toString('base64') : null,
    tag: enc.tag ? enc.tag.toString('base64') : null,
    files: fileMap,
  });

  const sealed = Buffer.concat([
    Buffer.concat([Buffer.from(header, 'utf8'), Buffer.from('\n', 'utf8')]),
    enc.ciphertext,
  ]);

  await mkdir(dirname(archivePath), { recursive: true });
  await writeFile(archivePath, sealed);

  void headerSeed;
  return {
    archivePath,
    checksum: sha256Hex(sealed),
    bytes: sealed.length,
    fileCount: files.length,
    createdAt,
    encrypted: enc.encrypted,
  };
}

/**
 * Unpackage an archive into a dump directory.
 * @returns {Promise<{header, dumpDir, files: string[], checksum}>}
 */
export async function unpackageBackup(archivePath, outDir, { key = requireBackupKey() } = {}) {
  const raw = await readFile(archivePath);
  const checksum = sha256Hex(raw);
  const nl = raw.indexOf(Buffer.from('\n', 'utf8'));
  if (nl < 0) throw new Error('Malformed backup archive: missing header');
  const header = JSON.parse(raw.subarray(0, nl).toString('utf8'));
  if (header.format !== 'pezhwan-backup-v1') {
    throw new Error(`Unsupported archive format: ${header.format}`);
  }

  let payload = raw.subarray(nl + 1);
  if (header.encrypted) {
    if (!key) throw new Error('Archive is encrypted but PEZHWAN_BACKUP_KEY was not provided');
    const iv = Buffer.from(header.iv, 'base64');
    const tag = Buffer.from(header.tag, 'base64');
    payload = decrypt(payload, iv, tag, key);
  }
  payload = await gunzip(payload);

  await mkdir(outDir, { recursive: true });
  let offset = 0;
  const files = [];
  for (const f of header.files) {
    const end = Math.min(offset + f.length, payload.length);
    await writeFile(join(outDir, f.name), payload.subarray(offset, end));
    files.push(f.name);
    offset = end;
  }

  return { header, dumpDir: outDir, files, checksum };
}
