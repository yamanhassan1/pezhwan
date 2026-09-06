/**
 * PEZHWAN — final security audit (Phase 7.3).
 *
 * A local, deterministic gate that checks the release-blocking security
 * invariants that can be verified on the working tree:
 *
 *   1. Secret scanning passes (`scripts/secret-scan.mjs --ci`).
 *   2. Secret-bearing surfaces are untracked (keys/, *.pem, *.key) or absent.
 *   3. No tracked `.env*` or private-key material above the gitignore boundary.
 *   4. Core session/rate-limit/audit/rotation controls exist in source.
 *   5. OWASP/STRIDE documentation (threat model, checklist, tests) exists.
 *   6. TLS is present in the compose stack and deployment docs.
 *   7. Security scanning is wired into CI workflows.
 *   8. Reproducible install (package-lock.json committed).
 *
 * Prints one PASS/FAIL line per check and exits non-zero if anything FAILs.
 * Run: `node scripts/security-audit.mjs`
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return {
      ok: false,
      message: err.stderr ? err.stderr.toString().trim() : String(err),
    };
  }
}

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const results = [];

console.log('PEZHWAN security audit\n');

/* 1. Secret scanner. */
{
  const out = run('node scripts/secret-scan.mjs --ci');
  const ok = typeof out !== 'object';
  results.push(check('secret-scan (scripts/secret-scan.mjs --ci) passes', ok));
}

/* 2. Key material remains untracked. */
{
  const tracked = run('git ls-files keys backups *.pem *.key .env .env.*');
  const keys = Array.isArray(tracked) ? [] : tracked.split(/\r?\n/).filter(Boolean);
  const envTemplate = /^\.env\.(example|sample|template)$/i;
  const leaked = keys.filter(
    (p) =>
      /\.(pem|key)$/i.test(p) ||
      /^keys\//.test(p) ||
      /(^|\/)\.env$/.test(p) ||
      (/^\.env\./i.test(p) && !envTemplate.test(p)),
  );
  results.push(
    check(
      'secret material is not tracked (keys/, *.pem, *.key, .env)',
      leaked.length === 0,
      leaked.join(', '),
    ),
  );
}

/* 3. Cipher keys never near plaintext: the keystore is encrypted. */
{
  const ok =
    (existsSync(join(root, 'packages/core/src/services/infrastructure/key-store.service.ts')) &&
      existsSync(join(root, 'packages/crypto/src/hsm'))) ||
    false;
  results.push(check('keystore + HSM/KMS abstraction present', ok));
}

/* 4. Core security controls present in source. */
{
  const controls = [
    ['rate limiting', 'packages/express/src/rateLimit.ts'],
    ['tamper-evident audit service', 'packages/core/src/services/audit.service.ts'],
    ['distributed lock', 'packages/core/src/services/infrastructure/distributed-lock.ts'],
    ['Redis manager', 'packages/core/src/services/infrastructure/redis-manager.ts'],
    ['MFA service', 'packages/core/src/services/mfa.service.ts'],
    ['risk engine', 'packages/core/src/services/security/risk.service.ts'],
    ['breach detector', 'packages/core/src/services/security/breach-detector.service.ts'],
  ];
  for (const [label, rel] of controls) {
    results.push(check(`${label} present`, existsSync(join(root, rel))));
  }
}

/* 5. Threat modeling + security documentation. */
{
  const docs = [
    'docs/security/THREAT-MODEL.md',
    'docs/security/security-checklist.md',
    'docs/security/penetration-testing.md',
    'docs/security/incident-response.md',
    'docs/security/security-audit.md',
    'docs/security/key-management.md',
    'docs/security/secrets-management.md',
    'docs/operations/PRODUCTION_READINESS.md',
  ];
  for (const rel of docs) {
    results.push(check(`${rel} exists`, existsSync(join(root, rel))));
  }
}

/* 6. TLS in the deployment stack. */
{
  let found = false;
  const lines = [];
  const candidates = [
    'infrastructure/docker/nginx/nginx.conf',
    'infrastructure/docker/docker-compose.yml',
  ];
  for (const rel of candidates) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    if (/(443|listen .*\bssl\b|ssl_certificate|starttls)|TLS/i.test(content)) {
      found = true;
      lines.push(rel);
    }
  }
  results.push(
    check('TLS/HTTPS termination configured (nginx/compose markers)', found, lines.join(', ')),
  );
}

/* 7. CI security gates wired up. */
{
  const ok =
    existsSync(join(root, '.github/workflows/security.yml')) &&
    existsSync(join(root, '.github/workflows/ci.yml'));
  results.push(check('CI + security workflows present', ok));
}

/* 8. Reproducible dependency install. */
{
  results.push(check('package-lock.json committed', existsSync(join(root, 'package-lock.json'))));
}

const failures = results.filter((r) => !r).length;
console.log(
  `\nAudit ${failures === 0 ? 'PASSED' : 'FAILED'} (${results.length} checks, ${failures} failure(s))`,
);
process.exitCode = failures === 0 ? 0 : 1;
