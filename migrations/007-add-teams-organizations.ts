/**
 * PEZHWAN — add teams & organizations (007).
 *
 * Establishes the org-graph collections: `organizations` (multi-tenant grouping
 * with a globally-unique, lower-cased slug) and `teams` (role groups whose
 * parent reference is `organizationId`).
 *
 * Note on "parent": the current models (packages/core/src/models/team.model.ts
 * and organization.model.ts) reference a parent via `teams.organizationId` and
 * `organizations.ownerUserId` — there is no `parentId` field, so the parent
 * index here is `teams.organizationId`. Organizations also declare `slug`
 * globally unique (model), rather than per-tenant unique.
 *
 * Safety model:
 *   - Dry-run by default: nothing is written unless `--apply` is passed.
 *   - Idempotent: existing collections/indexes are detected and left untouched.
 *   - Additive only — no existing data is modified or destroyed.
 *   - `--validate` re-reads the live index catalogue afterwards and fails the
 *     run if any declared index is missing.
 *
 * Usage:
 *   node dist/migrations/007-add-teams-organizations.js --apply
 *   node dist/migrations/007-add-teams-organizations.js            # dry-run preview
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

// ---------------------------------------------------------------------------
// Schema declaration
// ---------------------------------------------------------------------------

const ORGANIZATION_INDEXES: IndexSpec[] = [
  { key: { slug: 1 }, unique: true },
  { key: { tenantId: 1 } },
  { key: { ownerUserId: 1 } },
];

const TEAM_INDEXES: IndexSpec[] = [
  { key: { organizationId: 1 } },
  { key: { tenantId: 1 } },
  { key: { tenantId: 1, organizationId: 1 } },
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
    await ensureCollection('organizations');
    await ensureCollection('teams');
    const orgIndexes = await ensureIndexes('organizations', ORGANIZATION_INDEXES);
    const teamIndexes = await ensureIndexes('teams', TEAM_INDEXES);

    console.log('\n=== 007-add-teams-organizations complete ===');
    console.log(`Mode:              ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);
    if (orgIndexes.length) {
      console.log('organizations indexes:');
      orgIndexes.forEach((i) => console.log(`  + ${i}`));
    } else {
      console.log('organizations indexes: all present');
    }
    if (teamIndexes.length) {
      console.log('teams indexes:');
      teamIndexes.forEach((i) => console.log(`  + ${i}`));
    } else {
      console.log('teams indexes: all present');
    }
    if (skipped.length) console.log(`Already present:   ${skipped.length} (skipped)`);

    if (VALIDATE && APPLY) {
      const labs: (readonly [string, IndexSpec[]])[] = [
        ['organizations', ORGANIZATION_INDEXES],
        ['teams', TEAM_INDEXES],
      ];
      const missing: string[] = [];
      for (const [name, specs] of labs) {
        const catalog = (await mongoose.connection.collection(name).indexes()) as unknown as Record<
          string,
          unknown
        >[];
        for (const spec of specs) {
          if (!catalog.some((ix) => indexMatches(spec, ix))) {
            missing.push(`${name}:${JSON.stringify(spec.key)}`);
          }
        }
      }
      if (missing.length) {
        console.log('\nValidation FAILED:');
        missing.forEach((m) => console.log(`  x ${m}`));
        throw new Error('007-add-teams-organizations validation failed');
      }
      console.log('\nValidation OK: all teams/organizations indexes present.');
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
