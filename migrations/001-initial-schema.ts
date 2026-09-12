/**
 * PEZHWAN — initial schema (001).
 *
 * Bootstraps the core Pezhwan collections and their indexes. Each collection is
 * created only if it does not already exist, and every index is registered with
 * the exact key pattern + options the Mongoose models declare — so a fresh
 * database reaches the same schema state the application code expects.
 *
 * Collections established here:
 *   users, sessions, otp, auditlogs, apikeys, permissions, roles,
 *   userroleassignments, oauthclients, authorizationcodes, verificationtokens,
 *   decoyusers, trusteddevices, tenantquotas
 *
 * Safety model:
 *   - Dry-run by default: nothing is written unless `--apply` is passed.
 *   - Idempotent: existing collections/indexes are detected and left untouched;
 *     createCollection is further guarded against a namespace-exists race
 *     (error 48 / NamespaceExists).
 *   - Additive only — never destroys data. Index creation is routinely a no-op.
 *   - `--validate` re-reads the live index catalogue afterwards and fails the
 *     run if any declared index is missing.
 *
 * Usage:
 *   node dist/migrations/001-initial-schema.js --apply
 *   node dist/migrations/001-initial-schema.js            # dry-run preview
 *   node dist/migrations/001-initial-schema.js --apply --validate
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

const collectionsPlanned: string[] = [];
const collectionsCreated: string[] = [];
const indexesPlanned: string[] = [];
const indexesCreated: string[] = [];
const skipped: string[] = [];

async function collectionExists(name: string): Promise<boolean> {
  return mongoose.connection.db.listCollections({ name }).hasNext();
}

/** Create a collection unless it exists. Safe against a concurrent creation race. */
async function ensureCollection(name: string): Promise<void> {
  const exists = await collectionExists(name);
  if (exists) {
    skipped.push(`collection "${name}" already exists`);
    return;
  }
  if (DRY_RUN) {
    collectionsPlanned.push(name);
    return;
  }
  try {
    await mongoose.connection.createCollection(name);
    collectionsCreated.push(name);
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

/** Compare a declared spec against a live index entry (key + options). */
function indexMatches(spec: IndexSpec, ix: Record<string, unknown>): boolean {
  if (JSON.stringify(ix.key) !== JSON.stringify(spec.key)) return false;
  const ixUnique = Boolean(ix.unique);
  const ixSparse = Boolean(ix.sparse);
  if ((spec.unique ?? false) !== ixUnique) return false;
  if ((spec.sparse ?? false) !== ixSparse) return false;
  if (spec.expireAfterSeconds !== undefined && Number(ix.expireAfterSeconds) !== spec.expireAfterSeconds) {
    return false;
  }
  const ixPartial = ix.partialFilterExpression ?? null;
  if (spec.partialFilterExpression !== undefined &&
      JSON.stringify(ixPartial) !== JSON.stringify(spec.partialFilterExpression)) {
    return false;
  }
  return true;
}

/** Register every declared index on a collection, skipping ones already present. */
async function ensureIndexes(name: string, specs: IndexSpec[]): Promise<void> {
  const col = mongoose.connection.collection(name);
  let existing: Record<string, unknown>[] = [];
  try {
    const found = await col.indexes();
    existing = found as unknown as Record<string, unknown>[];
  } catch {
    // Collection does not exist yet (namespace-not-found) — treat as empty;
    // in apply mode `ensureCollection` has already created it.
  }

  const missing: IndexSpec[] = [];
  for (const spec of specs) {
    if (existing.some((ix) => indexMatches(spec, ix))) {
      skipped.push(`index "${name}:${JSON.stringify(spec.key)}" already exists`);
    } else {
      missing.push(spec);
    }
  }

  if (missing.length === 0) return;
  if (DRY_RUN) {
    for (const spec of missing) indexesPlanned.push(`${name}:${JSON.stringify(spec.key)}`);
    return;
  }

  await col.createIndexes(missing);
  for (const spec of missing) indexesCreated.push(`${name}:${JSON.stringify(spec.key)}`);
}

/** Re-read the live index catalogue and confirm every spec is present. */
async function verifyIndexes(name: string, specs: IndexSpec[]): Promise<string[]> {
  const col = mongoose.connection.collection(name);
  const catalog = (await col.indexes()) as unknown as Record<string, unknown>[];
  const missing: string[] = [];
  for (const spec of specs) {
    if (!catalog.some((ix) => indexMatches(spec, ix))) {
      missing.push(`${name}:${JSON.stringify(spec.key)}`);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Schema declaration
// ---------------------------------------------------------------------------

interface CollectionSpec {
  name: string;
  indexes: IndexSpec[];
}

const SCHEMA: CollectionSpec[] = [
  {
    // --- Users -----------------------------------------------------------------
    // Unique identity handles scoped to a tenant via partial indexes (not
    // `sparse`) so rows without a handle are excluded from uniqueness.
    name: 'users',
    indexes: [
      { key: { tenantId: 1 } },
      {
        key: { tenantId: 1, email: 1 },
        unique: true,
        partialFilterExpression: { email: { $type: 'string' } },
      },
      {
        key: { tenantId: 1, phone: 1 },
        unique: true,
        partialFilterExpression: { phone: { $type: 'string' } },
      },
      { key: { tenantId: 1, 'identities.provider': 1, 'identities.subject': 1 } },
      { key: { tenantId: 1, isActive: 1 } },
      { key: { emailVerified: 1 } },
      { key: { isActive: 1 } },
      { key: { loginLockUntil: 1 } },
      { key: { tokenVersion: 1 } },
      { key: { mfaEnabled: 1 } },
      { key: { passwordHash: 1 } },
    ],
  },
  {
    // --- Sessions --------------------------------------------------------------
    // Refresh tokens are never stored raw — only the SHA-256 hash, uniquely.
    name: 'sessions',
    indexes: [
      { key: { userId: 1 } },
      { key: { status: 1 } },
      { key: { familyId: 1 } },
      { key: { userId: 1, tenantId: 1, applicationId: 1, status: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { key: { currentRefreshTokenHash: 1 }, unique: true },
    ],
  },
  {
    // --- OTP -------------------------------------------------------------------
    // Exactly one live code per (purpose, channel, target) within a tenant+app.
    name: 'otp',
    indexes: [
      {
        key: { tenantId: 1, applicationId: 1, purpose: 1, channel: 1, target: 1 },
        unique: true,
      },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  },
  {
    // --- Audit logs ------------------------------------------------------------
    // Append-only, tamper-evident chain: global monotonic `sequence` + `prevHash`.
    name: 'auditlogs',
    indexes: [
      { key: { timestamp: 1 } },
      { key: { eventType: 1 } },
      { key: { tenantId: 1 } },
      { key: { applicationId: 1 } },
      { key: { userId: 1 } },
      { key: { sequence: 1 }, unique: true, sparse: true },
      { key: { tenantId: 1, userId: 1, timestamp: -1 } },
      { key: { tenantId: 1, timestamp: -1 } },
      { key: { prevHash: 1 } },
    ],
  },
  {
    // --- API keys --------------------------------------------------------------
    name: 'apikeys',
    indexes: [
      { key: { tenantId: 1 } },
      { key: { keyHash: 1 }, unique: true },
    ],
  },
  {
    // --- RBAC ------------------------------------------------------------------
    name: 'permissions',
    indexes: [{ key: { tenantId: 1, applicationId: 1, name: 1 }, unique: true }],
  },
  {
    name: 'roles',
    indexes: [{ key: { tenantId: 1, applicationId: 1, name: 1 }, unique: true }],
  },
  {
    name: 'userroleassignments',
    indexes: [
      { key: { userId: 1, tenantId: 1, applicationId: 1, roleId: 1 }, unique: true },
      { key: { roleId: 1 } },
    ],
  },
  {
    // --- OAuth ----------------------------------------------------------------
    name: 'oauthclients',
    indexes: [
      { key: { clientId: 1 }, unique: true },
      { key: { tenantId: 1, applicationId: 1 } },
    ],
  },
  {
    name: 'authorizationcodes',
    indexes: [
      { key: { codeHash: 1 }, unique: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { key: { userId: 1, tenantId: 1 } },
    ],
  },
  {
    name: 'verificationtokens',
    indexes: [
      { key: { tokenHash: 1 }, unique: true },
      { key: { userId: 1, tenantId: 1, applicationId: 1, kind: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  },
  {
    // --- Decoy honeypot users -------------------------------------------------
    name: 'decoyusers',
    indexes: [
      { key: { tenantId: 1 } },
      { key: { tenantId: 1, handle: 1 }, unique: true },
    ],
  },
  {
    // --- Trusted devices ------------------------------------------------------
    name: 'trusteddevices',
    indexes: [
      { key: { userId: 1 } },
      { key: { deviceId: 1 } },
      { key: { userId: 1, deviceId: 1 }, unique: true },
    ],
  },
  {
    // --- Tenant quotas --------------------------------------------------------
    name: 'tenantquotas',
    indexes: [{ key: { tenantId: 1 }, unique: true }],
  },
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
    for (const spec of SCHEMA) {
      await ensureCollection(spec.name);
      await ensureIndexes(spec.name, spec.indexes);
    }

    const validationFailures: string[] = [];
    if (VALIDATE && APPLY) {
      for (const spec of SCHEMA) {
        const missing = await verifyIndexes(spec.name, spec.indexes);
        validationFailures.push(...missing);
      }
    }

    console.log('\n=== 001-initial-schema complete ===');
    console.log(`Mode:              ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);
    if (collectionsPlanned.length) {
      console.log(`Collections to create: ${collectionsPlanned.length}`);
      collectionsPlanned.forEach((c) => console.log(`  + ${c}`));
    }
    if (collectionsCreated.length) {
      console.log(`Collections created:   ${collectionsCreated.length}`);
      collectionsCreated.forEach((c) => console.log(`  + ${c}`));
    }
    if (indexesPlanned.length) {
      console.log(`Indexes to create:     ${indexesPlanned.length}`);
      indexesPlanned.slice(0, 20).forEach((i) => console.log(`  + ${i}`));
      if (indexesPlanned.length > 20) console.log(`  ... and ${indexesPlanned.length - 20} more`);
    }
    if (indexesCreated.length) {
      console.log(`Indexes created:       ${indexesCreated.length}`);
      indexesCreated.slice(0, 20).forEach((i) => console.log(`  + ${i}`));
      if (indexesCreated.length > 20) console.log(`  ... and ${indexesCreated.length - 20} more`);
    }
    if (skipped.length) {
      console.log(`Already present:       ${skipped.length} (skipped)`);
    }

    if (validationFailures.length) {
      console.log('\nValidation FAILED — missing indexes:');
      validationFailures.forEach((i) => console.log(`  x ${i}`));
      throw new Error('001-initial-schema validation failed');
    } else if (VALIDATE && APPLY) {
      console.log('\nValidation OK: all declared indexes present.');
    }

    if (DRY_RUN) {
      console.log('\nRun with `--apply` to write changes. Use `--validate` to verify afterwards.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});