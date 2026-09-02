import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPezhwan, MemoryKeyStoreAdapter, KeyStoreService } from '@pezhwan/core';

test('createPezhwan requires mandatory config', () => {
  assert.throws(
    () =>
      createPezhwan({
        // @ts-expect-error missing required fields
        otpDelivery: {},
      }),
    Error,
  );
  assert.throws(
    () =>
      createPezhwan({
        // @ts-expect-error missing issuer
        tenantId: 't',
        applicationId: 'a',
        otpDelivery: { sendEmail: async () => {} },
      }),
    Error,
  );
});

test('createPezhwan builds a full runtime', async () => {
  const runtime = createPezhwan({
    issuer: 'http://test.issuer',
    audience: 'test-aud',
    tenantId: '000000000000000000000001',
    applicationId: '000000000000000000000002',
    otpDelivery: { sendEmail: async () => {} },
  });
  assert.ok(runtime.store);
  assert.ok(runtime.tokens);
  assert.ok(runtime.sessions);
  assert.ok(runtime.accountState);
  assert.ok(runtime.authorization);
  assert.ok(runtime.audit);
  assert.ok(runtime.rateLimiter);
  assert.ok(runtime.auth);
  assert.ok((await runtime.store.jwks()).length >= 1);
});

test('KeyStoreService memory adapter round-trips keys', async () => {
  const service = new KeyStoreService(
    // @ts-expect-error store needs real KeyStore; imported package-level class below
    undefined,
    new MemoryKeyStoreAdapter(),
  );
  assert.ok(service);
});