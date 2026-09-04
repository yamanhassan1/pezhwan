/**
 * PEZHWAN — 004 MFA secrets encryption ROLLBACK.
 *
 * Restores MFA secrets from the `mfaSecretsBackup` collection created during
 * an `--apply` run of `004-mfa-secrets-encryption.ts`. Idempotent: only backs
 * up rows that exist are restored, and each restored row's backup is removed.
 *
 * This is intentionally a standalone script (not invoked by the auto-runner)
 * because rollback is a deliberate, operator-driven action.
 *
 * Usage:
 *   node dist/migrations/rollback/004-mfa-secrets-rollback.js
 */

import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.PEZHWAN_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pezhwan';
const BATCH_SIZE = Number(process.env.PEZHWAN_MIGRATION_BATCH ?? 1000);

async function run(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  const users = mongoose.connection.collection('users');
  const backup = mongoose.connection.collection('mfaSecretsBackup');

  const cursor = backup.find({});
  let restored = 0;
  let skipped = 0;

  while (true) {
    const batch = await cursor.limit(BATCH_SIZE).toArray();
    if (batch.length === 0) break;

    for (const row of batch) {
      const res = await users.updateOne(
        { _id: row.userId },
        { $set: { mfaSecret: row.secret } },
      );
      if (res.modifiedCount === 1 || res.matchedCount === 1) {
        await backup.deleteOne({ _id: row._id });
        restored += 1;
      } else {
        skipped += 1;
      }
    }

    if (batch.length < BATCH_SIZE) break;
  }

  await cursor.close();
  await mongoose.disconnect();

  console.log(`Rollback complete: restored=${restored} skipped=${skipped}.`);
  console.log('mfaSecretsBackup has been cleared for restored records.');
}

run().catch((err) => {
  console.error('Rollback failed:', err);
  process.exit(1);
});
