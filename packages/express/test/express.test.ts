import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';

import express from 'express';
import {
  extractToken,
  createAuthenticate,
  requireAuth,
  requireRole,
  requirePermission,
  jwksHandler,
  requestContext,
  corsAllowlist,
  buildRouters,
  rateLimit,
} from '@pezhwan/express';
import type { PezhwanRequest } from '@pezhwan/express';
import {
  createPezhwan,
  RateLimitService,
  MemoryCache,
  type PezhwanRuntime,
} from '@pezhwan/core';

function mockRuntime() {
  return createPezhwan({
    issuer: 'https://id.example.com',
    audience: 'pezhwan.clients',
    tenantId: '000000000000000000000001',
    applicationId: '000000000000000000000002',
    otpDelivery: { sendEmail: async () => {} },
  });
}

function req(overrides: Partial<PezhwanRequest> = {}): PezhwanRequest {
  return {
    headers: {},
    cookies: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as PezhwanRequest;
}

function makeRes() {
  const headers = new Map<string, string>();
  const res: any = {
    setHeader: (k: string, v: string) => { headers.set(k.toLowerCase(), String(v)); },
    getHeader: (k: string) => headers.get(k.toLowerCase()),
    sendStatus: () => {},
    on: () => {},
  };
  return res;
}

function nextError(cb: (err: unknown) => void) {
  return (err?: unknown) => cb(err ?? null);
}

test('extractToken reads Bearer header and cookie', () => {
  assert.equal(
    extractToken(req({ headers: { authorization: 'Bearer abc' } })),
    'abc',
  );
  assert.equal(
    extractToken(req({ cookies: { pezhwan_access: 'from-cookie' } })),
    'from-cookie',
  );
  assert.equal(extractToken(req()), null);
});

test('requireAuth rejects when no identity, passes when present', () => {
  const runtime = mockRuntime();
  const token = runtime.tokens.signAccessToken({
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles: ['RIDER'],
    permissions: [],
    authMethod: 'password',
  });

  let called = false;
  requireAuth()(
    req({ pezhwan: runtime.tokens.verifyAccessToken(token) }),
    {} as never,
    () => (called = true),
  );
  assert.equal(called, true);

  let err: unknown;
  requireAuth()(req(), {} as never, (e) => (err = e));
  assert.ok(err instanceof Error);
});

test('requireRole / requirePermission enforce RBAC', () => {
  const runtime = mockRuntime();
  const token = runtime.tokens.signAccessToken({
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles: ['ADMIN'],
    permissions: ['user:read'],
    authMethod: 'password',
  });
  const identity = runtime.tokens.verifyAccessToken(token);

  let ok = false;
  requireRole('ADMIN')(
    req({ pezhwan: identity }),
    {} as never,
    () => (ok = true),
  );
  assert.equal(ok, true);

  let denied: unknown;
  requireRole('CAPTAIN')(
    req({ pezhwan: identity }),
    {} as never,
    (e) => (denied = e),
  );
  assert.ok(denied instanceof Error);

  ok = false;
  requirePermission('user:read')(
    req({ pezhwan: identity }),
    {} as never,
    () => (ok = true),
  );
  assert.equal(ok, true);

  denied = undefined;
  requirePermission('ride:create')(
    req({ pezhwan: identity }),
    {} as never,
    (e) => (denied = e),
  );
  assert.ok(denied instanceof Error);
});

test('jwksHandler returns a published key set', () => {
  const runtime = mockRuntime();
  let served: unknown;
  const shim = {
    json: (body: unknown) => {
      served = body;
      return body;
    },
    setHeader: () => undefined,
  } as never;
  jwksHandler(runtime)(req({}) as never, shim, () => {});
  const body = served as { keys: Array<{ alg: string }> };
  assert.ok(body.keys.length >= 1);
  assert.equal(body.keys[0]!.alg, 'RS256');
});

test('createAuthenticate fails closed AND surfaces 503 when account state cannot be verified', async () => {
  const runtime = mockRuntime();
  const token = runtime.tokens.signAccessToken({
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles: [],
    permissions: [],
    authMethod: 'password',
  });

  // No Mongo is available, so accountState.validate throws. The identity must
  // NOT be attached (fail closed) and the SecurityDependencyError (503) must
  // be forwarded rather than collapsed into a 401.
  let errSent: unknown;
  let reqObj = req({ headers: { authorization: `Bearer ${token}` } });
  await createAuthenticate(runtime)(
    reqObj as never,
    {} as never,
    (e) => (errSent = e),
  );
  const pe = errSent as { code?: string; status?: number };
  assert.ok(errSent instanceof Error, 'dependency outage must be forwarded');
  assert.equal(pe.code, 'FAILED_SECURITY_DEPENDENCY');
  assert.equal(pe.status, 503);
  assert.equal(reqObj.pezhwan, undefined, 'identity must NOT be attached');

  // Malformed token → unauthenticated (no forwarded dependency error; a 401
  // comes from requireAuth()).
  reqObj = req({ headers: { authorization: 'Bearer no-token' } });
  let noErr: unknown = 'not-called';
  await createAuthenticate(runtime)(
    reqObj as never,
    {} as never,
    (e) => (noErr = e ?? null),
  );
  assert.equal(noErr, null, 'invalid token must not forward a dependency error');
  assert.equal(reqObj.pezhwan, undefined);
});

test('requestContext emits X-Response-Time without ERR_HTTP_HEADERS_SENT', async () => {
  const runtime = mockRuntime();
  const app = express();
  app.use(requestContext(runtime));
  app.get('/ping', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as number & { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.equal(res.status, 200);
    await res.json();
    const rt = res.headers.get('x-response-time');
    assert.ok(rt !== null, 'X-Response-Time header must be present');
    assert.ok(Number(rt) >= 0);
    assert.ok(res.headers.get('x-request-id'), 'request id header must be present');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('corsAllowlist: public paths are readable cross-origin, others are gated', () => {
  const handler = corsAllowlist({
    allowedOrigins: ['https://app.example.com'],
    publicPaths: ['/.well-known'],
  });

  // Public path (well-known) GET from an unlisted origin → echoed, no rejection.
  let rejected: unknown = null;
  let res = makeRes();
  handler(
    req({
      method: 'GET',
      path: '/.well-known/jwks.json',
      headers: { origin: 'null' },
    }),
    res,
    nextError((e) => (rejected = e)),
  );
  assert.equal(rejected, null);
  assert.equal(res.getHeader('access-control-allow-origin'), 'null');
  assert.notEqual(res.getHeader('access-control-allow-origin'), '*');
  assert.equal(res.getHeader('access-control-allow-credentials'), undefined);

  // Non-public path from an unlisted origin → 403 REJECTED.
  rejected = null;
  res = makeRes();
  handler(
    req({
      method: 'POST',
      path: '/v1/auth/login',
      headers: { origin: 'https://evil.example.com' },
    }),
    res,
    nextError((e) => (rejected = e)),
  );
  assert.ok(rejected !== null);

  // Credentialed reads on public paths: OPTIONS must NOT echo credentials.
  res = makeRes();
  handler(
    req({
      method: 'OPTIONS',
      path: '/.well-known/jwks.json',
      headers: { origin: 'https://app.example.com' },
    }),
    res,
    nextError(() => {}),
  );
  assert.equal(res.getHeader('access-control-allow-origin'), 'https://app.example.com');
  assert.equal(res.getHeader('access-control-allow-credentials'), undefined);
});

function listen(app: express.Express): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const server = app.listen(0);
    server.once('listening', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test('rateLimit middleware: over budget → 429 with Retry-After + X-RateLimit-*', async () => {
  const runtime = mockRuntime();
  const app = express();
  // A runtime with a deliberately tiny budget so the test is fast and exact.
  (runtime as unknown as { rateLimiter: RateLimitService }).rateLimiter =
    new RateLimitService(new MemoryCache(1000), {
      login: { limit: 2, windowMs: 60_000 },
    });

  app.get(
    '/login',
    rateLimit(runtime as PezhwanRuntime, { type: 'login' }),
    (_req, res) => res.status(200).json({ ok: true }),
  );

  const { port, close } = await listen(app);
  try {
    const url = `http://127.0.0.1:${port}/login`;
    const first = await fetch(url);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-ratelimit-limit'), '2');

    const second = await fetch(url);
    assert.equal(second.status, 200);

    const third = await fetch(url);
    assert.equal(third.status, 429);
    assert.ok(third.headers.get('retry-after'), 'Retry-After must be set');
    assert.equal(third.headers.get('x-ratelimit-limit'), '2');
    assert.equal(third.headers.get('x-ratelimit-remaining'), '0');
    const body = (await third.json()) as {
      error: { code: string; retryAfterMs: number };
    };
    assert.equal(body.error.code, 'RATE_LIMITED');
    assert.ok(body.error.retryAfterMs > 0);
  } finally {
    await close();
  }
});

test('auth router enforces the real login budget end-to-end (11th request → 429)', async () => {
  const runtime = mockRuntime();
  const app = express();
  app.use(express.json());
  const routers = buildRouters(runtime);
  app.use('/v1/auth', routers.auth);

  const { port, close } = await listen(app);
  try {
    const url = `http://127.0.0.1:${port}/v1/auth/login`;
    let saw429 = false;
    for (let i = 0; i < 11; i += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: `${i}@example.com`, password: 'bad' }),
      });
      if (i < 10) {
        assert.notEqual(res.status, 429, `request ${i + 1} must not be limited`);
      } else {
        saw429 = true;
        assert.equal(res.status, 429);
        assert.ok(res.headers.get('retry-after'));
      }
    }
    assert.equal(saw429, true, 'the 11th login must be rejected');
  } finally {
    await close();
  }
});