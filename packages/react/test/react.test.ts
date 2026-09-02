import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PezhwanProvider,
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