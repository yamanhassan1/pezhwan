import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Pezhwan,
  PezhwanClient,
  createRuntimeClient,
  auth,
  session,
  authorization,
  mfa,
  TokenError,
} from '../index.ts';

const baseConfig = {
  tenantId: 't1',
  applicationId: 'a1',
  issuer: 'https://id.pezhwan.test',
  audience: 'pezhwan.clients',
  otpDelivery: {
    sendEmail: async () => {},
  },
};

function identity(roles: string[] = [], permissions: string[] = []) {
  return {
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles,
    permissions,
    authMethod: 'password' as const,
  };
}

describe('node SDK client', () => {
  it('builds a runtime seeded with a signing key', () => {
    const client = createRuntimeClient(baseConfig);
    assert.ok(client.runtime.store.jwks().length >= 1);
    assert.ok(client.runtime.auth !== undefined);
    assert.ok(client.runtime.metrics !== undefined);
  });

  it('signs and verifies an access token round-trip', () => {
    const client = createRuntimeClient(baseConfig);
    const token = client.runtime.tokens.signAccessToken(identity());
    const decoded = client.runtime.tokens.verifyAccessToken(token);
    assert.equal(decoded.userId, 'u1');
    assert.equal(decoded.tenantId, 't1');
  });

  it('rejects tampered tokens', () => {
    const runtime = Pezhwan(baseConfig);
    const token = runtime.tokens.signAccessToken(identity(['ADMIN'], ['ride:read']));
    const parts = token.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({
        sub: 'u1',
        tenantId: 't1',
        applicationId: 'a1',
        sessionId: 's1',
        roles: ['ADMIN'],
        permissions: ['ride:read'],
        authMethod: 'password',
        kid: '',
        iss: 'https://id.pezhwan.test',
        aud: 'pezhwan.clients',
        iat: 0,
        exp: 9999999999,
        jti: 'x',
      }),
    ).toString('base64url');
    assert.throws(
      () => runtime.tokens.verifyAccessToken(parts.join('.')),
      (err: unknown) => err instanceof TokenError,
    );
  });

  it('exposes per-domain facades over the runtime', () => {
    const client = createRuntimeClient(baseConfig);
    assert.equal(auth(client.runtime), client.runtime.auth);
    assert.equal(session(client.runtime), client.runtime.sessions);
    assert.equal(authorization(client.runtime), client.runtime.authorization);
    assert.equal(mfa(client.runtime), client.runtime.mfa);
  });

  it('keeps the stable facade exports', () => {
    assert.equal(typeof Pezhwan, 'function');
    assert.equal(typeof PezhwanClient, 'object');
  });
});
