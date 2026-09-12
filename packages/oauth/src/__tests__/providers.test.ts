import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderRegistry } from '@pezhwan/oauth';
import { GoogleProvider } from '@pezhwan/oauth';
import { FacebookProvider } from '@pezhwan/oauth';
import { CustomProvider } from '@pezhwan/oauth';
import { ProviderError } from '@pezhwan/shared';
import type { ProviderProfile } from '@pezhwan/oauth';

describe('provider registry', () => {
  it('registers and resolves providers by name', () => {
    const registry = new ProviderRegistry([
      new GoogleProvider({
        clientId: 'gid',
        redirectUri: 'http://localhost/cb',
      }),
    ]);
    assert.ok(registry.has('google'));
    assert.equal(registry.names()[0], 'google');
    assert.ok(registry.get('google') instanceof GoogleProvider);
  });

  it('throws ProviderError for unknown providers', () => {
    const registry = new ProviderRegistry();
    assert.throws(
      () => registry.get('missing'),
      (err: unknown) => err instanceof ProviderError,
    );
  });
});

describe('GoogleProvider URL building', () => {
  it('builds an authorization URL with required params', () => {
    const provider = new GoogleProvider({
      clientId: 'gid',
      redirectUri: 'http://localhost/cb',
    });
    const url = provider.buildAuthorizationUrl({
      clientId: 'gid',
      redirectUri: 'http://localhost/cb',
      state: 'st-123',
      scope: 'openid email',
    });
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'accounts.google.com');
    assert.equal(parsed.searchParams.get('client_id'), 'gid');
    assert.equal(parsed.searchParams.get('state'), 'st-123');
    assert.equal(parsed.searchParams.get('response_type'), 'code');
  });
});

describe('FacebookProvider', () => {
  it('points at the Facebook dialog endpoint', () => {
    const provider = new FacebookProvider({
      clientId: 'fbid',
      redirectUri: 'http://localhost/cb',
    });
    assert.equal(provider.name, 'facebook');
    const url = new URL(
      provider.buildAuthorizationUrl({
        clientId: 'fbid',
        redirectUri: 'http://localhost/cb',
        state: 's',
      }),
    );
    assert.ok(url.pathname.includes('dialog/oauth'));
    assert.equal(url.searchParams.get('scope'), 'email public_profile');
  });
});

describe('CustomProvider', () => {
  it('uses an injected profile resolver', async () => {
    const provider = new CustomProvider({
      name: 'enterprise',
      authorizeUrl: 'https://idp.example.com/authorize',
      tokenUrl: 'https://idp.example.com/token',
      clientId: 'c',
      redirectUri: 'http://localhost/cb',
      profileResolver: async (): Promise<ProviderProfile> => ({
        subject: 'emp-1',
        email: 'emp@example.com',
        emailVerified: true,
      }),
    });
    const profile = await provider.getProfile('tok');
    assert.equal(profile.subject, 'emp-1');
    assert.equal(profile.email, 'emp@example.com');
  });

  it('maps id_token claims when no resolver is supplied', async () => {
    const provider = new CustomProvider({
      name: 'enterprise',
      authorizeUrl: 'https://idp.example.com/authorize',
      tokenUrl: 'https://idp.example.com/token',
      clientId: 'c',
      redirectUri: 'http://localhost/cb',
    });
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 's1', email: 'u@example.com', email_verified: true, name: 'U' }),
    ).toString('base64url');
    const profile = await provider.getProfile('tok', header + '.' + payload + '.sig');
    assert.equal(profile.subject, 's1');
    assert.equal(profile.email, 'u@example.com');
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.name, 'U');
  });
});

describe('base provider token exchange', () => {
  it('extracts tokens from the token endpoint response', async () => {
    const provider = new CustomProvider({
      name: 'enterprise',
      authorizeUrl: 'https://idp.example.com/authorize',
      tokenUrl: 'https://idp.example.com/token',
      clientId: 'c',
      redirectUri: 'http://localhost/cb',
    });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          access_token: 'access-token-1',
          expires_in: 3600,
          scope: 'email',
        }),
      })) as unknown as typeof fetch;
      const result = await provider.exchange({
        clientId: 'c',
        redirectUri: 'http://localhost/cb',
        code: 'auth-code',
      });
      assert.equal(result.accessToken, 'access-token-1');
      assert.equal(result.expiresIn, 3600);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
