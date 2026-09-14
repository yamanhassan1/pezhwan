#!/usr/bin/env node
/**
 * PEZHWAN — backup archive verifier.
 *
 * Unpacks and validates a `.pzbu` archive: header integrity, file-list match,
 * decrypt/decompress (proving the key is correct), and optionally attempts a
 * full logical restore into a disposable in-memory Mongo to prove the data is
 * recoverable.
 *
 *   node scripts/verify-backup.mjs <archive>
 *     --restore          spin up MongoMemoryServer and import the dump
 *     --checksum <hex>   expected SHA-256 of the raw archive file
 *     --keep             don't delete the unpacked dump directory after verify
 *
 * Env:
 *   PEZHWAN_BACKUP_KEY  base64 32-byte AES-256 key (required unless encrypted=false)
 *   PEZHWAN_BACKUP_KEY_SKIP=1 allows verifying an unencrypted archive
 */

import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';

import { requireBackupKey, unpackageBackup, logicalRestore } from './lib/backup-util.mjs';

function parseArgs(argv) {
  const flags = { restore: false, keep: false, checksum: null };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--restore') flags.restore = true;
    else if (a === '--keep') flags.keep = true;
    else if (a === '--checksum') flags.checksum = argv[++i];
    else positional.push(a);
  }
  return { flags, archivePath: positional[0] };
}

async function verifyFileIntegrity(header, dumpDir) {
  const expected = new Set(header.files.map((f) => f.name));
  const actual = new Set(await readdir(dumpDir));

  const missing = [...expected].filter((f) => !actual.has(f));
  const extra = [...actual].filter((f) => !expected.has(f) && !f.startsWith('.'));

  if (missing.length > 0) {
    throw new Error(`Missing expected files in dump: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    throw new Error(`Unexpected files in dump: ${extra.join(', ')}`);
  }

  for (const f of header.files) {
    const info = await stat(join(dumpDir, f.name));
    if (info.size !== f.length) {
      throw new Error(
        `Size mismatch for "${f.name}": expected ${f.length} bytes, got ${info.size}`,
      );
    }
  }
}

async function main() {
  const { flags, archivePath } = parseArgs(process.argv);

  if (!archivePath) {
    console.error('Usage: node scripts/verify-backup.mjs <archive> [--restore] [--checksum <hex>]');
    process.exit(1);
  }

  const dumpDir = await mkdtemp(join(tmpdir(), 'pzhw-verify-'));

  try {
    const key = requireBackupKey();
    const { header, files, checksum } = await unpackageBackup(archivePath, dumpDir, { key });

    console.log(`[verify] format     : ${header.format}`);
    console.log(`[verify] strategy   : ${header.strategy}`);
    console.log(`[verify] files      : ${header.fileCount}`);
    console.log(`[verify] created    : ${header.createdAt}`);
    console.log(`[verify] encrypted  : ${header.encrypted}`);
    console.log(`[verify] checksum   : ${checksum}`);

    if (flags.checksum && flags.checksum !== checksum) {
      throw new Error(`Checksum mismatch: expected ${flags.checksum}, got ${checksum}`);
    }

    await verifyFileIntegrity(header, dumpDir);
    console.log(`[verify] file integrity: OK (${files.length} files, sizes match)`);

    if (flags.restore) {
      console.log('[verify] attempting logical restore into MongoMemoryServer…');
      let MongoMemoryServer;
      try {
        MongoMemoryServer = (await import('mongodb-memory-server')).MongoMemoryServer;
      } catch {
        throw new Error(
          'mongodb-memory-server is required for --restore; install it or omit the flag',
        );
      }
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      const dbName = header.database ?? 'pezhwan';
      await logicalRestore(uri, dumpDir, { dbName });
      console.log(`[verify] restore    : OK (database "${dbName}")`);

      const mongoose = (await import('mongoose')).default;
      mongoose.connection.on('error', () => {});
      try {
        await mongoose.connect(uri, { maxPoolSize: 2 });
        const db = mongoose.connection.client.db(dbName);
        const collections = await db.listCollections().toArray();
        const names = collections.map((c) => c.name);
        console.log(`[verify] collections: ${names.join(', ') || '(none)'}`);
      } catch (err) {
        console.warn(`[verify] collection listing failed (non-fatal): ${err.message}`);
      } finally {
        await mongoose.disconnect().catch(() => {});
      }

      await mongod.stop().catch(() => {});
    }

    console.log('[verify] PASS — archive is intact and recoverable');
  } catch (err) {
    console.error(`[verify] FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    if (!flags.keep) {
      await rm(dumpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'verify-backup.mjs') {
  main();
}
