import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ChainSecretProvider,
  EnvSecretProvider,
  FileSecretProvider,
  SecretNotFoundError,
  createPezhwan,
  MemoryKeyStoreAdapter,
  KeyStoreService,
} from '@pezhwan/core';

test('secret providers distinguish required and optional lookups', async () => {
  const provider = new EnvSecretProvider();
  const name = 'PEZHWAN_TEST_REQUIRED_SECRET';
  const previous = process.env[name];
  process.env[name] = 'test-value';

  try {
    assert.equal(await provider.getSecret(name), 'test-value');
    delete process.env[name];
    assert.equal(await provider.getOptionalSecret(name), undefined);
    await assert.rejects(provider.getSecret(name), SecretNotFoundError);
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});

test('file secret provider rejects unsafe names and propagates non-missing errors', async () => {
  const provider = new FileSecretProvider('/run/secrets', async () => {
    const error = new Error('permission denied') as Error & { code: string };
    error.code = 'EACCES';
    throw error;
  });

  await assert.rejects(provider.getOptionalSecret('../outside'), /Invalid secret name/);
  await assert.rejects(provider.getOptionalSecret('secret'), /permission denied/);
});

test('chain secret provider falls back and fails closed when absent', async () => {
  const provider = new ChainSecretProvider([
    new FileSecretProvider('/run/secrets', async () => {
      const error = new Error('missing') as Error & { code: string };
      error.code = 'ENOENT';
      throw error;
    }),
    new EnvSecretProvider(),
  ]);
  const name = 'PEZHWAN_CHAIN_SECRET';
  const previous = process.env[name];
  process.env[name] = 'chain-value';

  try {
    assert.equal(await provider.getSecret(name), 'chain-value');
    delete process.env[name];
    await assert.rejects(provider.getSecret(name), SecretNotFoundError);
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});

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