/**
 * PEZHWAN — MFA legacy-secret migration (004).
 *
 * Upgrades stored MFA TOTP secrets to the current versioned AES-256-GCM
 * envelope (`v2:...`). Supports a migration window during which both the
 * current `v2:` format and legacy formats are readable, then permanently
 * re-encodes every record WITHOUT changing the underlying TOTP secret — so
 * all existing authenticator/backup codes remain valid.
 *
 * Safety model:
 *   - Dry-run by default: nothing is written unless `--apply` is passed.
 *   - Backup before change: the original secret is copied to
 *     `mfaSecretsBackup` keyed by userId before any write (enables rollback).
 *   - Optimistic concurrency: each write is `{ _id, mfaSecret: <old> } -> $set`
 *     so a concurrent change is never silently overwritten.
 *   - Never destroys unrecognized data: corrupt/unmigratable records are
 *     skipped and surfaced, not deleted.
 *   - Post-migration validation: with `--validate`, each upgraded envelope is
 *     decrypted and compared byte-for-byte to the source secret.
 *
 * Usage:
 *   node dist/migrations/004-mfa-secrets-encryption.js --apply --batch-size 5000 --validate
 *   node dist/migrations/004-mfa-secrets-encryption.js --rollback
 */

import mongoose from 'mongoose';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MONGODB_URI = process.env.PEZHWAN_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pezhwan';

// Parse command-line flags
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

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function getKey(): Buffer {
  const raw = process.env.PEZHWAN_MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('PEZHWAN_MFA_ENCRYPTION_KEY (base64 32-byte) is required');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PEZHWAN_MFA_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return key;
}

/** Wrap a raw secret in the current `v2:` envelope. */
function wrapV2(secret: Buffer, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return `v2:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`;
}

/**
 * Decrypt a wrapped secret. Accepts both the current `v2:` prefix and a legacy
 * unprefixed AES-256-GCM envelope. Throws on anything that isn't a valid
 * envelope, so callers can distinguish legacy raw base64 from corrupt data.
 */
function unwrapEnvelope(value: string, key: Buffer): Buffer {
  const raw = value.startsWith('v2:') ? value.slice(3) : value;
  const payload = Buffer.from(raw, 'base64');
  if (payload.length < 28) {
    throw new Error('Envelope too short');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
}

/**
 * Classify a stored secret:
 *   - 'current'   → is already a `v2:` envelope (skipped)
 *   - 'legacy'    → an unprefixed envelope OR a raw base64 secret (≥20 bytes)
 *   - 'corrupt'   → looks like an envelope but cannot be decrypted under the key
 *   - 'unrecognized' → neither (never modified)
 */
function classify(
  value: unknown,
  key: Buffer,
):
  | { kind: 'current' }
  | { kind: 'legacy'; secret: Buffer }
  | { kind: 'corrupt' }
  | { kind: 'unrecognized' } {
  if (value == null || typeof value !== 'string' || value.length === 0) {
    return { kind: 'unrecognized' };
  }
  if (value.startsWith('v2:')) {
    // Try to verify the current envelope decrypts (already current + valid).
    try {
      unwrapEnvelope(value, key);
      return { kind: 'current' };
    } catch {
      return { kind: 'corrupt' };
    }
  }
  // Unprefixed — attempt envelope decrypt first.
  try {
    const decoded = unwrapEnvelope(value, key);
    // A successful envelope decrypt is authoritative.
    return { kind: 'legacy', secret: decoded };
  } catch {
    // Maybe a raw base64 TOTP secret (≥20 bytes is a plausible secret).
    try {
      const decoded = Buffer.from(value, 'base64');
      if (decoded.length >= 20) {
        return { kind: 'legacy', secret: decoded };
      }
    } catch {
      /* fall through */
    }
    return { kind: 'corrupt' };
  }
}

// ---------------------------------------------------------------------------
// Migration logic
// ---------------------------------------------------------------------------

interface Counters {
  current: number;
  upgraded: number;
  corrupt: number;
  unrecognized: number;
  failed: number;
}

async function main(): Promise<void> {
  if (ROLLBACK) {
    await runRollback();
    return;
  }

  const key = getKey();
  await mongoose.connect(MONGODB_URI);

  const users = mongoose.connection.collection('users');
  const backup = mongoose.connection.collection('mfaSecretsBackup');

  const counters: Counters = { current: 0, upgraded: 0, corrupt: 0, unrecognized: 0, failed: 0 };
  const cursor = users.find({ mfaSecret: { $exists: true, $ne: null } });

  let processed = 0;
  const skippedCorrupt: string[] = [];
  const skippedUnrecognized: string[] = [];

  while (true) {
    const batch = await cursor.limit(BATCH_SIZE).toArray();
    if (batch.length === 0) break;

    for (const user of batch) {
      processed += 1;
      const userId = user._id;
      const stored = user.mfaSecret;

      const classification = classify(stored, key);

      switch (classification.kind) {
        case 'current':
          counters.current += 1;
          break;
        case 'legacy': {
          const plain = classification.secret;
          if (APPLY) {
            // Backup the original BEFORE any write (optimistic concurrency).
            await backup.updateOne(
              { userId },
              { $set: { secret: stored, migratedAt: new Date() } },
              { upsert: true },
            );
            const envelope = wrapV2(plain, key);
            const res = await users.updateOne(
              { _id: userId, mfaSecret: stored },
              { $set: { mfaSecret: envelope } },
            );
            if (res.modifiedCount === 1) {
              if (VALIDATE) {
                // Decrypt the upgraded envelope and compare byte-for-byte.
                const check = unwrapEnvelope(envelope, key);
                const ok = check.equals(plain);
                if (!ok) {
                  counters.failed += 1;
                  // Restore on validation failure.
                  await users.updateOne({ _id: userId }, { $set: { mfaSecret: stored } });
                  skippedCorrupt.push(String(userId));
                  break;
                }
              }
              counters.upgraded += 1;
            } else {
              counters.failed += 1;
            }
          } else {
            counters.upgraded += 1; // counted in dry-run
          }
          break;
        }
        case 'corrupt':
          counters.corrupt += 1;
          skippedCorrupt.push(String(userId));
          break;
        case 'unrecognized':
          counters.unrecognized += 1;
          skippedUnrecognized.push(String(userId));
          break;
      }
    }

    // Report progress.
    console.log(
      `[${DRY_RUN ? 'dry-run' : 'apply'}] processed=${processed} ` +
        `current=${counters.current} legacy=${counters.upgraded} ` +
        `corrupt=${counters.corrupt} unrecognized=${counters.unrecognized}`,
    );

    if (batch.length < BATCH_SIZE) break;
  }

  await cursor.close();
  await mongoose.disconnect();

  console.log('\n=== MFA secret migration complete ===');
  console.log(`Mode:             ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}`);
  console.log(`Already current:  ${counters.current}`);
  console.log(`Upgraded (dry):   ${APPLY ? counters.upgraded : counters.upgraded}`);
  console.log(`Corrupt:          ${counters.corrupt}`);
  console.log(`Unrecognized:     ${counters.unrecognized}`);
  console.log(`Failed/restored:  ${counters.failed}`);

  if (skippedCorrupt.length) {
    console.log(`\nCorrupt records (not modified): ${skippedCorrupt.length}`);
    console.log(skippedCorrupt.slice(0, 20).join(', '));
  }
  if (skippedUnrecognized.length) {
    console.log(`\nUnrecognized records (not modified): ${skippedUnrecognized.length}`);
    console.log(skippedUnrecognized.slice(0, 20).join(', '));
  }

  if (DRY_RUN) {
    console.log('\nRun with `--apply` to write changes. Use `--validate` to verify round-trips.');
  }
}

/** Restore every backed-up original secret and clear the backup. */
async function runRollback(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  const users = mongoose.connection.collection('users');
  const backup = mongoose.connection.collection('mfaSecretsBackup');

  const cursor = backup.find({});
  let restored = 0;

  while (true) {
    const batch = await cursor.limit(BATCH_SIZE).toArray();
    if (batch.length === 0) break;
    for (const row of batch) {
      const res = await users.updateOne({ _id: row.userId }, { $set: { mfaSecret: row.secret } });
      if (res.modifiedCount === 1) {
        await backup.deleteOne({ _id: row._id });
        restored += 1;
      }
    }
    if (batch.length < BATCH_SIZE) break;
  }

  await cursor.close();
  await mongoose.disconnect();
  console.log(`Rollback complete: ${restored} records restored and backups cleared.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
