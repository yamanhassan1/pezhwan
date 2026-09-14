#!/usr/bin/env node
/**
 * PEZHWAN — signing-key rotation verifier (zero-downtime assertion).
 *
 * Asserts the docs/PROMPT.md A.5 acceptance:
 *   - rotation produces a new kid visible in JWKS;
 *   - tokens with the old kid STILL verify during the VERIFY-ONLY window;
 *   - the persisted key set survives a restart round-trip.
 *
 * That last point IS the zero-downtime guarantee: verifiers that cached the
 * old JWKS keep accepting in-flight tokens because the retired key stays
 * published (VERIFY-ONLY) until TTL, and the new key is advertises at the same
 * time. An outage would drop the old kid from JWKS or reject its tokens.
 *
 * Uses the real runtime components it is verifying (@pezhwan/crypto KeyStore +
 * @pezhwan/core FileKeyStoreAdapter/KeyStoreService), so it must run after
 * `npm run build`. An optional --url check polls the live JWKS endpoint.
 *
 * Usage:
 *   node scripts/verify-rotation.mjs
 *     --algorithm <alg>   signing algorithm (default RS256; any JwtSigningAlgorithm)
 *     --url <base>        also poll GET /.well-known/jwks.json for the new kid
 *     --help              show this help
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';

function usage() {
  console.log(`Usage: node scripts/verify-rotation.mjs [options]
  --algorithm <alg>   signing algorithm (default: RS256)
                      (RS256 | ES256 | EdDSA | ML-DSA-65 | ML-DSA-87 |
                       hybrid-RS256-MLDSA65 | hybrid-ES256-MLDSA65)
  --url <base>        poll the live JWKS endpoint for the new kid
  --help              show this help

Requires a prior \`npm run build\` (imports @pezhwan/crypto + @pezhwan/core).
`);
}

function parseArgs(argv) {
  const args = { algorithm: process.env.PEZHWAN_JWT_ALGORITHM ?? 'RS256', url: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--algorithm') args.algorithm = argv[++i];
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`[verify-rotation] unknown argument: ${a}`);
      usage();
      process.exit(1);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  let crypto;
  let core;
  try {
    [crypto, core] = await Promise.all([import('@pezhwan/crypto'), import('@pezhwan/core')]);
  } catch {
    console.error('[verify-rotation] @pezhwan/crypto or @pezhwan/core is not built.');
    console.error('[verify-rotation] Run `npm run build` first.');
    process.exit(1);
  }

  const { KeyStore } = crypto;
  const { FileKeyStoreAdapter, KeyStoreService } = core;
  const directory = mkdtempSync(`${tmpdir()}${sep}pezhwan-rotation-`);
  const fails = [];
  const check = (ok, message) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`);
    if (!ok) fails.push(message);
  };

  try {
    console.log(`[verify-rotation] algorithm=${args.algorithm}`);
    console.log(`[verify-rotation] keystore dir: ${directory}`);

    // ── Boot: KeyStoreService.init() generates + persists key A ───────────
    const store = new KeyStore(args.algorithm);
    const adapter = new FileKeyStoreAdapter(directory, args.algorithm);
    const service = new KeyStoreService(store, adapter);
    await service.init();
    const kidA = store.current.kid;
    check(store.all.length === 1, `bootstrap generated one key (${kidA})`);

    // ── Pre-rotation: an in-flight token signed with kid A ────────────────
    const tokenA = store.sign({ sub: 'rotation-probe', iat: Math.floor(Date.now() / 1000) });
    const headerA = JSON.parse(Buffer.from(tokenA.split('.')[0], 'base64url').toString('utf-8'));
    check(headerA.kid === kidA, `pre-rotation token signed with ${kidA}`);

    // ── ROTATE ────────────────────────────────────────────────────────────
    await service.rotate();
    const kidB = store.current.kid;
    check(kidA !== kidB, `rotation produced a new kid (${kidB})`);

    // ── ZERO-DOWNTIME assertions ──────────────────────────────────────────
    const jwksBefore = new Set(store.jwks().map((j) => j.kid));
    check(
      jwksBefore.has(kidA) && jwksBefore.has(kidB),
      `JWKS publishes BOTH keys during rotation (kids: ${[...jwksBefore].join(', ')})`,
    );

    let oldStillVerifies = false;
    try {
      store.verify(tokenA);
      oldStillVerifies = true;
    } catch {
      oldStillVerifies = false;
    }
    check(oldStillVerifies, 'token signed with the OLD kid still verifies (VERIFY-ONLY window)');

    const tokenB = store.sign({ sub: 'rotation-probe', iat: Math.floor(Date.now() / 1000) });
    const headerB = JSON.parse(Buffer.from(tokenB.split('.')[0], 'base64url').toString('utf-8'));
    check(headerB.kid === kidB, `post-rotation tokens sign with ${kidB}`);
    let freshVerifies = false;
    try {
      store.verify(tokenB);
      freshVerifies = true;
    } catch {
      freshVerifies = false;
    }
    check(freshVerifies, 'token signed with the NEW kid verifies');

    // ── Restart round-trip: keys restored from disk, no re-generation ─────
    const store2 = new KeyStore(args.algorithm);
    await new KeyStoreService(store2, new FileKeyStoreAdapter(directory, args.algorithm)).init();
    const restoredKids = new Set(store2.all.map((k) => k.kid));
    check(
      restoredKids.has(kidA) && restoredKids.has(kidB),
      'restart restores BOTH keys without re-generation',
    );
    let crossRestart = false;
    try {
      store2.verify(tokenA);
      store2.verify(tokenB);
      crossRestart = true;
    } catch {
      crossRestart = false;
    }
    check(crossRestart, 'tokens from before the restart still verify after restore');

    // ── Optional live JWKS check ──────────────────────────────────────────
    if (args.url) {
      const base = args.url.replace(/\/$/, '');
      let published = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const res = await fetch(`${base}/.well-known/jwks.json`, {
            signal: AbortSignal.timeout(5000),
          });
          const body = await res.json().catch(() => ({}));
          const kids = Array.isArray(body?.keys) ? body.keys.map((k) => k.kid) : [];
          if (res.ok && kids.includes(kidB)) {
            published = true;
            break;
          }
        } catch {
          /* server still starting — retry */
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      check(published, `live JWKS at ${base} publishes ${kidB}`);
    }

    console.log(
      fails.length === 0
        ? `\n[verify-rotation] OK — zero-downtime rotation verified for ${args.algorithm}.`
        : `\n[verify-rotation] FAILED — ${fails.length} assertion(s):\n    - ${fails.join('\n    - ')}`,
    );
    process.exit(fails.length === 0 ? 0 : 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[verify-rotation] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
