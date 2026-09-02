import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PezhwanError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
  TokenError,
  SessionError,
  ConfigurationError,
  DEFAULT_TTL,
  AUDIT_EVENT,
} from '@pezhwan/shared';

test('error classes carry stable code/status/message', () => {
  const auth = new AuthenticationError();
  assert.equal(auth.status, 401);
  assert.equal(auth.code, 'AUTHENTICATION_FAILED');

  const authz = new AuthorizationError();
  assert.equal(authz.status, 403);

  const rate = new RateLimitError('too fast', 42);
  assert.equal(rate.status, 429);
  assert.equal(rate.retryAfterSeconds, 42);

  const cfg = new ConfigurationError('bad', 'INVALID_CONFIGURATION', {
    details: { k: 1 },
  });
  assert.equal(cfg.status, 500);
  assert.deepEqual(cfg.details, { k: 1 });
});

test('PezhwanError is the base of all errors', () => {
  assert.ok(new TokenError() instanceof PezhwanError);
  assert.ok(new SessionError() instanceof PezhwanError);
  assert.ok(new ValidationError() instanceof PezhwanError);
});

test('constants expose default TTL windows', () => {
  assert.equal(DEFAULT_TTL.ACCESS_TOKEN_MS, 900_000);
  assert.equal(typeof AUDIT_EVENT.LOGIN_SUCCESS, 'string');
});