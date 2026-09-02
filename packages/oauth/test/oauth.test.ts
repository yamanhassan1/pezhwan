import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GoogleProvider,
  GitHubProvider,
  ProviderRegistry,
  type OAuthProviderAdapter,
} from '@pezhwan/oauth';

const GOOGLE = {
  clientId: 'test-google',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:3000/cb',
};

const GITHUB = {
  clientId: 'test-github',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:3000/cb',
};

test('Google provider builds a valid authorization URL', () => {
  const provider = new GoogleProvider(GOOGLE);
  const url = provider.buildAuthorizationUrl({
    clientId: GOOGLE.clientId,
    redirectUri: GOOGLE.redirectUri,
    state: 'abc',
    nonce: 'n1',
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(parsed.searchParams.get('client_id'), 'test-google');
  assert.equal(parsed.searchParams.get('state'), 'abc');
  assert.equal(parsed.searchParams.get('nonce'), 'n1');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
});

test('Google provider decodes an id_token payload without touching the network', async () => {
  const provider = new GoogleProvider(GOOGLE);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-1', email: 'a@b.com', email_verified: true, name: 'A' }),
  ).toString('base64url');
  const idToken = `${header}.${payload}.sig`;
  const profile = await provider.getProfile('unused', idToken);
  assert.equal(profile.subject, 'user-1');
  assert.equal(profile.email, 'a@b.com');
  assert.equal(profile.emailVerified, true);
});

test('GitHub provider buildAuthorizationUrl includes the requested scope', () => {
  const provider = new GitHubProvider(GITHUB);
  const url = provider.buildAuthorizationUrl({
    clientId: GITHUB.clientId,
    redirectUri: GITHUB.redirectUri,
    state: 's1',
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('client_id'), 'test-github');
  assert.equal(parsed.searchParams.get('state'), 's1');
  assert.ok(parsed.searchParams.get('scope')?.includes('read:user'));
});

test('registry rejects duplicate provider names', () => {
  const provider = new GoogleProvider(GOOGLE);
  const registry = new ProviderRegistry([provider]);
  assert.throws(() => registry.register(new GoogleProvider(GOOGLE)), /already registered/);
});

test('registry throws ProviderError for unknown providers', () => {
  const registry = new ProviderRegistry([]);
  assert.throws(
    () => registry.get('unknown'),
    (err: unknown) =>
      err instanceof Error && (err as { code?: string }).code === 'PROVIDER_NOT_CONFIGURED',
  );
});

test('registry round-trips a custom adapter', () => {
  const custom: OAuthProviderAdapter = {
    name: 'acme',
    buildAuthorizationUrl: (p) => `https://acme.example/authorize?state=${encodeURIComponent(p.state)}`,
    exchange: async () => ({ accessToken: 'at' }),
    getProfile: async () => ({ subject: 'sub-1' }),
  };
  const registry = new ProviderRegistry([custom]);
  assert.equal(registry.names().join(','), 'acme');
  assert.equal(registry.get('acme').buildAuthorizationUrl({ state: 'x' }), 'https://acme.example/authorize?state=x');
});