#!/usr/bin/env node
/**
 * PEZHWAN — Install git hooks for secret scanning.
 *
 * Copies scripts/pre-commit.sh into .git/hooks/pre-commit so every local
 * commit is scanned for obvious secrets before it can be staged.
 *
 * Run: node scripts/install-hooks.mjs
 */
import { copyFileSync, chmodSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'scripts', 'pre-commit.sh');
const hook = path.join(root, '.git', 'hooks', 'pre-commit');

if (!existsSync(src)) {
  console.error(`[install-hooks] missing ${src}`);
  process.exit(1);
}
if (!existsSync(path.join(root, '.git'))) {
  console.error('[install-hooks] not a git repository (.git not found).');
  process.exit(1);
}

try {
  copyFileSync(src, hook);
  chmodSync(hook, 0o755);
  console.log(`[install-hooks] installed pre-commit hook -> ${hook}`);
} catch (err) {
  console.error(`[install-hooks] failed: ${err.message}`);
  process.exit(1);
}
