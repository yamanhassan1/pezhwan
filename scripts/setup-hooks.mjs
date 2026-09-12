#!/usr/bin/env node
/**
 * PEZHWAN — git hooks installer (alias for scripts/install-hooks.mjs, fuller
 * output).
 *
 * Installs the managed hooks under .husky/ (pre-commit, pre-push, commit-msg)
 * into this repository's live hook path. Two strategies, in order:
 *   1. When a local `husky` binary is available, run `husky install` (the
 *      canonical setup — hooks run straight from .husky/).
 *   2. Otherwise copy each .husky/<hook> into .git/hooks/<hook> as a thin sh
 *      wrapper that execs the managed file, so `.husky/*` remains the single
 *      source of truth. This is the cross-platform (Windows-friendly) path.
 *
 * Usage:
 *   node scripts/setup-hooks.mjs
 *     --force   replace existing (possibly unmanaged) hooks without prompting
 *     --help    show this help
 *
 * Idempotent: installed hooks that already wrap the managed .husky file are
 * left untouched unless --force is given.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HUSKY_DIR = path.join(ROOT, '.husky');
const HOOKS_DIR = path.join(ROOT, '.git', 'hooks');
const MARKER = 'PEZHWAN:MANAGED-HOOK';
const HOOKS = ['pre-commit', 'pre-push', 'commit-msg'];

function usage() {
  console.log(`Usage: node scripts/setup-hooks.mjs [options]
  --force   replace existing hooks (idempotent by default)
  --help    show this help`);
}

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`[setup-hooks] unknown argument: ${a}`);
      usage();
      process.exit(1);
    }
  }
  return args;
}

function hasLocalHusky() {
  for (const bin of ['.bin/husky', '.bin/husky.cmd']) {
    if (existsSync(path.join(ROOT, 'node_modules', bin))) return true;
  }
  return false;
}

function wrapperFor(name) {
  return [
    '#!/bin/sh',
    `# ${MARKER} (managed by scripts/setup-hooks.mjs)`,
    `# Runs the canonical hook from .husky/ — edit there, not here.`,
    `exec "$(dirname "$0")/../../.husky/${name}" "$@"`,
    '',
  ].join('\n');
}

function isManagedByUs(hookPath) {
  if (!existsSync(hookPath)) return false;
  return readFileSync(hookPath, 'utf-8').includes(MARKER);
}

function sameAsWrapper(hookPath, name) {
  if (!existsSync(hookPath)) return false;
  return readFileSync(hookPath, 'utf-8') === wrapperFor(name);
}

function installViaHusky(args) {
  console.log('[setup-hooks] local husky found — running `husky install`.');
  const p = spawnSync('npx', ['husky', 'install'], {
    cwd: ROOT,
    encoding: 'utf-8',
    shell: true,
    stdio: 'inherit',
  });
  if (p.status === 0) {
    console.log('[setup-hooks] husky install complete.');
    return;
  }
  console.warn('[setup-hooks] husky install failed — falling back to .git/hooks wrappers.');
  installWrappers(args);
}

function installWrappers(args) {
  console.log(`[setup-hooks] installing managed hooks into ${HOOKS_DIR}`);
  for (const name of HOOKS) {
    const managed = path.join(HUSKY_DIR, name);
    const hookPath = path.join(HOOKS_DIR, name);
    if (!existsSync(managed)) {
      console.warn(`[setup-hooks] skip ${name} — no managed file at ${managed}`);
      continue;
    }
    if (!args.force && sameAsWrapper(hookPath, name)) {
      console.log(`[setup-hooks] ok ${name} — already installed and up to date`);
      continue;
    }
    if (!args.force && existsSync(hookPath) && !isManagedByUs(hookPath)) {
      console.warn(
        `[setup-hooks] skip ${name} — existing unmanaged hook at ${hookPath} (use --force to replace)`,
      );
      continue;
    }
    try {
      writeFileSync(hookPath, wrapperFor(name), { mode: 0o755 });
      try {
        chmodSync(hookPath, 0o755);
      } catch {
        /* Windows: no chmod needed */
      }
      console.log(`[setup-hooks] installed ${name} -> ${hookPath} (wraps ${managed})`);
    } catch (err) {
      console.error(
        `[setup-hooks] FAILED installing ${name}: ${err instanceof Error ? err.message : err}`,
      );
      process.exitCode = 1;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(path.join(ROOT, '.git'))) {
    console.error('[setup-hooks] not a git repository (.git not found).');
    process.exit(1);
  }
  if (!existsSync(HUSKY_DIR)) {
    console.error(`[setup-hooks] .husky/ directory not found at ${HUSKY_DIR}.`);
    process.exit(1);
  }

  if (hasLocalHusky() && !args.force) {
    installViaHusky(args);
  } else {
    if (args.force && hasLocalHusky()) {
      console.log(
        '[setup-hooks] --force given; using .git/hooks wrappers even though husky is present.',
      );
    }
    installWrappers(args);
  }

  console.log(
    '[setup-hooks] done. Hooks are active on the next commit/push (SKIP_HOOKS=1 bypasses pre-push/commit-msg).',
  );
}

main().catch((err) => {
  console.error('[setup-hooks] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
