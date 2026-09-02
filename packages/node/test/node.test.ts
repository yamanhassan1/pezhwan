import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pezhwan, PezhwanClient, FileKeyStoreAdapter, MemoryKeyStoreAdapter, TokenError } from '@pezhwan/node';

const baseConfig = {
  tenantId: 't1',
  applicationId: 'a1',
  issuer: 'https://id.pezhwan.test',
  audience: 'pezhwan.clients',
  otpDelivery: {
    sendEmail: async () => {},
  },
};

test('node SDK builds a runtime with jwks-seeded keystore', () => {
  const runtime = Pezhwan(baseConfig);
  assert.ok(runtime.store.jwks().length >= 1);
});

test('node SDK signs and verifies an access token round-trip', () => {
  const runtime = Pezhwan(baseConfig);
  const identity = {
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles: [],
    permissions: [],
    authMethod: 'password' as const,
  };
  const token = runtime.tokens.signAccessToken(identity);
  const decoded = runtime.tokens.verifyAccessToken(token);
  assert.equal(decoded.userId, 'u1');
  assert.equal(decoded.tenantId, 't1');
});

test('node SDK rejects a tampered access token', () => {
  const runtime = Pezhwan(baseConfig);
  const identity = {
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles: ['ADMIN'],
    permissions: ['ride:read'],
    authMethod: 'password' as const,
  };
  const token = runtime.tokens.signAccessToken(identity);
  const parts = token.split('.');
  parts[1] = Buffer.from(
    JSON.stringify({ sub: 'u1', tenantId: 't1', applicationId: 'a1', sessionId: 's1', roles: ['ADMIN'], permissions: ['ride:read'], authMethod: 'password', kid: '', iss: 'https://id.pezhwan.test', aud: 'pezhwan.clients', iat: 0, exp: 9999999999, jti: 'x' }),
  ).toString('base64url');
  const tampered = parts.join('.');
  assert.throws(
    () => runtime.tokens.verifyAccessToken(tampered),
    (err: unknown) => err instanceof TokenError,
  );
});

test('node SDK rejects a wrong-signature token', () => {
  const runtime = Pezhwan(baseConfig);
  const otherRuntime = Pezhwan(baseConfig);
  const identity = {
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles: [],
    permissions: [],
    authMethod: 'password' as const,
  };
  const token = otherRuntime.tokens.signAccessToken(identity);
  assert.throws(() => runtime.tokens.verifyAccessToken(token));
});

test('imports are stable and errors re-export from node SDK', () => {
  assert.equal(typeof PezhwanClient, 'object');
  assert.equal(typeof FileKeyStoreAdapter, 'function');
  assert.equal(typeof MemoryKeyStoreAdapter, 'function');
});