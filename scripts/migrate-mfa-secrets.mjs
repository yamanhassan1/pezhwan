/**
 * PEZHWAN — MFA legacy-secret migration utility.
 *
 * Upgrades MFA TOTP secrets to the current versioned envelope (`v3:` — a true
 * DEK envelope: a random data key encrypts the secret with AES-256-GCM and is
 * itself wrapped by the master key). It handles the migration window by
 * detecting every format:
 *   - already `v3:` prefixed  → already migrated, skipped;
 *   - legacy `v2:` prefixed or legacy unprefixed single-layer AES-GCM envelope
 *     → decrypted + re-wrapped as `v3:`;
 *   - legacy RAW base64 TOTP secret (unaudited pre-envelope format) → wrapped;
 *   - anything that is neither → reported as unmigratable (never destroyed).
 *
 * Safe by default: ALL records are NOT modified unless `--apply` is passed;
 * `--dry-run` is the default and only counts/reports. A backup of the original
 * secret is written to `mfaSecretsBackup` before any change, enabling rollback
 * with `--rollback`.
 *
 * Usage:
 *   node scripts/migrate-mfa-secrets.mjs
 *   node scripts/migrate-mfa-secrets.mjs --apply --batch-size 5000 --validate
 *   node scripts/migrate-mfa-secrets.mjs --rollback
 *
 * Env:
 *   PEZHWAN_MONGODB_URI            Mongo connection string
 *   PEZHWAN_MFA_ENCRYPTION_KEY     base64 32-byte AES-256 key
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

const ENVELOPE_VERSION = 'v3:';
const PREVIOUS_ENVELOPE_VERSION = 'v2:';
const ENVELOPE_AAD = Buffer.from('pezhwan:mfa-secret:v1');

function requireKey() {
  const raw = process.env.PEZHWAN_MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('PEZHWAN_MFA_ENCRYPTION_KEY is required (base64 32-byte AES key)');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`MFA encryption key must be 32 bytes, got ${key.length}`);
  }
  return key;
}

/**
 * Current envelope: `v3:<iv||tag||ciphertext||dataKeyIv||dataKeyTag||encDataKey>`
 * (all base64). The DEK (data key) encrypts the secret; the master key wraps
 * the DEK — the stored value stays confidential outside the key trust boundary.
 */
export function wrapCurrent(secret, key) {
  const dataKey = randomBytes(32);

  const ctIv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey, ctIv);
  cipher.setAAD(ENVELOPE_AAD);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);

  const dekIv = randomBytes(12);
  const dekCipher = createCipheriv('aes-256-gcm', key, dekIv);
  const encryptedDataKey = Buffer.concat([dekCipher.update(dataKey), dekCipher.final()]);

  return (
    ENVELOPE_VERSION +
    Buffer.concat([
      ctIv,
      cipher.getAuthTag(),
      ciphertext,
      dekIv,
      dekCipher.getAuthTag(),
      encryptedDataKey,
    ]).toString('base64')
  );
}

/** Decrypt any envelope (v3 / v2 / legacy unprefixed). Throws on invalid. */
export function unwrapCurrent(value, key) {
  if (value.startsWith(ENVELOPE_VERSION)) {
    // v3 DEK envelope: ctIv(12) ctTag(16) ciphertext dataKeyIv(12) dataKeyTag(16) encDataKey(32).
    const payload = Buffer.from(value.slice(ENVELOPE_VERSION.length), 'base64');
    if (payload.length < 12 + 16 + 12 + 16 + 32) {
      throw new Error('MFA secret payload too short');
    }
    const ctIv = payload.subarray(0, 12);
    const ctTag = payload.subarray(12, 28);
    const dataKeyIv = payload.subarray(payload.length - 60, payload.length - 48);
    const dataKeyTag = payload.subarray(payload.length - 48, payload.length - 32);
    const encDataKey = payload.subarray(payload.length - 32);
    const ciphertext = payload.subarray(28, payload.length - 60);

    const dekDecipher = createDecipheriv('aes-256-gcm', key, dataKeyIv);
    dekDecipher.setAuthTag(dataKeyTag);
    const dataKey = Buffer.concat([dekDecipher.update(encDataKey), dekDecipher.final()]);

    const decipher = createDecipheriv('aes-256-gcm', dataKey, ctIv);
    decipher.setAuthTag(ctTag);
    decipher.setAAD(ENVELOPE_AAD);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  // Legacy single-layer envelope (v2-prefixed or legacy unprefixed).
  const raw = value.startsWith(PREVIOUS_ENVELOPE_VERSION)
    ? value.slice(PREVIOUS_ENVELOPE_VERSION.length)
    : value;
  const payload = Buffer.from(raw, 'base64');
  if (payload.length < 28) {
    throw new Error('MFA secret payload too short');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
}

function parseArgs(argv) {
  const flags = {
    apply: false,
    dryRun: true,
    validate: false,
    rollback: false,
    batchSize: 1000,
    backupCollection: 'mfaSecretsBackup',
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--apply') {
      flags.apply = true;
      flags.dryRun = false;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--validate') {
      flags.validate = true;
    } else if (arg === '--rollback') {
      flags.rollback = true;
    } else if (arg.startsWith('--batch-size=')) {
      flags.batchSize = Number(arg.split('=')[1]);
    }
  }
  return flags;
}

/** Classify a stored mfaSecret into { kind, secret? } without modifying it. */
function classify(value, key) {
  if (!value) {
    return { kind: 'empty', secret: null };
  }
  if (value.startsWith(ENVELOPE_VERSION)) {
    try {
      return { kind: 'current', secret: unwrapCurrent(value, key) };
    } catch {
      return { kind: 'corrupt', secret: null };
    }
  }
  // Legacy v2-prefixed / unprefixed single-layer AES-GCM envelope.
  try {
    return { kind: 'legacy-envelope', secret: unwrapCurrent(value, key) };
  } catch {
    /* not an envelope — try raw base64 TOTP secret */
  }
  try {
    const plain = Buffer.from(value, 'base64');
    if (plain.length >= 20) {
      return { kind: 'legacy-plaintext', secret: plain };
    }
  } catch {
    /* not base64 */
  }
  return { kind: 'unmigratable', secret: null };
}

async function main() {
  const flags = parseArgs(process.argv);
  const key = requireKey();
  const uri = process.env.PEZHWAN_MONGODB_URI;
  if (!uri) {
    throw new Error('PEZHWAN_MONGODB_URI is required');
  }

  await mongoose.connect(uri, { maxPoolSize: 5 });
  const users = mongoose.connection.collection('users');
  const backupCol = mongoose.connection.collection(flags.backupCollection);

  if (flags.rollback) {
    const docs = await backupCol.find({}).toArray();
    let restored = 0;
    for (const doc of docs) {
      await users.updateOne({ _id: doc.userId }, { $set: { mfaSecret: doc.originalSecret } });
      await backupCol.deleteOne({ _id: doc._id });
      restored += 1;
    }
    console.log(`[rollback] restored ${restored} record(s) from backup`);
    await mongoose.disconnect();
    return;
  }

  const counts = {
    current: 0,
    'legacy-envelope': 0,
    'legacy-plaintext': 0,
    corrupt: 0,
    unmigratable: 0,
    empty: 0,
  };

  const cursor = users.find({ mfaSecret: { $ne: null } }).batchSize(flags.batchSize);
  for await (const user of cursor) {
    const { kind, secret } = classify(user.mfaSecret, key);
    counts[kind] = (counts[kind] ?? 0) + 1;

    if (kind === 'current' || kind === 'empty') {
      continue;
    }
    if (kind === 'corrupt' || kind === 'unmigratable') {
      console.warn(`[skip] user ${user._id}: secret is ${kind} — not modified`);
      continue;
    }

    // kind is legacy-envelope or legacy-plaintext → requires re-wrapping.
    const upgraded = wrapCurrent(secret, key);

    if (flags.dryRun) {
      console.log(`[dry-run] user ${user._id}: ${kind} → v3 (no change written)`);
      continue;
    }

    await backupCol.insertOne({
      userId: user._id,
      originalSecret: user.mfaSecret,
      migratedAt: new Date(),
    });

    const result = await users.updateOne(
      { _id: user._id, mfaSecret: user.mfaSecret }, // optimistic concurrency
      { $set: { mfaSecret: upgraded } },
    );

    if (flags.validate && result.modifiedCount === 1) {
      // Post-migration integrity check: the upgraded envelope must decrypt to
      // the same plaintext secret so existing authenticator codes stay valid.
      try {
        const roundTrip = unwrapCurrent(upgraded, key);
        if (!roundTrip.equals(secret)) {
          console.error(`[validate] FAIL user ${user._id}: round-trip mismatch`);
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(`[validate] FAIL user ${user._id}: ${err.message}`);
        process.exitCode = 1;
      }
    }
  }

  console.log('[summary]', JSON.stringify(counts));
  if (flags.dryRun) {
    console.log('[dry-run] no records were modified; re-run with --apply to upgrade');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[fatal]', err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
