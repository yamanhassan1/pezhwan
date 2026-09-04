/**
 * PEZHWAN — backup drill.
 *
 * Produces a timestamped, encrypted, compressed backup archive of the identity
 * database together with an evidence manifest used to measure RPO (backup age).
 *
 *   node scripts/backup-drill.mjs
 *     --source <mongodb://uri>          source database (default: PEZHWAN_MONGODB_URI)
 *     --db <database>                   database name
 *     --out <archive.tar.gz>            archive path (default: backups/pezhwan-<ts>.pzbu)
 *     --strategy <logical|binary>       dump method (default: logical)
 *     --seed                            boot an in-memory Mongo and seed demo
 *                                       identity data before dumping (drill mode)
 *     --keep-dump-dir                   don't delete the intermediate dump dir
 *
 * Env:
 *   PEZHWAN_BACKUP_KEY      base64 32-byte AES-256 key (required unless PEZHWAN_BACKUP_KEY_SKIP=1)
 *   PEZHWAN_MONGODB_URI     default Mongo connection string
 *
 * Records: archive path, checksum, byte size, timestamp, RPO (age of the
 * newest document vs. backup time).
 */

import { rm, mkdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  requireBackupKey,
  logicalDump,
  binaryDump,
  detectDumpTools,
  packageBackup,
} from './lib/backup-util.mjs';

function parseArgs(argv) {
  const flags = { seed: false, keepDumpDir: false, strategy: 'logical' };
  const opts = { source: null, db: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') flags.seed = true;
    else if (a === '--keep-dump-dir') flags.keepDumpDir = true;
    else if (a === '--strategy') flags.strategy = argv[++i];
    else if (a === '--source') opts.source = argv[++i];
    else if (a === '--db') opts.db = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
  }
  return { flags, opts };
}

async function seedIdentityData(uri, dbName) {
  await mongoose.connect(uri, { maxPoolSize: 5 });
  const db = mongoose.connection.useDb(dbName);

  // Mirror the real schema indexes so the drill genuinely proves that indexes
  // (not just documents) survive backup → restore.
  await db
    .collection('users')
    .createIndex(
      { tenantId: 1, email: 1 },
      { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
    );
  await db.collection('sessions').createIndex({ currentRefreshTokenHash: 1 }, { unique: true });
  await db.collection('sessions').createIndex({
    userId: 1,
    tenantId: 1,
    applicationId: 1,
    status: 1,
  });
  await db.collection('auditlogs').createIndex({ sequence: 1 }, { unique: true });

  const user = await db.collection('users').insertOne({
    tenantId: 't_demo',
    email: 'drill@pezhwan.dev',
    emailVerified: true,
    isActive: true,
    tokenVersion: 0,
    passwordHash: '$argon2id$v=19$m=65536,t=2,p=1$drill-salt$drill-hash',
    failedLoginAttempts: 0,
    mfaEnabled: false,
    metadata: { drill: true, seededAt: new Date().toISOString() },
  });

  const session = await db.collection('sessions').insertOne({
    userId: String(user.insertedId),
    tenantId: 't_demo',
    applicationId: 'a_demo',
    status: 'active',
    familyId: 'drill-family-1',
    currentRefreshTokenHash: 'deadbeef'.repeat(8),
    device: { ip: '10.0.0.1', userAgent: 'drill-agent', deviceLabel: 'Drill' },
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const audit = await db.collection('auditlogs').insertOne({
    sequence: 1,
    hash: '0'.repeat(64),
    tenantId: 't_demo',
    actor: { type: 'user', id: String(user.insertedId) },
    action: 'drill.seed',
    resource: { type: 'system', id: 'drill' },
    createdAt: new Date(),
  });

  await mongoose.disconnect();
  return {
    userId: String(user.insertedId),
    sessionId: String(session.insertedId),
    auditId: String(audit.insertedId),
    userEmail: 'drill@pezhwan.dev',
  };
}

export async function runBackup({
  source = process.env.PEZHWAN_MONGODB_URI,
  dbName,
  out,
  strategy = 'logical',
  seed = false,
  keepDumpDir = false,
} = {}) {
  requireBackupKey();

  let ownedMongod = null;
  let resolvedSource = source;
  if (seed || !resolvedSource) {
    ownedMongod = await MongoMemoryServer.create();
    resolvedSource = ownedMongod.getUri();
  }
  const database = dbName ?? (new URL(resolvedSource).pathname.replace(/^\//, '') || 'pezhwan');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = out ?? join('backups', `pezhwan-${timestamp}.pzbu`);
  const dumpDir = join(dirname(outPath), `.dump-${timestamp}`);
  await mkdir(dumpDir, { recursive: true });

  try {
    if (seed && ownedMongod) {
      console.log('[backup] seeding demo identity data…');
      await seedIdentityData(resolvedSource, database);
    }

    // Choose dump strategy.
    const tools = await detectDumpTools();
    const useBinary = strategy === 'binary' && tools.binary;
    if (strategy === 'binary' && !tools.binary) {
      console.warn('[backup] mongodump/mongorestore not found — falling back to logical dump');
    }

    const startedAt = Date.now();
    let dumpInfo;
    if (useBinary) {
      await binaryDump(resolvedSource, dumpDir, { dbName: database });
      dumpInfo = { strategy: 'binary' };
    } else {
      const manifest = await logicalDump(resolvedSource, dumpDir, { dbName: database });
      dumpInfo = { strategy: 'logical', manifest };
    }
    const dumpMs = Date.now() - startedAt;

    // Compute RPO: age of the newest document backed up vs. backup time.
    await mongoose.connect(resolvedSource, { maxPoolSize: 5 });
    const rpoMs = await computeRpo(mongoose.connection.useDb(database));
    await mongoose.disconnect();

    const info = await packageBackup(dumpDir, outPath, { strategy: dumpInfo.strategy });
    const backupAgeMs = Date.now() - new Date(info.createdAt).getTime();

    // Maintain a stable "latest" archive so the combined drill
    // (backup && restore) can discover the most recent backup deterministically.
    const latestPath = join(dirname(outPath), 'latest.pzbu');
    const { copyFile } = await import('node:fs/promises');
    await copyFile(outPath, latestPath);

    const report = {
      phase: 'backup',
      ok: true,
      archive: info.archivePath,
      archiveByteSize: info.bytes,
      archiveChecksum: info.checksum,
      encrypted: info.encrypted,
      fileCount: info.fileCount,
      strategy: dumpInfo.strategy,
      collectionsBackedUp:
        dumpInfo.strategy === 'logical' ? Object.keys(dumpInfo.manifest.collections).length : null,
      documentsBackedUp:
        dumpInfo.strategy === 'logical'
          ? Object.values(dumpInfo.manifest.collections).reduce((n, c) => n + c.documents, 0)
          : null,
      dumpDurationMs: dumpMs,
      rpoMs,
      rpoSeconds: Math.round(rpoMs / 1000),
      backupAgeMs: Math.round(backupAgeMs),
      backupAgeSeconds: Math.max(0, Math.round(backupAgeMs / 1000)),
      createdAt: info.createdAt,
    };
    console.log('[backup] ' + JSON.stringify(report, null, 2));
    return report;
  } finally {
    if (!keepDumpDir) {
      await rm(dumpDir, { recursive: true, force: true });
    }
    if (ownedMongod) {
      await ownedMongod.stop().catch(() => {});
    }
  }
}

/** RPO = freshness of the newest mutable identity document at dump time. */
async function computeRpo(db) {
  let newest = 0;
  for (const name of ['users', 'sessions', 'auditlogs']) {
    try {
      const doc = await db
        .collection(name)
        .findOne({}, { sort: { updatedAt: -1, createdAt: -1, lastActiveAt: -1 } });
      const ts = doc?.updatedAt || doc?.createdAt || doc?.lastActiveAt;
      if (ts) {
        const t = new Date(ts).getTime();
        if (t > newest) newest = t;
      }
    } catch {
      /* collection may not exist */
    }
  }
  return Math.max(0, Date.now() - newest);
}

export async function main() {
  const { flags, opts } = parseArgs(process.argv);
  await runBackup({
    source: opts.source,
    dbName: opts.db,
    out: opts.out,
    strategy: flags.strategy,
    seed: flags.seed,
    keepDumpDir: flags.keepDumpDir,
  });
}

if (process.argv[1] && basename(process.argv[1]) === 'backup-drill.mjs') {
  main().catch((err) => {
    console.error('[backup] FAILED:', err);
    process.exit(1);
  });
}

export default runBackup;
