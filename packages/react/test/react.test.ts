import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PezhwanProvider,
  PezhwanApiError,
  useAuth,
  useSession,
  useAuthorization,
  ProtectedRoute,
  RequireRole,
  RequirePermission,
} from '@pezhwan/react';

test('react SDK exports provider, hooks, and guards', () => {
  assert.equal(typeof PezhwanProvider, 'function');
  assert.equal(typeof useAuth, 'function');
  assert.equal(typeof useSession, 'function');
  assert.equal(typeof useAuthorization, 'function');
  assert.equal(typeof ProtectedRoute, 'function');
  assert.equal(typeof RequireRole, 'function');
  assert.equal(typeof RequirePermission, 'function');
});

test('PezhwanApiError surfaces the server error code and status', () => {
  const err = new PezhwanApiError(
    { code: 'SESSION_CONTEXT_INVALID', message: 'Session context is invalid' },
    401,
  );
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'PezhwanApiError');
  assert.equal(err.code, 'SESSION_CONTEXT_INVALID');
  assert.equal(err.status, 401);
  assert.equal(err.message, 'Session context is invalid');
});