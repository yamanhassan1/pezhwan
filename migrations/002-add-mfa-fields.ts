/**
 * PEZHWAN — add MFA fields (002).
 *
 * Adds the durable TOTP/backup-code MFA state to existing user documents and
 * establishes the `backupcodes` collection with its indexes. The field set
 * matches the MFA service contract (packages/core/src/services/mfa.service.ts):
 * a user carries `mfaSecret` (AES-256-GCM envelope, never plaintext),
 * `mfaEnabled`, `mfaSecretVerifiedAt`, `mfaFailedAttempts` and `mfaLockUntil`.
 * Backup codes are stored only as SHA-256 hashes and are single-use.
 *
 * Safety model:
 *   - Dry-run by default: nothing is written unless `--apply` is passed.
 *   - Idempotent: only documents missing the new fields are touched, and only
 *     the missing fields are set — repeated runs are no-ops.
 *   - Additive: existing users/backup codes are never deleted or rewritten.
 *   - Batched cursor processing with `--batch-size` like migration 004.
 *
 * Usage:
 *   node dist/migrations/002-add-mfa-fields.js --apply --batch-size 5000
 *   node dist/migrations/002-add-mfa-fields.js            # dry-run preview
 */

import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MONGODB_URI = process.env.PEZHWAN_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pezhwan';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY || args.includes('--dry-run');
const VALIDATE = args.includes('--validate');
const ROLLBACK = args.includes('--rollback');

function flagValue(name: string): number | null {
  const prefix = `${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  return match ? Number(match.slice(prefix.length)) : null;
}
const BATCH_SIZE = flagValue('--batch-size') ?? 1000;

interface IndexSpec {
  key: Record<string, 1 | -1 | 'hashed' | 'text'>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Record<string, unknown>;
}

// MFA fields added to users — defaults match the model + mfa.service contract.
const MFA_DEFAULTS: Record<string, unknown> = {
  mfaEnabled: false,
  mfaSecret: null,
  mfaSecretVerifiedAt: null,
  mfaFailedAttempts: 0,
  mfaLockUntil: null,
};
const MFA_FIELD_NAMES = Object.keys(MFA_DEFAULTS);

const BACKUP_CODE_INDEXES: IndexSpec[] = [
  { key: { userId: 1, tenantId: 1 } },
  { key: { codeHash: 1 }, unique: true },
  { key: { userId: 1, codeHash: 1 }, unique: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const skipped: string[] = [];

async function collectionExists(name: string): Promise<boolean> {
  return mongoose.connection.db.listCollections({ name }).hasNext();
}

/** Create a collection unless it exists. Safe against a namespace-exists race. */
async function ensureCollection(name: string): Promise<void> {
  const exists = await collectionExists(name);
  if (exists) {
    skipped.push(`collection "${name}" already exists`);
    return;
  }
  if (DRY_RUN) return;
  try {
    await mongoose.connection.createCollection(name);
  } catch (err) {
    const code = (err as { code?: number })?.code;
    const codeName = (err as { codeName?: string })?.codeName;
    if (code === 48 || codeName === 'NamespaceExists') {
      skipped.push(`collection "${name}" already exists`);
      return;
    }
    throw err;
  }
}

function indexMatches(spec: IndexSpec, ix: Record<string, unknown>): boolean {
  if (JSON.stringify(ix.key) !== JSON.stringify(spec.key)) return false;
  if ((spec.unique ?? false) !== Boolean(ix.unique)) return false;
  if ((spec.sparse ?? false) !== Boolean(ix.sparse)) return false;
  if (
    spec.expireAfterSeconds !== undefined &&
    Number(ix.expireAfterSeconds) !== spec.expireAfterSeconds
  ) {
    return false;
  }
  if (
    spec.partialFilterExpression !== undefined &&
    JSON.stringify(ix.partialFilterExpression ?? null) !==
      JSON.stringify(spec.partialFilterExpression)
  ) {
    return false;
  }
  return true;
}

async function ensureIndexes(name: string, specs: IndexSpec[]): Promise<string[]> {
  const col = mongoose.connection.collection(name);
  let existing: Record<string, unknown>[] = [];
  try {
    existing = (await col.indexes()) as unknown as Record<string, unknown>[];
  } catch {
    /* collection absent — treated as empty */
  }
  const missing = specs.filter((spec) => !existing.some((ix) => indexMatches(spec, ix)));
  const created: string[] = [];
  if (missing.length === 0) return created;
  if (DRY_RUN) return missing.map((spec) => `${name}:${JSON.stringify(spec.key)}`);
  await col.createIndexes(missing);
  return missing.map((spec) => `${name}:${JSON.stringify(spec.key)}`);
}

/**
 * Backfill the new MFA fields on every user missing at least one of them.
 * Batched cursor + per-document `$set` of only what is absent (idempotent).
 */
async function backfillMfaFields(): Promise<number> {
  const col = mongoose.connection.collection('users');
  const missingFields = {
    $or: MFA_FIELD_NAMES.map((f) => ({ [f]: { $exists: false } })),
  };
  const cursor = col.find(missingFields);
  let updated = 0;
  let scanned = 0;

  while (true) {
    const batch = await cursor.limit(BATCH_SIZE).toArray();
    if (batch.length === 0) break;
    for (const doc of batch) {
      scanned += 1;
      const set: Record<string, unknown> = {};
      for (const field of MFA_FIELD_NAMES) {
        if (doc[field] === undefined) set[field] = MFA_DEFAULTS[field];
      }
      if (Object.keys(set).length === 0) continue;
      if (APPLY) {
        const res = await col.updateOne({ _id: doc._id }, { $set: set });
        if (res.modifiedCount === 1) updated += 1;
      } else {
        updated += 1; // counted in dry-run
      }
    }
    console.log(
      `[${DRY_RUN ? 'dry-run' : 'apply'}] users scanned=${scanned} would/updated=${updated}`,
    );
    if (batch.length < BATCH_SIZE) break;
  }
  await cursor.close();
  return updated;
}

// ---------------------------------------------------------------------------
// Migration logic
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (ROLLBACK) {
    console.log('Additive migration — nothing to roll back. No writes performed.');
    return;
  }

  await mongoose.connect(MONGODB_URI);

  try {
    // The users collection is created in 001; ensure it exists so this script
    // is safe to run standalone against an empty database.
    const usersNote = await collectionExists('users');
    if (!usersNote && DRY_RUN) {
      console.log('[dry-run] users collection does not exist yet (expected after 001).');
    }

    // 1. Add MFA fields to users.
    const updated = await backfillMfaFields();

    // 2. Backup-code collection + indexes.
    await ensureCollection('backupcodes');
    const backupIndexes = await ensureIndexes('backupcodes', BACKUP_CODE_INDEXES);

    console.log('\n=== 002-add-mfa-fields complete ===');
    console.log(`Mode:              ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);
    console.log(`Users to/updated:  ${updated}`);
    if (backupIndexes.length) {
      console.log(`Backup-code indexes to/create:`);
      backupIndexes.forEach((i) => console.log(`  + ${i}`));
    }
    if (skipped.length) {
      console.log(`Already present:   ${skipped.length} (skipped)`);
    }
    if (DRY_RUN) {
      console.log('\nRun with `--apply` to write changes.');
      return;
    }

    if (VALIDATE) {
      const col = mongoose.connection.collection('users');
      const sample = await col.findOne(missingAny(MFA_FIELD_NAMES));
      const stillMissing = sample != null;
      console.log(
        stillMissing
          ? 'Validation FAILED: some users still lack MFA fields.'
          : 'Validation OK: all MFA fields present on users.',
      );
      if (stillMissing) throw new Error('002-add-mfa-fields validation failed');
    }
  } finally {
    await mongoose.disconnect();
  }
}

function missingAny(fields: string[]): Record<string, unknown> {
  return { $or: fields.map((f) => ({ [f]: { $exists: false } })) };
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
