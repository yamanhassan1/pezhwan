#!/usr/bin/env node
/**
 * PEZHWAN — audit chain integrity verifier.
 *
 * Asserts the docs/PROMPT.md B.7 acceptance (`scripts/verify-audit-chain.mjs`
 * reports OK): the tamper-evident audit hash chain in MongoDB is intact.
 *
 * Verifies, in ascending `sequence` order:
 *   1. no forks — sequences strictly increase (no duplicates, no backwards);
 *   2. chain links — every entry's `prevHash` equals the previous entry's
 *      `hash` (the first surviving entry may reference a purged ancestor, so
 *      its own chain link is only checked against its successor);
 *   3. hash recomputation — `hash = H(prevHash + canonical(event))` with the
 *      same canonicalisation the runtime uses (audit.service.ts):
 *          JSON.stringify({ t: eventType, i: ip ?? '', u: userId ?? '', m: metadata ?? {} })
 *
 * The root anchor is 64 zero bytes (AUDIT_CHAIN_ROOT). Entries written before
 * strict ordering (no `sequence`/`hash` fields) are reported but NOT treated
 * as part of the chain; if any appears AFTER the first sequenced entry the run
 * fails (interleaving would corrupt ordering). Retention purges the front of
 * the chain, so a missing historical head is expected, not a failure.
 *
 * Usage:
 *   node scripts/verify-audit-chain.mjs
 *     --uri <mongodb://...>   default: PEZHWAN_MONGODB_URI
 *     --limit <N>             verify at most N newest entries (default all)
 *     --help                  show this help
 */
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';

const AUDIT_CHAIN_ROOT = '0'.repeat(64);
const COLLECTION = 'auditlogs';

function usage() {
  console.log(`Usage: node scripts/verify-audit-chain.mjs [options]
  --uri <mongodb://...>   Mongo connection string (default: PEZHWAN_MONGODB_URI)
  --limit <N>             verify at most the N most recent entries (default: all)
  --help                  show this help

Recomputes the audit hash chain stored by RunAuditService/audit.service.ts.
`);
}

function parseArgs(argv) {
  const args = {
    uri: process.env.PEZHWAN_MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan',
    limit: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uri') args.uri = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`[verify-audit-chain] unknown argument: ${a}`);
      usage();
      process.exit(1);
    }
  }
  return args;
}

/** Mirrors AuditService.chainHash(prevHash, input). */
function chainHash(prevHash, input) {
  const canonical = JSON.stringify({
    t: input.eventType ?? '',
    i: input.ip ?? '',
    u: input.userId ?? '',
    m: input.metadata ?? {},
  });
  return createHash('sha256').update(prevHash).update(canonical).digest('hex');
}

async function main() {
  const args = parseArgs(process.argv);
  const db = mongoose.connection.useDb(new URL(args.uri).pathname.replace(/^\//, '') || 'pezhwan');
  await mongoose.connect(args.uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10_000 });
  console.log(`[verify-audit-chain] connected to ${args.uri.replace(/\/\/[^@]+@/, '//***@')}`);

  const col = db.collection(COLLECTION);
  const count = await col.countDocuments();
  console.log(
    `[verify-audit-chain] ${count} audit entr${count === 1 ? 'y' : 'ies'} in '${COLLECTION}'`,
  );

  if (count === 0) {
    console.log('[verify-audit-chain] OK — empty chain (nothing to verify).');
    await mongoose.disconnect();
    return;
  }

  let cursor = col.find().sort({ sequence: 1 }).project({
    sequence: 1,
    prevHash: 1,
    hash: 1,
    eventType: 1,
    ip: 1,
    userId: 1,
    metadata: 1,
    timestamp: 1,
  });
  if (args.limit > 0) {
    cursor = cursor.skip(Math.max(0, count - args.limit));
  }
  const entries = await cursor.toArray();

  // Pre-chain legacy entries (no sequence/hash) are not part of the chain.
  const legacy = entries.filter((e) => !Number.isFinite(e.sequence));
  const chain = entries.filter((e) => Number.isFinite(e.sequence));

  if (legacy.length > 0) {
    const firstSequenced = chain.reduce(
      (min, e) => (min === null || e.sequence < min ? e.sequence : min),
      null,
    );
    const legacyTimestamps = legacy.map((e) => new Date(e.timestamp).getTime());
    const firstSeqTimestamp =
      firstSequenced === null
        ? null
        : (chain.find((e) => e.sequence === firstSequenced)?.timestamp?.getTime?.() ?? null);
    const interleaved = legacyTimestamps.some(
      (t) => firstSeqTimestamp !== null && t > firstSeqTimestamp,
    );
    console.log(
      `[verify-audit-chain] ${legacy.length} pre-chain entr${legacy.length === 1 ? 'y' : 'ies'} ` +
        `(no sequence/hash) — ${interleaved ? 'INTERLEAVED with the chain' : 'precedes the chain'}.`,
    );
    if (interleaved) {
      console.error(
        '[verify-audit-chain] FAILED — legacy entries interleave with sequenced entries.',
      );
      process.exit(1);
    }
  }
  if (chain.length === 0) {
    if (legacy.length === 0) {
      console.log('[verify-audit-chain] OK — empty chain (nothing to verify).');
    } else {
      console.log('[verify-audit-chain] OK — only legacy (pre-chain) entries present.');
    }
    await mongoose.disconnect();
    return;
  }

  const fails = [];
  let checked = 0,
    anchored = 0;
  let prev = null; // chronological predecessor (highest sequence so far)

  for (const entry of chain) {
    const seq = entry.sequence;
    if (prev !== null) {
      if (seq <= prev.sequence) {
        fails.push(`sequence fork at ${seq}: not strictly after ${prev.sequence}`);
      }
      if (entry.prevHash !== prev.hash) {
        fails.push(
          `chain broken at sequence ${seq}: prevHash does not match entry ${prev.sequence} hash`,
        );
      }
    }
    if (entry.prevHash === AUDIT_CHAIN_ROOT) {
      anchored += 1;
    }
    const expectedHash = chainHash(entry.prevHash, entry);
    if (entry.hash !== expectedHash) {
      fails.push(
        `hash mismatch at sequence ${seq}: stored ${String(entry.hash).slice(0, 12)}… ≠ recomputed ${expectedHash.slice(0, 12)}…`,
      );
    }
    checked += 1;
    prev = entry;
  }

  console.log(
    `[verify-audit-chain] verified ${checked} sequenced entr${checked === 1 ? 'y' : 'ies'}: ` +
      `no forks, ${anchored} chain anchor${anchored === 1 ? '' : 's'}, all hashes recomputed.`,
  );

  if (fails.length === 0) {
    console.log('[verify-audit-chain] OK — audit chain is intact.');
  } else {
    console.error(`[verify-audit-chain] FAILED — ${fails.length} issue(s):`);
    for (const f of fails.slice(0, 20)) console.error(`  - ${f}`);
    if (fails.length > 20) console.error(`  … and ${fails.length - 20} more`);
  }

  await mongoose.disconnect();
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[verify-audit-chain] FAILED:', err instanceof Error ? err.message : err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
