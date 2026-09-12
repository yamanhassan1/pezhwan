#!/usr/bin/env node
/**
 * PEZHWAN — identity-server health check.
 *
 * Standalone probe for a running identity server. Checks /health/live and
 * /health/ready (503 => not ready), then verifies that /.well-known/jwks.json
 * publishes at least one signing key. Exits 0 when healthy, 1 otherwise.
 *
 * Usage:
 *   node scripts/health-check.mjs
 *     --url <base>        base URL (default: PEZHWAN_URL or http://localhost:4011)
 *     --wait <seconds>    retry for up to N seconds until healthy (default 0 = no wait)
 *     --interval <secs>   retry interval in seconds (default 2)
 *     --verbose           print each probe's HTTP status
 *
 * Exit codes:
 *   0  healthy (live + ready + JWKS keys present)
 *   1  unhealthy or unreachable
 */

const DEFAULT_URL = process.env.PEZHWAN_URL ?? 'http://localhost:4011';
const HEALTH_MS_TIMEOUT = 5000;

function usage() {
  console.log(`Usage: node scripts/health-check.mjs [options]
  --url <base>       base URL (default: ${DEFAULT_URL})
  --wait <seconds>   retry up to N seconds until healthy (default 0)
  --interval <secs>  seconds between retries (default 2)
  --verbose          print per-probe HTTP statuses
  --help             show this help`);
}

function parseArgs(argv) {
  const args = { url: DEFAULT_URL, wait: 0, interval: 2, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--wait') args.wait = Number(argv[++i]);
    else if (a === '--interval') args.interval = Number(argv[++i]);
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`[health-check] unknown argument: ${a}`);
      usage();
      process.exit(1);
    }
  }
  if (!args.url) {
    console.error('[health-check] --url must not be empty');
    process.exit(1);
  }
  if (!Number.isFinite(args.wait) || args.wait < 0) {
    console.error('[health-check] --wait must be a non-negative number of seconds');
    process.exit(1);
  }
  if (!Number.isFinite(args.interval) || args.interval < 1) {
    console.error('[health-check] --interval must be >= 1 second');
    process.exit(1);
  }
  return args;
}

const url = (base, path) => base.replace(/\/$/, '') + path;

async function probe(path) {
  const res = await fetch(url(probeBase, path), {
    signal: AbortSignal.timeout(HEALTH_MS_TIMEOUT),
    headers: { accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let probeBase;

async function runProbe(args, path) {
  const start = Date.now();
  const { status, body } = await probe(path);
  const ms = Date.now() - start;
  if (args.verbose) {
    console.log(`[health-check] GET ${path} -> ${status} (${ms}ms)`);
  }
  return { status, body };
}

async function isReady(args) {
  const live = await runProbe(args, '/health/live');
  if (live.status !== 200) {
    return { ok: false, reason: `GET /health/live -> ${live.status}` };
  }
  const ready = await runProbe(args, '/health/ready');
  if (ready.status !== 200) {
    return {
      ok: false,
      reason: `GET /health/ready -> ${ready.status} (not ready: ${JSON.stringify(ready.body)})`,
    };
  }
  const jwks = await runProbe(args, '/.well-known/jwks.json');
  if (jwks.status !== 200) {
    return { ok: false, reason: `GET /.well-known/jwks.json -> ${jwks.status}` };
  }
  const keys = Array.isArray(jwks.body?.keys) ? jwks.body.keys : [];
  if (keys.length === 0) {
    return { ok: false, reason: `JWKS returned no keys (${JSON.stringify(jwks.body)})` };
  }
  return { ok: true, live, ready, jwks };
}

async function main() {
  const args = parseArgs(process.argv);
  probeBase = args.url;

  const deadline = args.wait > 0 ? Date.now() + args.wait * 1000 : 0;
  let report = null;
  let lastError = '';

  for (;;) {
    try {
      report = await isReady(args);
      if (report.ok) break;
      lastError = report.reason;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      report = null;
    }
    if (deadline && Date.now() < deadline) {
      if (args.verbose) console.log(`[health-check] not ready: ${lastError} — retrying…`);
      await new Promise((r) => setTimeout(r, args.interval * 1000));
    } else {
      break;
    }
  }

  if (report?.ok) {
    console.log(
      `[health-check] OK — ${probeBase} is live, ready, and publishes ${report.jwks.body.keys.length} JWKS key(s).`,
    );
    process.exit(0);
  }

  console.error(`[health-check] FAIL — ${probeBase} is not healthy.`);
  if (lastError) console.error(`[health-check] detail: ${lastError}`);
  console.error(
    '[health-check] start the server (npm run dev -w @pezhwan/identity-server) and retry.',
  );
  process.exit(1);
}

main();
