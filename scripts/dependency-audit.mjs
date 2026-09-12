#!/usr/bin/env node
/**
 * PEZHWAN — dependency security audit.
 *
 * Runs the npm registry audit and prints a severity summary table plus the
 * list of failing packages. Optionally lists outdated dependencies. Node
 * built-ins + child_process only — no external deps.
 *
 * Usage:
 *   node scripts/dependency-audit.mjs
 *     --outdated         also run `npm outdated --json` and report outdated deps
 *     --fail-on <sev>    exit 1 when a finding at or above this severity exists
 *                        (info | low | moderate | high | critical)
 *     --registry <url>   npm registry to audit against
 *     --help             show this help
 *
 * Exit codes:
 *   0  audit clean (and, with --fail-on, nothing at/above the threshold)
 *   1  vulnerabilities (or findings at/above --fail-on; outdated with --outdated)
 *
 * NOTE: `npm audit` itself exits non-zero when it finds vulnerabilities. We
 * intentionally read its JSON output regardless of exit code.
 */

import { spawnSync } from 'node:child_process';

const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];
const SEV_PAD = 10;

function usage() {
  console.log(`Usage: node scripts/dependency-audit.mjs [options]
  --outdated          also list outdated dependencies (npm outdated --json)
  --fail-on <sev>     fail when findings at/above this severity exist
                      (info|low|moderate|high|critical)
  --registry <url>    npm registry to audit against
  --help              show this help`);
}

function parseArgs(argv) {
  const args = { outdated: false, failOn: null, registry: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--outdated') args.outdated = true;
    else if (a === '--fail-on') args.failOn = argv[++i];
    else if (a === '--registry') args.registry = argv[++i];
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`[dependency-audit] unknown argument: ${a}`);
      usage();
      process.exit(1);
    }
  }
  if (args.failOn && !SEVERITY_ORDER.includes(args.failOn)) {
    console.error(`[dependency-audit] --fail-on must be one of: ${SEVERITY_ORDER.join(', ')}`);
    process.exit(1);
  }
  return args;
}

function runNpm(args, extra) {
  const argv = [args.registry ? '--registry' : null, args.registry, ...extra].filter(Boolean);
  const result = spawnSync('npm', argv, {
    encoding: 'utf-8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch {
    parsed = null;
  }
  return { parsed, stderr: (result.stderr || '').trim(), status: result.status };
}

function severityIndex(sev) {
  const idx = SEVERITY_ORDER.indexOf(sev);
  return idx === -1 ? 0 : idx;
}

function countVulnerabilities(auditJson) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  const byPackage = new Map();
  const vulns = auditJson?.vulnerabilities ?? {};
  for (const [name, info] of Object.entries(vulns)) {
    const sev = (info?.severity ?? 'info').toLowerCase();
    if (severityIndex(sev) >= severityIndex('low')) {
      counts[sev] = (counts[sev] ?? 0) + 1;
    }
    byPackage.set(name, {
      severity: sev,
      range: info?.range ?? 'any',
      direct: Boolean(info?.isDirect),
    });
  }
  return { counts, byPackage };
}

function renderTable(rows) {
  const nameW = Math.max(24, ...rows.map((r) => r[0].length));
  const sevW = Math.max(SEV_PAD, ...rows.map((r) => r[1].length));
  const line = ` ${''.padEnd(nameW, '─')}─┬─${''.padEnd(sevW, '─')}─┤`;
  console.log(` ${'package'.padEnd(nameW)} │ ${'severity'.padEnd(sevW)} │ direct`);
  console.log(line);
  for (const [name, sev, direct] of rows) {
    console.log(` ${name.padEnd(nameW)} │ ${sev.padEnd(sevW)} │ ${direct ? 'yes' : 'no'}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  console.log('[dependency-audit] running npm audit…');
  const audit = runNpm(args, ['audit', '--json']);
  const { counts, byPackage } = countVulnerabilities(audit.parsed);
  if (audit.parsed === null) {
    console.error('[dependency-audit] could not parse `npm audit --json` output.');
    if (audit.stderr) console.error(audit.stderr);
    console.error('[dependency-audit] ensure a lockfile exists and npm can reach the registry.');
    process.exit(1);
  }

  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  console.log('\n[dependency-audit] audit summary');
  console.log(` ${'critical'.padEnd(SEV_PAD)} ${counts.critical}`);
  console.log(` ${'high'.padEnd(SEV_PAD)} ${counts.high}`);
  console.log(` ${'moderate'.padEnd(SEV_PAD)} ${counts.moderate}`);
  console.log(` ${'low'.padEnd(SEV_PAD)} ${counts.low}`);
  console.log(` ${'total'.padEnd(SEV_PAD)} ${total}`);

  const rows = [...byPackage.entries()]
    .map(([name, v]) => [name, v.severity, v.direct])
    .sort((a, b) => severityIndex(b[1]) - severityIndex(a[1]));
  if (rows.length > 0) {
    console.log('\n[dependency-audit] failing packages');
    renderTable(rows);
  }

  let outdatedEntries = [];
  if (args.outdated) {
    console.log('\n[dependency-audit] checking outdated dependencies…');
    const outdated = runNpm(args, ['outdated', '--json']);
    const map = outdated.parsed ?? {};
    outdatedEntries = Object.entries(map).filter(([, v]) => v && typeof v === 'object');
    if (outdatedEntries.length === 0) {
      console.log('[dependency-audit] all dependencies are up to date.');
    } else {
      console.log(
        ` ${'package'.padEnd(30)} │ ${'current'.padEnd(12)} │ ${'wanted'.padEnd(12)} │ ${'latest'.padEnd(12)} │ type`,
      );
      console.log(
        ` ${''.padEnd(30, '─')}─┼─${''.padEnd(12, '─')}─┼─${''.padEnd(12, '─')}─┼─${''.padEnd(12, '─')}─┼──────`,
      );
      for (const [name, v] of outdatedEntries) {
        console.log(
          ` ${name.padEnd(30)} │ ${String(v.current ?? '—').padEnd(12)} │ ${String(v.wanted ?? '—').padEnd(12)} │ ${String(v.latest ?? '—').padEnd(12)} │ ${v.type ?? 'dependencies'}`,
        );
      }
    }
  }

  let fail = false;
  if (args.failOn) {
    const threshold = severityIndex(args.failOn);
    const hits = Object.entries(counts)
      .filter(([sev]) => severityIndex(sev) >= threshold)
      .reduce((n, [, c]) => n + c, 0);
    if (hits > 0) fail = true;
    console.log(`\n[dependency-audit] --fail-on ${args.failOn} -> ${fail ? 'FAIL' : 'OK'}`);
  } else if (total > 0) {
    // Conservative default for CI: any finding fails the audit.
    fail = true;
  }
  if (args.outdated && outdatedEntries.length > 0) fail = true;

  console.log(`[dependency-audit] ${fail ? 'FAIL — action required' : 'OK'}`);
  process.exit(fail ? 1 : 0);
}

main();
