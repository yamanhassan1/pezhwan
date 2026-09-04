/**
 * PEZHWAN — migration runner.
 *
 * A minimal, dependency-free runner that discovers numbered migration files
 * under `migrations/`, applies them in order, and records which have run in a
 * `_migrations` collection so each is applied exactly once.
 *
 * Usage:
 *   node dist/migrations/migration-runner.js up        # apply pending migrations
 *   node dist/migrations/migration-runner.js status    # show applied/pending
 *   node dist/migrations/migration-runner.js down      # (future) rollbacks
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.PEZHWAN_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pezhwan';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;

const command = process.argv[2] ?? 'up';

interface MigrationRecord {
  name: string;
  appliedAt: Date;
}

/** Discover numbered migration files (NNN-*.ts / .mjs / .js) excluding the runner. */
function listMigrations(): string[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}-.+\.(ts|mjs|js)$/.test(f))
    .sort();
  return files;
}

async function run(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  const migrationsCol = mongoose.connection.collection('_migrations');

  const files = listMigrations();
  const applied = await migrationsCol.find({}).project({ name: 1, _id: 0 }).toArray();
  const appliedNames = new Set(applied.map((r) => (r as MigrationRecord).name));

  if (command === 'status') {
    console.log('Applied migrations:');
    for (const f of files) {
      console.log(`  [${appliedNames.has(f) ? 'x' : ' '}] ${f}`);
    }
    await mongoose.disconnect();
    return;
  }

  if (command !== 'up') {
    console.error(`Unknown command: ${command}. Use "up" or "status".`);
    process.exit(1);
  }

  for (const f of files) {
    if (appliedNames.has(f)) continue;

    console.log(`Applying ${f} ...`);
    const mod = await import(path.join(MIGRATIONS_DIR, f).replace(/\\/g, '/'));

    // A migration module may export `up` (async) or run side-effects at import.
    if (typeof mod.up === 'function') {
      await mod.up();
    }

    await migrationsCol.insertOne({ name: f, appliedAt: new Date() });
    appliedNames.add(f);
    console.log(`  applied ${f}`);
  }

  console.log('Migration run complete.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
