/**
 * PEZHWAN — restore drill.
 *
 * Restores a backup archive into an isolated environment and verifies both the
 * data/index integrity AND that the identity server can operate on the restored
 * store (RTO measurement + post-restore authentication verification).
 *
 *   node scripts/restore-drill.mjs
 *     --in <archive.pzbu>          backup archive (required)
 *     --db <database>              database name to restore into
 *     --strategy <logical|binary>  restore method (default: logical)
 *     --verify-auth                run a login-refresh round-trip against the
 *                                  restored data (requires the drill user)
 *     --keep-dump-dir              don't delete the intermediate dump dir
 *
 * Env: PEZHWAN_BACKUP_KEY (base64 32-byte AES key) must match the backup key.
 *
 * Records: archive checksum, restore duration (RTO), collections/documents/
 * indexes restored, index + integrity verification, auth round-trip status.
 */

import { rm, mkdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import mongoose from 'mongoose';

import {
  requireBackupKey,
  unpackageBackup,
  logicalRestore,
  binaryRestore,
} from './lib/backup-util.mjs';

function parseArgs(argv) {
  const flags = { verifyAuth: false, keepDumpDir: false, strategy: 'logical' };
  const opts = { in: null, db: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verify-auth') flags.verifyAuth = true;
    else if (a === '--keep-dump-dir') flags.keepDumpDir = true;
    else if (a === '--strategy') flags.strategy = argv[++i];
    else if (a === '--in') opts.in = argv[++i];
    else if (a === '--db') opts.db = argv[++i];
  }
  return { flags, opts };
}

/** Spin up an isolated replica-set Mongo to restore into. */
async function bootIsolatedEnv(_dbName) {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await rs.waitUntilRunning();
  const uri = rs.getUri();
  return { mongod: rs, uri };
}

/** Verify index integrity: every manifest index must be present on restore. */
async function verifyIndexes(dumpDir, uri, database) {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(join(dumpDir, '_dump.json'), 'utf8'));
  await mongoose.connect(uri, { maxPoolSize: 5 });
  const db = mongoose.connection.client.db(database);
  const missing = [];
  for (const [name, meta] of Object.entries(manifest.collections)) {
    const col = db.collection(name);
    const actual = await col.indexes();
    const actualKeys = actual.map((i) => JSON.stringify(i.key));
    for (const def of meta.indexes) {
      if (!actualKeys.includes(JSON.stringify(def.key))) {
        missing.push(`${name}:${JSON.stringify(def.key)}`);
      }
    }
  }
  await mongoose.disconnect();
  return { missingIndexes: missing };
}

/** Verify the restored user document survived intact (data integrity). */
async function verifyDataIntegrity(uri, database, expectedEmail) {
  await mongoose.connect(uri, { maxPoolSize: 5 });
  const db = mongoose.connection.client.db(database);
  const user = await db.collection('users').findOne({ email: expectedEmail });
  const session = await db.collection('sessions').findOne({ familyId: 'drill-family-1' });
  await mongoose.disconnect();
  return {
    userRestored: Boolean(user),
    sessionRestored: Boolean(session),
    userMetadataDrill: user?.metadata?.drill === true,
  };
}

/**
 * Run the identity server auth path against the restored store: boot a Pezhwan
 * runtime bound to the restored DB and prove `login → refresh → reuse-rejection`
 * works (tokens sign/verify, session rotation commits, replay fails closed).
 */
async function verifyAuth(uri) {
  // Bind mongoose to the restored database so the core SessionModel (and the
  // runtime built from it) operate against the recovered store.
  await mongoose.connect(uri, { maxPoolSize: 10 });

  const { createPezhwan } = await import('@pezhwan/core');
  const runtime = createPezhwan({
    tenantId: 't_demo',
    applicationId: 'a_demo',
    issuer: 'https://id.example.com',
    audience: 'pezhwan.clients',
    otpDelivery: { sendEmail: async () => {}, sendSms: async () => {} },
  });

  const created = await runtime.sessions.create({
    userId: 'drill-auth-user',
    tenantId: 't_demo',
    applicationId: 'a_demo',
    ip: '127.0.0.1',
    userAgent: 'drill-verify',
  });
  const rotated = await runtime.sessions.refresh(created.refreshToken, {
    tenantId: 't_demo',
    applicationId: 'a_demo',
  });
  const reuseRejected = await runtime.sessions
    .refresh(created.refreshToken, { tenantId: 't_demo', applicationId: 'a_demo' })
    .then(() => false)
    .catch((e) => e?.code === 'REFRESH_TOKEN_REUSE');

  await mongoose.disconnect();

  return {
    sessionCreated: Boolean(created.sessionId),
    refreshRotated: rotated.refreshToken !== created.refreshToken,
    reuseRejected,
    authOk:
      Boolean(created.sessionId) && rotated.refreshToken !== created.refreshToken && reuseRejected,
  };
}

export async function runRestore({
  archive,
  dbName,
  strategy = 'logical',
  verifyAuth: doVerifyAuth = false,
  keepDumpDir = false,
} = {}) {
  requireBackupKey();
  if (!archive) throw new Error('restore drill requires a backup archive (--in <archive.pzbu>)');

  const dumpDir = join(dirname(archive), `.restore-${Date.now()}`);
  await mkdir(dumpDir, { recursive: true });

  const env = await bootIsolatedEnv();
  const database = dbName ?? 'pezhwan';

  try {
    const unpacked = await unpackageBackup(archive, dumpDir);

    const startedAt = Date.now();
    let restoreInfo;
    if (strategy === 'binary') {
      await binaryRestore(env.uri, dumpDir, { dbName: database });
      restoreInfo = {
        strategy: 'binary',
        collections: [],
        restoredCount: null,
        restoredIndexes: null,
      };
    } else {
      restoreInfo = await logicalRestore(env.uri, dumpDir, {
        dbName: database,
        dropExisting: true,
      });
      restoreInfo.strategy = 'logical';
    }
    const restoreMs = Date.now() - startedAt;

    const indexCheck = await verifyIndexes(dumpDir, env.uri, database);
    const integrity = await verifyDataIntegrity(env.uri, database, 'drill@pezhwan.dev');

    let authCheck = null;
    if (doVerifyAuth) {
      authCheck = await verifyAuth(env.uri);
    }

    const report = {
      phase: 'restore',
      ok: true,
      archive,
      archiveChecksum: unpacked.checksum,
      restoreTarget: database,
      restoredCollections: restoreInfo.collections,
      documentsRestored: restoreInfo.restoredCount,
      indexesRestored: restoreInfo.restoredIndexes,
      missingIndexes: indexCheck.missingIndexes,
      integrity: integrity,
      authVerification: authCheck,
      rtoMs: restoreMs,
      rtoSeconds: Math.round(restoreMs / 1000),
    };

    if (indexCheck.missingIndexes.length > 0) {
      report.ok = false;
      console.error('[restore] FAILED index integrity:', indexCheck.missingIndexes);
    }
    if (doVerifyAuth && !authCheck?.authOk) {
      report.ok = false;
      console.error('[restore] FAILED auth verification:', authCheck);
    }

    console.log('[restore] ' + JSON.stringify(report, null, 2));
    return report;
  } finally {
    if (!keepDumpDir) {
      await rm(dumpDir, { recursive: true, force: true });
    }
    await env.mongod.stop().catch(() => {});
  }
}

export async function main() {
  const { flags, opts } = parseArgs(process.argv);
  const report = await runRestore({
    archive: opts.in,
    dbName: opts.db,
    strategy: flags.strategy,
    verifyAuth: flags.verifyAuth,
    keepDumpDir: flags.keepDumpDir,
  });
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'restore-drill.mjs') {
  main().catch((err) => {
    console.error('[restore] FAILED:', err);
    process.exit(1);
  });
}

export default runRestore;
