#!/usr/bin/env node
/**
 * PEZHWAN — Secret Scanner.
 *
 * Scans staged files (pre-commit) or the whole tree (CI) for high-confidence
 * secret patterns. Fails (exit 1) when a secret is detected.
 *
 * Usage:
 *   node scripts/secret-scan.mjs           # scan staged files
 *   node scripts/secret-scan.mjs --ci       # scan everything not gitignored
 *
 * This is a lightweight HEURISTIC scanner. It is NOT a substitute for a
 * dedicated tool (Gitleaks, TruffleHog, GitHub Secret Scanning). For full
 * coverage, integrate Gitleaks into CI as well.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// High-confidence patterns (avoid noisy false positives)
// ---------------------------------------------------------------------------

const PATTERNS = [
  // AWS access key
  {
    name: 'AWS Access Key',
    re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  // GitHub / GitLab tokens
  {
    name: 'GitHub Token',
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/,
  },
  {
    name: 'GitLab Token',
    re: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  },
  // Google API key
  {
    name: 'Google API Key',
    re: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  // Stripe
  {
    name: 'Stripe Secret Key',
    re: /\bsk_live_[0-9A-Za-z]{24,}\b/,
  },
  {
    name: 'Stripe Restricted Key',
    re: /\brk_live_[0-9A-Za-z]{24,}\b/,
  },
  // Slack
  {
    name: 'Slack Token',
    re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
  },
  // Twilio
  {
    name: 'Twilio API Key',
    re: /\bSK[0-9a-fA-F]{32}\b/,
  },
  // Private keys
  {
    name: 'RSA Private Key',
    re: /-----BEGIN RSA PRIVATE KEY-----/,
  },
  {
    name: 'EC Private Key',
    re: /-----BEGIN (?:EC|OPENSSH) PRIVATE KEY-----/,
  },
  {
    name: 'Generic Private Key',
    re: /-----BEGIN PRIVATE KEY-----/,
  },
  // Mongo connection with credentials
  {
    name: 'Mongo DB URI with credentials',
    re: /mongodb(?:\+srv)?:\/\/[^\/\s@]+:[^\/\s@]+@/,
  },
  // Redis with password
  {
    name: 'Redis URL with password',
    re: /redis:\/\/[^:\/\s@]+:[^@\/\s]+@/,
  },
  // Postgres/MySQL connection with credentials
  {
    name: 'Postgres/MySQL URI with credentials',
    re: /\b(?:postgres|postgresql|mysql):\/\/[^\/\s@]+:[^\/\s@]+@/,
  },
  // Hardcoded JWT secret assignment
  {
    name: 'Hardcoded JWT secret',
    re: /\b(?:JWT|jwt)_?(?:SECRET|secret)\s*[:=]\s*["'][^"']{3,}["']/,
  },
  // Hardcoded api key / password assignments
  {
    name: 'Hardcoded API key',
    re: /\b(?:api[_-]?key|apikey|API_KEY)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  },
  {
    name: 'Hardcoded password',
    re: /\b(?:password|passwd|db_password)\s*[:=]\s*["'][^"'\s]{6,}["']/i,
  },
  // Firebase service account
  {
    name: 'Firebase Service Account',
    re: /"type"\s*:\s*"service_account"/,
  },
  // Generic base64 JWT with high assurance (3 segments)
  {
    name: 'JWT (compact) — lookalike',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
];

// ---------------------------------------------------------------------------
// File-type allowlist (only scan files that could plausibly contain secrets)
// ---------------------------------------------------------------------------

const SKIP_EXT = new Set([
  '.map', '.lock', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
]);

const SKIP_PATH = /(^|\/)(node_modules|dist|build|\.git|\.husky|coverage|scripts)(\/|$)/;

// ---------------------------------------------------------------------------

/**
 * Files that are explicitly safe to skip because they contain TEST-ONLY
 * dummy values used to verify the logger's redaction feature. These are NOT
 * real credentials — they are the accepted exception in the security policy
 * for automated tests. Review these files manually if concerned.
 */
const REDACTION_TEST_FIXTURES = new Set([
  'packages/core/test/security.test.ts',
  'tests/security/backstop-security.test.ts',
  'packages/oauth/test/oauth.test.ts',
]);

function shouldSkip(file) {
  const lower = file.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (SKIP_EXT.has(ext) || SKIP_PATH.test(file)) {
    return true;
  }
  if (REDACTION_TEST_FIXTURES.has(file)) {
    return true;
  }
  return false;
}

function scanFile(file) {
  if (shouldSkip(file)) {
    return [];
  }
  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    return [];
  }
  const findings = [];
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(content)) {
      findings.push({ file, pattern: name });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------

function stagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function allFiles() {
  try {
    const out = execSync(
      "git ls-files --cached --others --exclude-standard",
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------

const isCi = process.argv.includes('--ci');
const files = isCi ? allFiles() : stagedFiles();

if (files.length === 0) {
  console.log('[secret-scan] no files to scan.');
  process.exit(0);
}

const allFindings = [];
for (const file of files) {
  for (const f of scanFile(file)) {
    allFindings.push(f);
  }
}

if (allFindings.length > 0) {
  console.error('\n╔══════════════════════════════════════════════════════════════╗');
  console.error('║  PEZHWAN SECRET DETECTED — COMMIT BLOCKED                 ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  for (const f of allFindings) {
    console.error(`  [${f.pattern}] ${f.file}`);
  }
  console.error('\nRemove the secret, rotate it immediately if it was ever exposed,');
  console.error('and re-stage your files. Do NOT commit credentials.\n');
  process.exit(1);
}

console.log(`[secret-scan] OK — no secrets detected in ${files.length} file(s).`);
process.exit(0);
