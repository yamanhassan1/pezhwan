import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  useAuth,
  useSession,
  useAuthorization,
  useMFA,
  usePasswordless,
  useSSO,
  useTenant,
  useWebAuthn,
} from '@pezhwan/react';

test('auth-family hooks are exported functions', () => {
  assert.equal(typeof useAuth, 'function');
  assert.equal(typeof useSession, 'function');
  assert.equal(typeof useAuthorization, 'function');
});

test('standalone hooks expose the documented method sets', () => {
  assert.equal(typeof useMFA, 'function');
  assert.equal(typeof usePasswordless, 'function');
  assert.equal(typeof useSSO, 'function');
  assert.equal(typeof useTenant, 'function');
  assert.equal(typeof useWebAuthn, 'function');
});