import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractToken,
  createAuthenticate,
  requireAuth,
  requireRole,
  requirePermission,
} from '@pezhwan/express';
import type { PezhwanRequest } from '@pezhwan/express';
import { createPezhwan, type PezhwanRuntime } from '@pezhwan/core';

function mockRuntime(): PezhwanRuntime {
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

function signedToken(runtime: PezhwanRuntime, roles: string[], permissions: string[]): string {
  return runtime.tokens.signAccessToken({
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles,
    permissions,
    authMethod: 'password',
  });
}

test('extractToken reads Bearer header and cookie', () => {
  assert.equal(extractToken(req({ headers: { authorization: 'Bearer abc' } })), 'abc');
  assert.equal(extractToken(req({ cookies: { pezhwan_access: 'cookie-val' } })), 'cookie-val');
  assert.equal(extractToken(req()), null);
});

test('requireAuth / requireRole / requirePermission gate on identity', () => {
  const runtime = mockRuntime();
  const identity = runtime.tokens.verifyAccessToken(signedToken(runtime, ['ADMIN'], ['user:read']));

  let passed = false;
  requireAuth()(req({ pezhwan: identity }), {} as never, () => (passed = true));
  assert.equal(passed, true);

  let denied: unknown;
  requireAuth()(req(), {} as never, (e) => (denied = e));
  assert.ok(denied instanceof Error);

  passed = false;
  requireRole('ADMIN')(req({ pezhwan: identity }), {} as never, () => (passed = true));
  assert.equal(passed, true);

  denied = undefined;
  requireRole('CAPTAIN')(req({ pezhwan: identity }), {} as never, (e) => (denied = e));
  assert.ok(denied instanceof Error);

  passed = false;
  requirePermission('user:read')(req({ pezhwan: identity }), {} as never, () => (passed = true));
  assert.equal(passed, true);

  denied = undefined;
  requirePermission('ride:create')(req({ pezhwan: identity }), {} as never, (e) => (denied = e));
  assert.ok(denied instanceof Error);
});

test('createAuthenticate fails closed and surfaces 503 when account state cannot be verified', async () => {
  const runtime = mockRuntime();
  const token = signedToken(runtime, [], []);

  let errorOut: unknown;
  await createAuthenticate(runtime)(
    req({ headers: { authorization: `Bearer ${token}` } }) as never,
    {} as never,
    (e) => (errorOut = e ?? null),
  );
  assert.ok(errorOut instanceof Error, 'dependency outage must be forwarded');
  const pe = errorOut as { code?: string; status?: number };
  assert.equal(pe.code, 'FAILED_SECURITY_DEPENDENCY');
  assert.equal(pe.status, 503);
});

test('createAuthenticate lets malformed tokens through unauthenticated', async () => {
  const runtime = mockRuntime();
  let errorOut: unknown = 'not-called';
  await createAuthenticate(runtime)(
    req({ headers: { authorization: 'Bearer not-a-token' } }) as never,
    {} as never,
    (e) => (errorOut = e ?? null),
  );
  assert.equal(errorOut, null, 'invalid token must not forward a dependency error');
});