import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pezhwan, useAuth, useMFA, useSession, LoginForm, RegisterForm } from '@pezhwan/vue';

test('vue SDK exposes the plugin, composables and components', () => {
  assert.equal(typeof pezhwan, 'object');
  assert.equal(typeof pezhwan.install, 'function');
  assert.equal(typeof useAuth, 'function');
  assert.equal(typeof useMFA, 'function');
  assert.equal(typeof useSession, 'function');
  assert.equal(typeof LoginForm, 'object');
  assert.equal(typeof RegisterForm, 'object');
});
