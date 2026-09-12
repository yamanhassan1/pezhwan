/**
 * PEZHWAN — add subscriptions (008).
 *
 * Establishes the billing/entitlements collection. A subscription is scoped to a
 * tenant (+ optional application), names a plan, and records its lifecycle
 * (`status`) plus the current billing period window. The billing sweeper wakes
 * up `{ status, currentPeriodEnd }` due/expiring subscriptions each cycle.
 *
 * Collections established here:
 *   subscriptions — tenantId/applicationId lookups, status filters, and the
 *                   renewal-sweep query { status, currentPeriodEnd }.
 *
 * Safety model:
 *   - Dry-run by default: nothing is written unless `--apply` is passed.
 *   - Idempotent: existing collections/indexes are detected and left untouched.
 *   - Additive only — no existing data is modified or destroyed.
 *   - `--validate` re-reads the live index catalogue afterwards and fails the
 *     run if any declared index is missing.
 *
 * Usage:
 *   node dist/migrations/008-add-subscriptions.js --apply
 *   node dist/migrations/008-add-subscriptions.js            # dry-run preview
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
  if (spec.expireAfterSeconds !== undefined &&
      Number(ix.expireAfterSeconds) !== spec.expireAfterSeconds) {
    return false;
  }
  if (spec.partialFilterExpression !== undefined &&
      JSON.stringify(ix.partialFilterExpression ?? null) !== JSON.stringify(spec.partialFilterExpression)) {
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

// ---------------------------------------------------------------------------
// Schema declaration
// ---------------------------------------------------------------------------

const SUBSCRIPTION_INDEXES: IndexSpec[] = [
  { key: { tenantId: 1 } },
  { key: { applicationId: 1 } },
  { key: { status: 1 } },
  { key: { status: 1, currentPeriodEnd: 1 } },
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
    await ensureCollection('subscriptions');
    const indexes = await ensureIndexes('subscriptions', SUBSCRIPTION_INDEXES);

    console.log('\n=== 008-add-subscriptions complete ===');
    console.log(`Mode:         ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);
    if (indexes.length) {
      console.log('subscriptions indexes:');
      indexes.forEach((i) => console.log(`  + ${i}`));
    } else {
      console.log('subscriptions indexes: all present');
    }
    if (skipped.length) console.log(`Already present: ${skipped.length} (skipped)`);

    if (VALIDATE && APPLY) {
      const catalog = (await mongoose.connection
        .collection('subscriptions')
        .indexes()) as unknown as Record<string, unknown>[];
      const missing = SUBSCRIPTION_INDEXES.filter(
        (spec) => !catalog.some((ix) => indexMatches(spec, ix)),
      );
      if (missing.length) {
        console.log('\nValidation FAILED:');
        missing.forEach((m) => console.log(`  x subscriptions:${JSON.stringify(m.key)}`));
        throw new Error('008-add-subscriptions validation failed');
      }
      console.log('\nValidation OK: all subscription indexes present.');
    }

    if (DRY_RUN) {
      console.log('\nRun with `--apply` to write changes.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});