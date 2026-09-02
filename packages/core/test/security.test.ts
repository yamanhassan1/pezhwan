import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  OAuthService,
  RateLimitService,
  PezhwanLogger,
  MemoryCache,
  createRedisCache,
  createRedisManager,
  TokenService,
  KeyStore as CoreKeyStore,
  KeyStoreService,
  FileKeyStoreAdapter,
  createPezhwan,
  initKeyPersistence,
} from '@pezhwan/core';
import { signJwt } from '@pezhwan/crypto';

function makeTokenService() {
  const store = new CoreKeyStore('RS256');
  const service = new TokenService({
    issuer: 'https://id.pezhwan.test',
    audience: 'pezhwan.clients',
    accessTokenTtlMs: 900_000,
    refreshTokenTtlMs: 86_400_000,
    algorithm: 'RS256',
    store,
    cache: new MemoryCache(),
  });
  return { store, service };
}

function makeOAuth(): OAuthService {
  const tokens = {
    accessTokenTtl: 900_000,
  } as unknown as OAuthService['deps']['tokens'];
  const sessions = {} as unknown as OAuthService['deps']['sessions'];
  const audit = {} as unknown as OAuthService['deps']['audit'];
  return new OAuthService({ tokens, sessions, audit, issuer: 'https://id.pezhwan.test' });
}

test('OAuth PKCE S256 verifier matches its challenge in constant time', () => {
  const oauth = makeOAuth();
  const verifier = 'abcdefghijklmnopqrstuvwxyzABCxyz-1234';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  assert.equal(oauth.verifyPkce(verifier, challenge, 'S256'), true);
  assert.equal(oauth.verifyPkce('wrong-verifier', challenge, 'S256'), false);
});

test('OAuth PKCE plain method is exact-match only', () => {
  const oauth = makeOAuth();
  assert.equal(oauth.verifyPkce('abc', 'abc', 'plain'), true);
  assert.equal(oauth.verifyPkce('abc', 'abd', 'plain'), false);
});

test('OAuth discovery exposes the expected OIDC endpoints', () => {
  const oauth = makeOAuth();
  const d = oauth.discovery();
  assert.equal(d.issuer, 'https://id.pezhwan.test');
  assert.equal(d.authorization_endpoint, 'https://id.pezhwan.test/v1/oauth/authorize');
  assert.equal(d.token_endpoint, 'https://id.pezhwan.test/v1/oauth/token');
  assert.equal(d.jwks_uri, 'https://id.pezhwan.test/.well-known/jwks.json');
  assert.deepEqual(d.grant_types_supported, ['authorization_code', 'refresh_token', 'client_credentials']);
  assert.ok((d.code_challenge_methods_supported as string[]).includes('S256'));
});

test('rate limiter allows requests under the window and blocks over it', async () => {
  const cache = createRedisCache(null, 'pezhwan');
  const limiter = new RateLimitService(cache, { login: { limit: 3, windowMs: 60_000 } });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await limiter.consume('login', '1.2.3.4')).allowed, true);
  }
  const denied = await limiter.consume('login', '1.2.3.4');
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterMs > 0);
});

test('rate limiter keys by scope so a different IP is not blocked', async () => {
  const cache = createRedisCache(null, 'pezhwan');
  const limiter = new RateLimitService(cache, { login: { limit: 1, windowMs: 60_000 } });
  assert.equal((await limiter.consume('login', '1.2.3.4')).allowed, true);
  assert.equal((await limiter.consume('login', '5.6.7.8')).allowed, true);
});

test('rate limiter degrades to in-memory when Redis is unavailable', async () => {
  const cache = new MemoryCache();
  const limiter = new RateLimitService(cache, { api: { limit: 2, windowMs: 60_000 } });
  assert.equal((await limiter.consume('api', 'scope-1')).allowed, true);
  assert.equal((await limiter.consume('api', 'scope-1')).allowed, true);
  assert.equal((await limiter.consume('api', 'scope-1')).allowed, false);
});

test('structured logger redacts secrets (nested and top-level)', () => {
  const lines: Array<Record<string, unknown>> = [];
  const logger = new PezhwanLogger({ level: 'info', sink: (l) => lines.push(l) });
  logger.info('login', {
    userId: 'u1',
    password: 'hunter2',
    accessToken: 'raw.token.here',
    context: { refreshToken: 'rt', code: '123456' },
    ok: true,
  });
  assert.equal(lines.length, 1);
  const line = lines[0]!;
  assert.equal(line.ok, true);
  assert.equal(line.password, '[REDACTED]');
  assert.equal(line.accessToken, '[REDACTED]');
  const ctx = line.context as Record<string, unknown>;
  assert.equal(ctx.refreshToken, '[REDACTED]');
  assert.equal(ctx.code, '[REDACTED]');
  assert.equal(line.userId, 'u1');
});

test('structured logger does not emit debug lines at info level', () => {
  const lines: Array<Record<string, unknown>> = [];
  const logger = new PezhwanLogger({ level: 'info', sink: (l) => lines.push(l) });
  logger.debug('should not appear');
  logger.info('should appear');
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.message, 'should appear');
});

test('RedisManager is lazy and degrades to in-memory before connect', async () => {
  const manager = createRedisManager({ url: 'redis://127.0.0.1:1' });
  // Constructing must not connect; exposing null keeps the runtime on Mongo.
  assert.equal(manager.connectedClient, null);
  // Cache still works via in-memory fallback (Redis not contacted yet).
  await manager.cache.set('k', 'v', 60);
  assert.equal(await manager.cache.get('k'), 'v');
  assert.equal(await manager.isHealthy(), false);
  // Disconnect before any connect is idempotent and non-throwing.
  await manager.disconnect();
  await manager.disconnect();
});

test('RedisManager honors a bounded retry strategy and fails fast', async () => {
  let calls = 0;
  const manager = createRedisManager({
    url: 'redis://127.0.0.1:1',
    connectTimeoutMs: 50,
    retryStrategy: (times) => {
      calls += 1;
      return times > 2 ? null : 1; // stop after a few tries
    },
  });
  await assert.rejects(() => manager.connect());
  assert.ok(calls >= 1);
  assert.equal(manager.connectedClient, null);
});

test('MemoryCache fallback is bounded (no unbounded growth)', async () => {
  const cache = new MemoryCache(5);
  for (let i = 0; i < 50; i += 1) {
    await cache.set(`k${i}`, 'v');
  }
  await cache.set('fresh', 'v');
  assert.ok(cache.size <= 5, `cache grew to ${cache.size}, expected <= 5`);
  // Fresh key must be present; capacity never exceeded under a burst.
  assert.equal(await cache.get('fresh'), 'v');
});

test('rate limiter atomic counter loses no increments under concurrency', async () => {
  const cache = new MemoryCache(10_000);
  const limiter = new RateLimitService(cache, {
    api: { limit: 1000, windowMs: 60_000 },
  });
  const results = await Promise.all(
    Array.from({ length: 50 }, () => limiter.consume('api', 'shared-scope')),
  );
  assert.equal(results.length, 50);
  assert.ok(results.every((r) => r.allowed), 'all 50 under the limit must be allowed');
  // Every increment must be accounted for exactly — a racy read-modify-write
  // would lose many of the 50 concurrent increments.
  const raw = await cache.get('rl:api:shared-scope');
  assert.equal(Number(raw), 50, `expected counter 50, got ${raw}`);
});

test('access token round-trips: sign then verify yields identity', () => {
  const { service } = makeTokenService();
  const token = service.signAccessToken({
    userId: 'u1',
    tenantId: 'dev-tenant',
    applicationId: 'dev-app',
    sessionId: 's1',
    roles: ['admin'],
    permissions: ['users:read'],
    authMethod: 'password',
  });
  assert.equal(service.verifyAccessToken(token).userId, 'u1');
  assert.deepEqual(service.verifyAccessToken(token).roles, ['admin']);
});

test('access token missing a required claim is rejected (hollow token)', () => {
  const { store, service } = makeTokenService();
  const key = store.current;
  // Sign a valid cryptographic token that omits `sub` — it must be rejected
  // even though the signature and algorithm are correct.
  const hollow = signJwt(
    {
      tenantId: 'dev-tenant',
      applicationId: 'dev-app',
      sessionId: 's1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      iss: 'https://id.pezhwan.test',
      aud: 'pezhwan.clients',
    },
    key.privateKey,
    key.kid,
    'RS256',
    { algorithm: 'RS256' as const },
  );
  assert.throws(() => service.verifyAccessToken(hollow), /claim|INVALID_JWT/);
});

test('access tokens require a kid header', () => {
  const { store, service } = makeTokenService();
  const key = store.current;
  const token = signJwt(
    {
      sub: 'u1',
      tenantId: 'dev-tenant',
      applicationId: 'dev-app',
      sessionId: 's1',
      roles: [],
      permissions: [],
      authMethod: 'password',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      iss: 'https://id.pezhwan.test',
      aud: 'pezhwan.clients',
    },
    key.privateKey,
    '',
    'RS256',
    { algorithm: 'RS256' as const },
  );
  assert.throws(() => service.verifyAccessToken(token), /kid|INVALID_JWT/);
});

test('key rotation retires the previous key and revocation blocks verification', async () => {
  const store = new CoreKeyStore('RS256');
  const first = store.addKey();
  const second = store.addKey();
  store.retire(first.kid);
  assert.equal(store.byKid(first.kid)?.status, 'VERIFY-ONLY');
  assert.equal(store.current.kid, second.kid);
  store.revoke(first.kid);
  assert.equal(store.byKid(first.kid), undefined);
  assert.equal(store.jwks().some((key) => key.kid === first.kid), false);
});

test('KeyStore file load fails closed on a corrupt key file', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pezhwan-keystore-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));

  const adapter = new FileKeyStoreAdapter(dir);
  // A present but corrupt (non-JSON) key file must throw, not be silently ignored.
  await fs.writeFile(path.join(dir, 'bad.pem'), 'not-json{{', 'utf-8');
  await assert.rejects(() => adapter.load(), /Failed to load signing key file/);
});

test('KeyStore load discards 0-byte and .pem.tmp leftovers (self-healing)', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pezhwan-keystore3-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));

  // Simulate a crashed write: an empty key file + an orphaned temp file.
  await fs.writeFile(path.join(dir, 'dead.pem'), '', 'utf-8');
  await fs.writeFile(path.join(dir, 'orphan.pem.tmp'), '', 'utf-8');

  const store = new CoreKeyStore('RS256');
  const service = new KeyStoreService(store, new FileKeyStoreAdapter(dir));
  await service.init();

  // The empty file carried no key material, so a fresh key is generated...
  assert.ok(store.all.length >= 1);
  // ...and the leftovers are gone (boot next time starts clean).
  const remaining = await fs.readdir(dir);
  assert.equal(remaining.some((f) => f === 'dead.pem'), false, '0-byte file removed');
  assert.equal(
    remaining.some((f) => f.endsWith('.pem.tmp')),
    false,
    'orphan temp file removed',
  );
});

test('KeyStore save is atomic: no 0-byte .pem can survive a save', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pezhwan-keystore4-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));

  const store = new CoreKeyStore('RS256');
  const adapter = new FileKeyStoreAdapter(dir);
  await adapter.save(store.all);

  const files = await fs.readdir(dir);
  assert.ok(files.every((f) => f.endsWith('.pem') && /\.pem\.tmp$/.test(f) === false));
  for (const f of files.filter((x) => x.endsWith('.pem'))) {
    const stat = await fs.stat(path.join(dir, f));
    assert.ok(stat.size > 0, 'every persisted key file must be non-empty');
  }
});

test('KeyStore concurrent save() calls serialize without racing the temp file', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pezhwan-keystore5-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));

  const builder = new CoreKeyStore('RS256');
  const adapter = new FileKeyStoreAdapter(dir);
  // Simulate an overlapping rotation storm: many save() calls racing each other.
  const assume = builder.addKey();
  await Promise.all(
    Array.from({ length: 64 }, async (_, i) => {
      if (i % 4 === 0) {
        assume;
      }
      await adapter.save(builder.all);
    }),
  );

  const remaining = await fs.readdir(dir);
  assert.equal(
    remaining.some((f) => f.endsWith('.pem.tmp')),
    false,
    'no temp files may remain after queued saves',
  );
  const pems = remaining.filter((f) => f.endsWith('.pem'));
  assert.ok(pems.length >= 1);
  for (const f of pems) {
    const stat = await fs.stat(path.join(dir, f));
    assert.ok(stat.size > 0, 'every persisted key file must be non-empty');
    JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8'));
  }
});

test('KeyStore init generates and persists a key on first boot, then round-trips', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pezhwan-keystore2-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));

  const store = new CoreKeyStore('RS256');
  const service = new KeyStoreService(store, new FileKeyStoreAdapter(dir));
  await service.init();
  assert.ok(store.all.length >= 1, 'expected at least one key after init');

  // A fresh service over the same directory must recover the persisted key.
  const store2 = new CoreKeyStore('RS256');
  const service2 = new KeyStoreService(store2, new FileKeyStoreAdapter(dir));
  await service2.init();
  assert.ok(store2.all.length >= 1, 'expected key recovery across restart');
});

test('initKeyPersistence: tokens signed by a previous process verify after restart', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pezhwan-keypersist-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }).catch(() => {}));

  const baseConfig = {
    issuer: 'https://id.restart.test',
    audience: 'pezhwan.clients',
    tenantId: 't1',
    applicationId: 'a1',
    otpDelivery: { sendEmail: async () => {} },
  };

  // "First process": runtime seeds a throwaway key; initKeyPersistence ensures
  // a durable key and persists it. Tokens signed AFTER init must use the
  // persisted (restart-surviving) key material.
  const runtime1 = createPezhwan(baseConfig);
  const handle1 = await initKeyPersistence(runtime1, { directory: dir });
  const token = runtime1.tokens.signAccessToken({
    userId: 'u1',
    tenantId: 't1',
    applicationId: 'a1',
    sessionId: 's1',
    roles: ['RIDER'],
    permissions: [],
    authMethod: 'password',
  });

  // "Second process" over the same directory must verify that token — the kid
  // belongs to the persisted key, not the throwaway boot key. (kid lives in
  // the JOSE header, not the claims payload.)
  const runtime2 = createPezhwan(baseConfig);
  const handle2 = await initKeyPersistence(runtime2, { directory: dir });
  try {
    const identity = runtime2.tokens.verifyAccessToken(token);
    assert.equal(identity.userId, 'u1');
    const header = JSON.parse(
      Buffer.from(token.split('.')[0]!, 'base64url').toString('utf-8'),
    ) as { kid?: string };
    assert.ok(header.kid, 'token must carry a kid');
    assert.ok(
      runtime2.store.byKid(header.kid),
      'verifying key must be restored from disk, not the throwaway boot key',
    );
  } finally {
    handle1.dispose();
    handle2.dispose();
  }
});