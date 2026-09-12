#!/usr/bin/env node
/**
 * PEZHWAN — HTTP load benchmark for the identity-server REST API.
 *
 * Standalone, dependency-free (Node built-ins + global fetch) load test
 * against the /v1/auth/register and /v1/auth/login endpoints (see
 * docs/OPENAPI.yaml). Seeds a pool of users via register, then drives a
 * concurrent workload until --duration elapses or --iterations is reached.
 *
 * Usage:
 *   node scripts/benchmark.mjs
 *     --url <base>         base URL (default: PEZHWAN_URL or http://localhost:4011)
 *     --users <N>          size of the user pool (default 100)
 *     --concurrency <C>    concurrent workers (default 10)
 *     --duration <S>       run for S seconds (default 10)
 *     --iterations <N>     stop after N requests (takes precedence over duration)
 *     --mode <login|register>  endpoint to load (default login)
 *     --seed-only          register the user pool and exit without load
 *
 * The state-changing endpoints use double-submit CSRF; the benchmark obtains a
 * pezhwan_csrf cookie + X-CSRF-Token once at startup, like a real browser
 * client. Note the server's default rate limits (login 10/15m, api 100/15m)
 * will throttle high-concurrency runs — raise PEZHWAN_RATE_LIMIT_* in the
 * server .env for a meaningful measurement, and reset the user pool between
 * runs for repeatable numbers.
 *
 * Report: requests/sec, error rate, latency percentiles (p50/p95/p99).
 */

const DEFAULT_URL = process.env.PEZHWAN_URL ?? 'http://localhost:4011';
const REQUEST_TIMEOUT_MS = 30_000;

function usage() {
  console.log(`Usage: node scripts/benchmark.mjs [options]
  --url <base>          base URL (default: ${DEFAULT_URL})
  --users <N>           user pool size (default 100)
  --concurrency <C>     concurrent workers (default 10)
  --duration <S>        run for S seconds (default 10)
  --iterations <N>      stop after N requests (overrides --duration)
  --mode <login|register>  workload endpoint (default login)
  --seed-only           register users and exit (no load)
  --help                show this help`);
}

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    users: 100,
    concurrency: 10,
    duration: 10,
    iterations: 0,
    mode: 'login',
    seedOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--users') args.users = Number(argv[++i]);
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (a === '--duration') args.duration = Number(argv[++i]);
    else if (a === '--iterations') args.iterations = Number(argv[++i]);
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--seed-only') args.seedOnly = true;
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`[benchmark] unknown argument: ${a}`);
      usage();
      process.exit(1);
    }
  }
  if (!['login', 'register'].includes(args.mode)) {
    console.error(`[benchmark] --mode must be 'login' or 'register', got '${args.mode}'`);
    process.exit(1);
  }
  for (const key of ['users', 'concurrency', 'duration']) {
    if (!Number.isInteger(args[key]) || args[key] <= 0) {
      console.error(`[benchmark] --${key} must be a positive integer`);
      process.exit(1);
    }
  }
  if (args.iterations && !Number.isInteger(args.iterations)) {
    console.error('[benchmark] --iterations must be a positive integer');
    process.exit(1);
  }
  return args;
}

const base = (u) => u.replace(/\/$/, '');

function parseSetCookie(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const m = /^([^=]+)=([^;]*)/.exec(raw);
    if (m) return { name: m[1], value: m[2] };
  }
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const m = /^([^=]+)=([^;]*)/.exec(raw);
  return m ? { name: m[1], value: m[2] } : null;
}

async function acquireCsrf(args) {
  try {
    const res = await fetch(`${base(args.url)}/v1/auth/csrf`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const cookie = parseSetCookie(res);
    const body = await res.json().catch(() => null);
    const token = body?.csrfToken;
    if (!cookie || !token) return null;
    return {
      cookieHeader: `${cookie.name}=${cookie.value}`,
      csrfHeader: token,
    };
  } catch {
    return null;
  }
}

function makeUser(i) {
  const stamp = `${process.pid}-${i}`;
  return {
    email: `bench-${stamp}@pezhwan.dev`,
    password: 'B3nch!Mark#2026',
  };
}

async function registerUser(args, headers, user) {
  return fetch(`${base(args.url)}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email: user.email, password: user.password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function loginUser(args, headers, user) {
  return fetch(`${base(args.url)}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email: user.email, password: user.password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function seed(args, headers, users) {
  const ok = { created: 0, duplicate: 0, failed: 0 };
  const errored = [];
  await Promise.all(
    users.map(async (user) => {
      try {
        const res = await registerUser(args, headers, user);
        if (res.status === 201 || res.status === 200) ok.created += 1;
        else if (res.status === 409 || res.status === 400 || res.status === 422) ok.duplicate += 1;
        else {
          ok.failed += 1;
          errored.push(`${res.status} for ${user.email}`);
        }
      } catch {
        ok.failed += 1;
        errored.push(`network error for ${user.email}`);
      }
    }),
  );
  return { ok, errored: errored.slice(0, 5) };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

async function runWorkload(args, headers, users) {
  const timings = [];
  let errors = 0;
  let executed = 0;
  const deadline = Date.now() + args.duration * 1000;
  const total = args.iterations || Number.MAX_SAFE_INTEGER;
  const next = () => executed++; // single-threaded counter, workers interleave via microtasks
  let stop = false;

  async function worker() {
    let i = next();
    while (i < total && !stop) {
      const user = users[i % users.length];
      const start = process.hrtime.bigint();
      let error = false;
      try {
        const res =
          args.mode === 'login'
            ? await loginUser(args, headers, user)
            : await registerUser(args, headers, {
                ...user,
                email: `bench-${i}-${process.pid}@pezhwan.dev`,
              });
        if (!res.ok) error = true;
      } catch {
        error = true;
      }
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      timings.push(ms);
      if (error) errors += 1;
      if (!args.iterations && Date.now() >= deadline) stop = true;
      i = next();
    }
  }

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  const elapsedS = (Date.now() - startedAt) / 1000;

  timings.sort((a, b) => a - b);
  const totalRequests = timings.length;
  const rps = elapsedS > 0 ? totalRequests / elapsedS : 0;
  return {
    totalRequests,
    errors,
    errorRate: totalRequests > 0 ? (errors / totalRequests) * 100 : 0,
    rps,
    p50: percentile(timings, 50),
    p95: percentile(timings, 95),
    p99: percentile(timings, 99),
    max: timings.length ? timings[timings.length - 1] : 0,
    min: timings.length ? timings[0] : 0,
    elapsedS,
  };
}

function report(r, users, mode) {
  const pad = (s, w = 22) => String(s).padEnd(w);
  const line = '─'.repeat(80);
  console.log(`\n[benchmark] ${mode.toUpperCase()} workload — ${users} users`);
  console.log(line);
  console.log(`${pad('total requests')}${r.totalRequests}`);
  console.log(`${pad('elapsed')}${r.elapsedS.toFixed(2)}s`);
  console.log(`${pad('requests/sec')}${r.rps.toFixed(2)}`);
  console.log(`${pad('error count')}${r.errors}`);
  console.log(`${pad('error rate')}${r.errorRate.toFixed(2)}%`);
  console.log(line);
  console.log(`${pad('latency p50')}${formatMs(r.p50)}`);
  console.log(`${pad('latency p95')}${formatMs(r.p95)}`);
  console.log(`${pad('latency p99')}${formatMs(r.p99)}`);
  console.log(`${pad('min / max')}${formatMs(r.min)} / ${formatMs(r.max)}`);
  console.log(line);
}

async function main() {
  const args = parseArgs(process.argv);
  const headers = {};
  const csrf = await acquireCsrf(args);
  if (csrf) {
    headers.cookie = csrf.cookieHeader;
    headers['x-csrf-token'] = csrf.csrfHeader;
  } else {
    console.warn(
      '[benchmark] warning: could not acquire CSRF token — state-changing requests may be rejected (403).',
    );
  }

  const users = Array.from({ length: args.users }, (_, i) => makeUser(i));

  console.log(`[benchmark] seeding ${args.users} user(s) on ${args.url} …`);
  const seedResult = await seed(args, headers, users);
  console.log(
    `[benchmark] seed: ${seedResult.ok.created} created, ${seedResult.ok.duplicate} duplicate/skipped, ${seedResult.ok.failed} failed`,
  );
  seedResult.errored.forEach((e) => console.warn(`[benchmark] seed warning: ${e}`));

  if (args.seedOnly) {
    console.log('[benchmark] --seed-only — exiting without load.');
    process.exit(0);
  }

  console.log(
    `[benchmark] running ${args.mode} load: ${args.concurrency} concurrent, ` +
      `${args.iterations ? `${args.iterations} iterations` : `${args.duration}s`}`,
  );
  const result = await runWorkload(args, headers, users);
  report(result, args.users, args.mode);

  const failed = result.totalRequests > 0 && result.errors === result.totalRequests;
  process.exit(failed ? 1 : 0);
}

main();
