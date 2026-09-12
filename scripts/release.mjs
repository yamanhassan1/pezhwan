#!/usr/bin/env node
/**
 * PEZHWAN — release workflow driver.
 *
 * Rolls a release: runs the quality gates first (typecheck → lint → test:root,
 * stopping on the first failure), bumps the CHANGELOG (Unreleased → versioned
 * section, fresh empty Unreleased on top), updates version(s) in package.json
 * (root only unless --workspaces), commits, tags, and pushes with --follow-tags.
 *
 * Usage:
 *   node scripts/release.mjs --version 0.2.0
 *   node scripts/release.mjs --tag v0.2.0
 *     --workspaces    also bump every workspace version (npm pkg set --workspaces)
 *     --dry-run       plan + quality gates only; no file edits, commit, tag, or push
 *     --skip-gates    skip the quality gates (dangerous — for re-running a release)
 *     --help          show this help
 *
 * Cross-platform: uses child_process.spawnSync with shell: true so `npm.cmd`
 * resolves on Windows and `npm` on POSIX.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

const SEMVER = /^\d+\.\d+\.\d+$/;

function usage() {
  console.log(`Usage: node scripts/release.mjs --version <x.y.z> [options]
  --version <x.y.z>   release version (required unless --tag is given)
  --tag <vX.Y.Z>      version read from an existing git tag name
  --workspaces        also bump every workspace version via npm pkg set
  --dry-run           print the plan + run gates, but change nothing
  --skip-gates        skip typecheck/lint/test:root (re-release only)
  --help              show this help`);
}

function parseArgs(argv) {
  const args = { version: null, tag: null, workspaces: false, dryRun: false, skipGates: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--version') args.version = argv[++i];
    else if (a === '--tag') args.tag = argv[++i];
    else if (a === '--workspaces') args.workspaces = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--skip-gates') args.skipGates = true;
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`[release] unknown argument: ${a}`);
      usage();
      process.exit(1);
    }
  }
  const version = args.version ?? (args.tag ? args.tag.replace(/^v/, '') : null);
  if (!version) {
    console.error('[release] a version is required: --version <x.y.z> or --tag <vX.Y.Z>');
    usage();
    process.exit(1);
  }
  if (!SEMVER.test(version)) {
    console.error(`[release] invalid version '${version}' — expected semver x.y.z`);
    process.exit(1);
  }
  return { ...args, version };
}

function run(cmd, args, opts = {}) {
  // npm is a .cmd shim on Windows and needs shell:true; plain executables
  // (git) pass args directly so Node does the escaping and keeps stderr clean.
  const useShell = cmd === 'npm';
  const p = spawnSync(cmd, args, { encoding: 'utf-8', shell: useShell, stdio: 'inherit', ...opts });
  return p.status;
}

function runGates() {
  const gates = [
    ['typecheck', ['run', 'typecheck']],
    ['lint', ['run', 'lint']],
    ['test:root', ['run', 'test:root']],
  ];
  for (const [name, args] of gates) {
    console.log(`\n[release] quality gate: npm ${args.join(' ')}`);
    const code = run('npm', args);
    if (code !== 0) {
      console.error(`[release] FAILED at gate '${name}' — aborting release.`);
      process.exit(1);
    }
  }
  console.log('\n[release] quality gates passed.');
}

function bumpChangelog(version) {
  const date = new Date().toISOString().slice(0, 10);
  const text = readFileSync(CHANGELOG, 'utf-8');
  const marker = '## [Unreleased]';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Could not find '${marker}' section in CHANGELOG.md`);
  }
  const lines = text.split('\n');
  const lineIdx = lines.findIndex((l) => l.trim() === marker);
  lines[lineIdx] = `## [${version}] - ${date}`;
  lines.splice(
    lineIdx,
    0,
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '### Changed',
    '',
    '### Fixed',
    '',
  );
  const next = lines.join('\n');
  if (!args.dryRun) writeFileSync(CHANGELOG, next, 'utf-8');
  return next;
}

let args;

async function main() {
  args = parseArgs(process.argv);
  const tag = `v${args.version}`;

  console.log(
    `[release] preparing ${tag}${args.dryRun ? ' (DRY-RUN — no changes will be made)' : ''}`,
  );

  // 1. Quality gates first — the release is never built on an unverified base.
  if (!args.skipGates) {
    runGates();
  } else if (!args.dryRun) {
    console.warn('[release] WARNING: --skip-gates used — releasing without quality gates.');
  }

  // 2. Pre-flight: tag must not already exist.
  if (tagExists(tag)) {
    console.error(`[release] tag '${tag}' already exists — refusing to overwrite.`);
    process.exit(1);
  }

  // 3. Changelog bump.
  const changelog = bumpChangelog(args.version);
  const newVersionLine =
    changelog.split('\n').find((l) => l.startsWith(`## [${args.version}]`)) ?? '';
  console.log(`[release] changelog:\n  ${newVersionLine}`);

  // 4. Version bump in package.json (npm pkg set also syncs package-lock.json).
  if (!args.dryRun) {
    console.log(`[release] npm pkg set version=${args.version}`);
    const code = run('npm', ['pkg', 'set', `version=${args.version}`], { stdio: 'inherit' });
    if (code !== 0) {
      console.error('[release] failed to update root package version.');
      process.exit(1);
    }
    if (args.workspaces) {
      console.log(`[release] npm pkg set version=${args.version} --workspaces`);
      const wcode = run('npm', ['pkg', 'set', `version=${args.version}`, '--workspaces'], {
        stdio: 'inherit',
      });
      if (wcode !== 0) {
        console.error('[release] failed to update workspace versions.');
        process.exit(1);
      }
    }
    const rootPkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
    const prev = rootPkg.version;
    if (prev !== args.version) {
      console.warn(
        `[release] expected root version ${args.version}, saw ${prev} — check package.json.`,
      );
    }
  } else {
    console.log(
      `[release] would run: npm pkg set version=${args.version}${args.workspaces ? ' --workspaces' : ''}`,
    );
  }

  // 5. Commit, tag, push.
  if (args.dryRun) {
    console.log(`[release] would commit "${'chore(release): ' + tag}"`);
    console.log(`[release] would tag ${tag}`);
    console.log('[release] would push --follow-tags');
    console.log('\n[release] DRY-RUN complete — no changes were made.');
    return;
  }

  const stage = run('git', ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md']);
  if (stage !== 0) {
    console.error('[release] git add failed.');
    process.exit(1);
  }
  const commit = run('git', ['commit', '-m', `chore(release): ${tag}`]);
  if (commit !== 0) {
    console.error('[release] git commit failed — no tag was created.');
    process.exit(1);
  }
  const tagResult = run('git', ['tag', tag]);
  if (tagResult !== 0) {
    console.error(`[release] git tag ${tag} failed — the commit exists but no tag was created.`);
    process.exit(1);
  }
  const push = run('git', ['push', '--follow-tags']);
  if (push !== 0) {
    console.error(
      `[release] git push --follow-tags failed — commit '${tag}' and tag exist locally; push manually.`,
    );
    process.exit(1);
  }

  console.log(`\n[release] ${tag} released and pushed.`);
}

function tagExists(tag) {
  const p = spawnSync('git', ['tag', '-l', tag], {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return p.stdout?.trim() === tag;
}

main().catch((err) => {
  console.error('[release] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
