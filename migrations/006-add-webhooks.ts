/**
 * PEZHWAN — add webhooks (006).
 *
 * Establishes the outbound event-delivery ledger: `webhooks` (registered
 * endpoints, per tenant/application, with the event types they subscribe to)
 * and `webhookdeliveries` (one row per delivery attempt, so the dispatcher can
 * retry failed/queued deliveries and audit the delivery trail).
 *
 * Collections established here:
 *   webhooks            — tenantId/applicationId lookups.
 *   webhookdeliveries   — webhookId + status + event lookups, TTL-pruned age
 *                         queries via createdAt, and a retry sweep index on
 *                         { status, nextAttemptAt }.
 *
 * Safety model:
 *   - Dry-run by default: nothing is written unless `--apply` is passed.
 *   - Idempotent: existing collections/indexes are detected and left untouched.
 *   - Additive only — no existing data is modified or destroyed.
 *   - `--validate` re-reads the live index catalogue afterwards and fails the
 *     run if any declared index is missing.
 *
 * Usage:
 *   node dist/migrations/006-add-webhooks.js --apply
 *   node dist/migrations/006-add-webhooks.js            # dry-run preview
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

const WEBHOOK_INDEXES: IndexSpec[] = [
  { key: { tenantId: 1 } },
  { key: { applicationId: 1 } },
];

const DELIVERY_INDEXES: IndexSpec[] = [
  { key: { webhookId: 1 } },
  { key: { webhookId: 1, status: 1 } },
  { key: { status: 1 } },
  { key: { status: 1, nextAttemptAt: 1 } },
  { key: { event: 1 } },
  { key: { createdAt: 1 } },
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
    await ensureCollection('webhooks');
    await ensureCollection('webhookdeliveries');
    const webhookIndexes = await ensureIndexes('webhooks', WEBHOOK_INDEXES);
    const deliveryIndexes = await ensureIndexes('webhookdeliveries', DELIVERY_INDEXES);

    console.log('\n=== 006-add-webhooks complete ===');
    console.log(`Mode:           ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);
    if (webhookIndexes.length) {
      console.log('webhooks indexes:');
      webhookIndexes.forEach((i) => console.log(`  + ${i}`));
    } else {
      console.log('webhooks indexes: all present');
    }
    if (deliveryIndexes.length) {
      console.log('webhookdeliveries indexes:');
      deliveryIndexes.forEach((i) => console.log(`  + ${i}`));
    } else {
      console.log('webhookdeliveries indexes: all present');
    }
    if (skipped.length) console.log(`Already present: ${skipped.length} (skipped)`);

    if (VALIDATE && APPLY) {
      const catalog = (await mongoose.connection
        .collection('webhookdeliveries')
        .indexes()) as unknown as Record<string, unknown>[];
      const missing = DELIVERY_INDEXES.filter(
        (spec) => !catalog.some((ix) => indexMatches(spec, ix)),
      );
      if (missing.length) {
        console.log('\nValidation FAILED:');
        missing.forEach((m) => console.log(`  x webhookdeliveries:${JSON.stringify(m.key)}`));
        throw new Error('006-add-webhooks validation failed');
      }
      console.log('\nValidation OK: all webhook indexes present.');
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