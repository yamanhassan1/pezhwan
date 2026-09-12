#!/usr/bin/env node
/**
 * PEZHWAN — signing-key rotation utility.
 *
 * Rotates the identity-server's persisted signing keys in place. Mirrors the
 * production path exactly: the FileKeyStoreAdapter (packages/core) persists
 * one `<kid>.pem` per key, each file holding `JSON.stringify(SigningKey)`
 * (PEM public/private + lifecycle fields), written atomically via a `.pem.tmp`
 * rename. A rotation here retires the current ACTIVE key to VERIFY-ONLY,
 * generates a fresh RSA-2048 ACTIVE key, persists both, and (with --url)
 * verifies the JWKS endpoint publishes the new kid.
 *
 * Key material format accuracy is critical: it must round-trip through
 * FileKeyStoreAdapter.load(), otherwise the server would reject the key files.
 *
 * Usage:
 *   node scripts/rotate-keys.mjs
 *     --dir <path>    signing-key directory (default: PEZHWAN_SIGNING_KEY_DIR,
 *                     PEZHWAN_SIGNING_KEYS_PATH, or apps/identity-server/keys)
 *     --url <base>    verify the new kid appears in GET /.well-known/jwks.json
 *     --dry-run       print the plan; do not write, retract, or verify
 *     --help          show this help
 */

import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, '../apps/identity-server/keys');
const KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matching the runtime default
const JWKS_VERIFY_ATTEMPTS = 10;
const JWKS_VERIFY_INTERVAL_MS = 500;

function usage() {
  console.log(`Usage: node scripts/rotate-keys.mjs [options]
  --dir <path>   signing-key directory
                 (default: PEZHWAN_SIGNING_KEY_DIR | PEZHWAN_SIGNING_KEYS_PATH |
                 apps/identity-server/keys)
  --url <base>   verify the new kid is published at /.well-known/jwks.json
  --dry-run      print the plan and exit without writing anything
  --help         show this help`);
}

function parseArgs(argv) {
  const args = {
    dir:
      process.env.PEZHWAN_SIGNING_KEY_DIR || process.env.PEZHWAN_SIGNING_KEYS_PATH || DEFAULT_DIR,
    url: null,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') args.dir = path.resolve(argv[++i]);
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`[rotate-keys] unknown argument: ${a}`);
      usage();
      process.exit(1);
    }
  }
  return args;
}

async function generateRsaKey() {
  // Prefer the real @pezhwan/crypto API (generateRsaKeyPair) when the package
  // build exists; fall back to node:crypto so the tool works on a fresh clone
  // before the workspace has been built.
  try {
    const cryptoPkg = await import('@pezhwan/crypto');
    const kp = cryptoPkg.generateRsaKeyPair(2048);
    return { publicKey: kp.publicKey, privateKey: kp.privateKey };
  } catch {
    const kp = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKey: kp.publicKey, privateKey: kp.privateKey };
  }
}

function newSigningKey(now) {
  return {
    kid: randomUUID(),
    publicKey: '',
    privateKey: '',
    createdAt: now,
    status: 'ACTIVE',
    activatedAt: now,
    expiresAt: now + KEY_TTL_MS,
  };
}

async function loadKeys(dir) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const keys = [];
  for (const name of await fs.readdir(dir)) {
    if (!name.endsWith('.pem')) continue;
    if (name.endsWith('.pem.tmp')) {
      await fs.unlink(path.join(dir, name)).catch(() => {});
      continue;
    }
    const raw = await fs.readFile(path.join(dir, name), 'utf-8');
    const key = JSON.parse(raw);
    if (!key?.kid || !key?.publicKey || !key?.privateKey) {
      throw new Error(`Corrupt key file '${name}' — aborting rotation (fail closed).`);
    }
    keys.push(key);
  }
  return keys;
}

async function atomicWrite(dir, key) {
  const idFile = path.join(dir, `${key.kid}.pem`);
  const tmp = `${idFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(key), { encoding: 'utf-8', mode: 0o600 });
  await fs.rename(tmp, idFile);
}

async function verifyJwks(url, kid) {
  const base = url.replace(/\/$/, '');
  for (let attempt = 0; attempt < JWKS_VERIFY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${base}/.well-known/jwks.json`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = await res.json().catch(() => ({}));
      const keys = Array.isArray(body?.keys) ? body.keys : [];
      const known = keys.find((k) => k.kid === kid);
      if (res.ok && known) {
        console.log(`[rotate-keys] verified: kid ${kid} is published (attempt ${attempt + 1}).`);
        return true;
      }
    } catch {
      /* server still starting / not reachable — retry */
    }
    await new Promise((r) => setTimeout(r, JWKS_VERIFY_INTERVAL_MS));
  }
  console.error(
    `[rotate-keys] FAIL: kid ${kid} was not published by ${url} after ${JWKS_VERIFY_ATTEMPTS} attempts.`,
  );
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  const now = Date.now();

  console.log(`[rotate-keys] signing-key directory: ${args.dir}`);
  if (args.dryRun) console.log('[rotate-keys] DRY-RUN — nothing will be written.');

  const keys = await loadKeys(args.dir);
  const active = keys.find((k) => k.status === 'ACTIVE' && k.expiresAt > now);

  const next = newSigningKey(now);
  const { publicKey, privateKey } = await generateRsaKey();
  next.publicKey = publicKey;
  next.privateKey = privateKey;

  console.log(`[rotate-keys] existing active key : ${active ? active.kid : '(none)'}`);
  console.log(`[rotate-keys] retiring it as      : VERIFY-ONLY (still valid for verifying tokens)`);
  console.log(
    `[rotate-keys] new active key      : ${next.kid} (RSA-2048, expires ${new Date(next.expiresAt).toISOString()})`,
  );

  if (active) {
    active.status = 'VERIFY-ONLY';
    active.retiredAt = now;
  }

  if (args.dryRun) {
    console.log(`[rotate-keys] dry-run: would write ${keys.length + 1} key file(s) in ${args.dir}`);
    if (args.url)
      console.log(
        `[rotate-keys] dry-run: would verify kid ${next.kid} at ${args.url}/.well-known/jwks.json`,
      );
    return;
  }

  await atomicWrite(args.dir, next);
  if (active) {
    await atomicWrite(args.dir, active);
  }
  console.log(`[rotate-keys] persisted ${keys.length + 1} key file(s) via atomic temp+rename.`);

  if (args.url) {
    const ok = await verifyJwks(args.url, next.kid);
    process.exit(ok ? 0 : 1);
  }
  console.log(
    '[rotate-keys] done. Restart the identity server if the JWKS endpoint is already cached (PEZHWAN_JWKS_CACHE_TTL).',
  );
}

main().catch((err) => {
  console.error('[rotate-keys] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
