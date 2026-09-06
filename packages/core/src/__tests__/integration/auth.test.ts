/**
 * PEZHWAN — Auth integration test.
 *
 * Excerpts the real token pipeline (KeyStore → TokenService → AccountState →
 * AuthMiddleware) to verify end-to-end bearer validation without a database:
 * account state is served from a pre-seeded in-memory cache the same way the
 * runtime would serve a warm cache.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KeyStore } from '@pezhwan/crypto';
import {
  AccountStateService,
  AuthMiddleware,
  KeyStoreService,
  MemoryCache,
  MemoryKeyStoreAdapter,
  TokenService,
} from '@pezhwan/core';

import { fixtureUser } from '../fixtures/users.ts';

function buildStack() {
  const keyStore = new KeyStore('RS256');
  new KeyStoreService(keyStore, new MemoryKeyStoreAdapter());
  keyStore.addKey();

  const cache = new MemoryCache();
  const tokens = new TokenService({
    issuer: 'http://test.issuer',
    audience: 'pezhwan.clients',
    accessTokenTtlMs: 900_000,
    refreshTokenTtlMs: 2_592_000_000,
    algorithm: 'RS256',
    store: keyStore,
    cache,
  });
  const accountState = new AccountStateService(cache);
  const middleware = new AuthMiddleware(tokens, accountState);
  return { tokens, cache, middleware };
}

function seedAccountState(cache: MemoryCache, userId: string, state: Record<string, boolean>): Promise<void> {
  return cache.set(`accountState:${userId}`, JSON.stringify(state), 30);
}

test('access token minted by the runtime verifies through auth middleware', async () => {
  const user = fixtureUser();
  const userId = String(user._id);
  const { tokens, cache, middleware } = buildStack();
  await seedAccountState(cache, userId, {
    exists: true,
    isActive: true,
    tokenVersionMatch: true,
  });

  const token = tokens.signAccessToken({
    userId,
    tenantId: user.tenantId,
    applicationId: '000000000000000000000002',
    sessionId: 'session-1',
    roles: ['ADMIN'],
    permissions: ['users:read'],
    authMethod: 'password',
    tokenVersion: 1,
  });

  const context = await middleware.verify(`Bearer ${token}`);
  assert.equal(context.userId, userId);
  assert.equal(context.tenantId, user.tenantId);
  assert.equal(context.sessionId, 'session-1');
  assert.deepEqual(context.roles, ['ADMIN']);
  assert.deepEqual(context.permissions, ['users:read']);
});

test('a token minted before account revocation is rejected', async () => {
  const user = fixtureUser();
  const userId = String(user._id);
  const { tokens, cache, middleware } = buildStack();
  await seedAccountState(cache, userId, {
    exists: true,
    isActive: true,
    tokenVersionMatch: false,
  });

  const token = tokens.signAccessToken({
    userId,
    tenantId: user.tenantId,
    applicationId: '000000000000000000000002',
    sessionId: 'session-2',
    roles: [],
    permissions: [],
    authMethod: 'password',
    tokenVersion: 0,
  });

  await assert.rejects(middleware.verify(`Bearer ${token}`), /revoked/i);
});

test('missing or malformed bearer tokens are rejected before lookup', async () => {
  const { middleware } = buildStack();
  await assert.rejects(middleware.verify(undefined), /missing bearer token/i);
  await assert.rejects(middleware.verify('not-a-bearer'), /missing bearer token/i);
  await assert.rejects(middleware.verify('Bearer  '), (error: unknown) =>
    error instanceof Error && /JWT|jwt|invalid|malformed/i.test(error.message),
  );
});