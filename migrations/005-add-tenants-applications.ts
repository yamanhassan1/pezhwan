/**
 * PEZHWAN — add tenants & applications (005).
 *
 * Establishes the first-class multi-tenancy collections and backfills
 * tenant/application identifiers on pre-existing documents that predate them
 * (the "dev-app"/"dev-tenant" era when identity managers were injected from a
 * couple of env vars instead of stored per document).
 *
 * Collections established here:
 *   tenants       — slug-unique; one row per deployment/tenant.
 *   applications  — clientId-unique; scoped uniquely per tenant.
 *
 * Backfill: documents missing `tenantId` / `applicationId` are updated from the
 * `PEZHWAN_TENANT_ID` / `PEZHWAN_APPLICATION_ID` env vars (only those fields a
 * document is actually missing, and only when the matching env var is set).
 *
 * Safety model:
 *   - Dry-run by default: nothing is written unless `--apply` is passed.
 *   - Idempotent: existing collections/indexes are detected and left untouched;
 *     backfill only ever touches documents that still miss an identifier.
 *   - Additive only — existing identifiers are never overwritten or cleared.
 *   - Batched cursor processing with `--batch-size` like migration 004.
 *   - `--validate` re-reads the live index catalogue and confirms backfills
 *     cleared every missing-identifier document it could address.
 *
 * Usage:
 *   node dist/migrations/005-add-tenants-applications.js --apply --batch-size 5000
 *   node dist/migrations/005-add-tenants-applications.js            # dry-run preview
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

const DEFAULT_TENANT_ID = process.env.PEZHWAN_TENANT_ID;
const DEFAULT_APPLICATION_ID = process.env.PEZHWAN_APPLICATION_ID;

interface IndexSpec {
  key: Record<string, 1 | -1 | 'hashed' | 'text'>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const skipped: string[] = [];

async function collectionExists(name: string): Promise<boolean> {
  return mongoose.connection.db.listCollections({ name }).hasNext();
}

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
  if (missing.length === 0) return [];
  if (DRY_RUN) return missing.map((spec) => `${name}:${JSON.stringify(spec.key)}`);
  await col.createIndexes(missing);
  return missing.map((spec) => `${name}:${JSON.stringify(spec.key)}`);
}

/** Backfill a single missing field on a single collection, batched. */
async function backfillField(
  collection: string,
  field: string,
  value: string | undefined,
): Promise<number> {
  if (value === undefined) {
    console.log(`  ${collection}.${field}: skipped (env value not set)`);
    return 0;
  }
  if (!(await collectionExists(collection))) {
    console.log(`  ${collection}.${field}: skipped (collection does not exist)`);
    return 0;
  }

  const col = mongoose.connection.collection(collection);
  const cursor = col.find({ [field]: { $exists: false } });
  let updated = 0;

  while (true) {
    const batch = await cursor.limit(BATCH_SIZE).toArray();
    if (batch.length === 0) break;
    for (const doc of batch) {
      if (doc[field] !== undefined) continue;
      if (APPLY) {
        const res = await col.updateOne({ _id: doc._id }, { $set: { [field]: value } });
        if (res.modifiedCount === 1) updated += 1;
      } else {
        updated += 1;
      }
    }
    if (batch.length < BATCH_SIZE) break;
  }
  await cursor.close();
  return updated;
}

// ---------------------------------------------------------------------------
// Schema + backfill declaration
// ---------------------------------------------------------------------------

const TENANT_INDEXES: IndexSpec[] = [{ key: { slug: 1 }, unique: true }];

const APPLICATION_INDEXES: IndexSpec[] = [
  { key: { tenantId: 1 } },
  { key: { clientId: 1 }, unique: true },
  { key: { tenantId: 1, clientId: 1 }, unique: true },
];

/** Collections whose pre-tenant-era documents may lack tenant/application ids. */
const BACKFILLS: { collection: string; field: string; value: string | undefined }[] = [
  { collection: 'users', field: 'tenantId', value: DEFAULT_TENANT_ID },
  { collection: 'sessions', field: 'tenantId', value: DEFAULT_TENANT_ID },
  { collection: 'sessions', field: 'applicationId', value: DEFAULT_APPLICATION_ID },
  { collection: 'otp', field: 'applicationId', value: DEFAULT_APPLICATION_ID },
  { collection: 'authorizationcodes', field: 'applicationId', value: DEFAULT_APPLICATION_ID },
  { collection: 'verificationtokens', field: 'applicationId', value: DEFAULT_APPLICATION_ID },
  { collection: 'apikeys', field: 'applicationId', value: DEFAULT_APPLICATION_ID },
  { collection: 'oauthclients', field: 'applicationId', value: DEFAULT_APPLICATION_ID },
  { collection: 'decoyusers', field: 'tenantId', value: DEFAULT_TENANT_ID },
];

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
    // 1. Collections + indexes.
    await ensureCollection('tenants');
    await ensureCollection('applications');
    const tenantIndexes = await ensureIndexes('tenants', TENANT_INDEXES);
    const appIndexes = await ensureIndexes('applications', APPLICATION_INDEXES);

    // 2. Batched identifier backfill for pre-tenant documents.
    console.log('\nBackfill (batched):');
    let backfilled = 0;
    for (const b of BACKFILLS) {
      const n = await backfillField(b.collection, b.field, b.value);
      backfilled += n;
      console.log(`  ${b.collection}.${b.field}: ${n}`);
    }

    console.log('\n=== 005-add-tenants-applications complete ===');
    console.log(`Mode:              ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);
    console.log(
      `Tenant indexes:    ${tenantIndexes.length ? tenantIndexes.join(', ') : 'all present'}`,
    );
    console.log(
      `Application indexes: ${appIndexes.length ? appIndexes.join(', ') : 'all present'}`,
    );
    console.log(`Documents to/backfilled: ${backfilled}`);
    if (skipped.length) console.log(`Already present:   ${skipped.length} (skipped)`);

    if (VALIDATE && APPLY) {
      const cols = ['tenants', 'applications'];
      const missing: string[] = [];
      for (const name of cols) {
        const catalog = (await mongoose.connection.collection(name).indexes()) as unknown as Record<
          string,
          unknown
        >[];
        const specs = name === 'tenants' ? TENANT_INDEXES : APPLICATION_INDEXES;
        for (const spec of specs) {
          if (!catalog.some((ix) => indexMatches(spec, ix))) {
            missing.push(`${name}:${JSON.stringify(spec.key)}`);
          }
        }
      }
      // Backfill proof: no doc that lacked an env-addressable identifier remains.
      for (const b of BACKFILLS) {
        if (b.value === undefined) continue;
        if (!(await collectionExists(b.collection))) continue;
        const leftover = await mongoose.connection
          .collection(b.collection)
          .countDocuments({ [b.field]: { $exists: false } });
        if (leftover > 0)
          missing.push(`${b.collection}.${b.field} still missing → ${leftover} docs`);
      }
      if (missing.length) {
        console.log('\nValidation FAILED:');
        missing.forEach((m) => console.log(`  x ${m}`));
        throw new Error('005-add-tenants-applications validation failed');
      }
      console.log('\nValidation OK: indexes present, identifier backfill complete.');
    }

    if (DRY_RUN) {
      console.log(
        '\nRun with `--apply` to write changes. Set PEZHWAN_TENANT_ID / PEZHWAN_APPLICATION_ID to enable backfill.',
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
