/**
 * PEZHWAN — add audit sequence (003).
 *
 * Creates the `auditsequences` collection that backs the append-only audit
 * chain. The audit writer (packages/core/src/services/audit.service.ts) reserves
 * the next, globally-unique, strictly-monotonic sequence number with an ATOMIC
 * `$inc` on a single counter document (`{ _id: 'audit', seq: n }`) before every
 * entry — this is the single-writer arbitration that stops the chain forking
 * under concurrency.
 *
 * This migration establishes the collection and seeds the first counter
 * document at `seq: 0`, so the very first `$inc` yields sequence 1.
 *
 * Safety model:
 *   - Dry-run by default: nothing is written unless `--apply` is passed.
 *   - Idempotent: `$setOnInsert` guarantees the counter is only ever seeded
 *     once; re-runs never reset or clobber a live counter.
 *   - Additive only — no existing data is touched.
 *
 * Usage:
 *   node dist/migrations/003-add-audit-sequence.js --apply
 *   node dist/migrations/003-add-audit-sequence.js            # dry-run preview
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

/** Counter document key used by AuditService.getNextSequence (audit.service.ts). */
const COUNTER_ID = 'audit';
const INITIAL_SEQ = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectionExists(name: string): Promise<boolean> {
  return mongoose.connection.db.listCollections({ name }).hasNext();
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
    const exists = await collectionExists('auditsequences');
    if (!exists) {
      console.log(`[${DRY_RUN ? 'dry-run' : 'apply'}] creating collection "auditsequences"`);
      if (APPLY) {
        try {
          await mongoose.connection.createCollection('auditsequences');
          console.log('  created auditsequences');
        } catch (err) {
          const code = (err as { code?: number })?.code;
          const codeName = (err as { codeName?: string })?.codeName;
          if (code !== 48 && codeName !== 'NamespaceExists') throw err;
          console.log('  auditsequences already exists (race) — continuing');
        }
      }
    } else {
      console.log('  auditsequences already exists');
    }

    // Seed the first counter document. $setOnInsert means a second run — or a
    // run on a database that already has a live counter — never resets `seq`.
    // The counter doc owns a STRING `_id` (model: _id: { type: String }).
    const col = mongoose.connection.collection<{ _id: string; seq: number }>('auditsequences');
    const existingCounter = await col.findOne({ _id: COUNTER_ID });
    if (existingCounter) {
      console.log(
        `  counter doc { _id: "${COUNTER_ID}", seq: ${existingCounter.seq ?? '?'} } already present`,
      );
    } else if (DRY_RUN) {
      console.log(`  would seed counter doc { _id: "${COUNTER_ID}", seq: ${INITIAL_SEQ} }`);
    } else {
      const res = await col.updateOne(
        { _id: COUNTER_ID },
        { $setOnInsert: { seq: INITIAL_SEQ } },
        { upsert: true },
      );
      console.log(
        res.upsertedCount === 1
          ? `  seeded counter doc { _id: "${COUNTER_ID}", seq: ${INITIAL_SEQ} }`
          : `  counter doc { _id: "${COUNTER_ID}" } already present`,
      );
    }

    console.log('\n=== 003-add-audit-sequence complete ===');
    console.log(`Mode:    ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);

    if (VALIDATE && APPLY) {
      const colAfter = mongoose.connection.collection<{ _id: string; seq: number }>(
        'auditsequences',
      );
      const counter = await colAfter.findOne({ _id: COUNTER_ID });
      if (counter) {
        console.log(`Validation OK: counter doc reads _id="${counter._id}", seq=${counter.seq}.`);
      } else {
        console.log('Validation FAILED: counter doc not found.');
        throw new Error('003-add-audit-sequence validation failed');
      }
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
