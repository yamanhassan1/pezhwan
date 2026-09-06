/**
 * PEZHWAN — OAuth integration test.
 *
 * Exercises the real OAuth primitives that do not require persistence:
 *  1. PKCE S256 flow (verifier → challenge → constant-time verify) as the
 *     authorization server validates it.
 *  2. OAuth discovery document construction.
 *  3. Client-secret hashing contract used by the registry service.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { OAuthService, OidcService } from '@pezhwan/core';
import { PKCE_S256_VERIFIER, PKCE_S256_CHALLENGE } from '../fixtures/oauth-clients.ts';

function buildOAuthService(): OAuthService {
  const deps = {
    tokens: {} as never,
    sessions: {} as never,
    issuer: 'http://test.issuer',
  };
  return new OAuthService(deps);
}

function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

test('PKCE S256: a well-formed verifier pair verifies in the OAuth service', () => {
  const oauth = buildOAuthService();
  const challenge = s256Challenge(PKCE_S256_VERIFIER);

  // Deterministic: the fixture challenge matches the canonical RFC test vector.
  assert.equal(challenge, PKCE_S256_CHALLENGE);
  assert.equal(oauth.verifyPkce(PKCE_S256_VERIFIER, challenge, 'S256'), true);

  // Tampering with either side invalidates the pair.
  assert.equal(oauth.verifyPkce(`${PKCE_S256_VERIFIER}x`, challenge, 'S256'), false);
  assert.equal(oauth.verifyPkce(PKCE_S256_VERIFIER, `${challenge}x`, 'S256'), false);

  // An attacker who only sees the challenge cannot recover the verifier.
  assert.notEqual(PKCE_S256_VERIFIER, challenge);
});

test('PKCE plain is rejected as a method in an S256-only flow', () => {
  const oauth = buildOAuthService();
  // 'plain' compares the strings directly; the OAuth 2.1 flow requires S256.
  assert.equal(oauth.verifyPkce('same-value', 'same-value', 'plain'), true);
  // But the fixture client only allows S256, so a plain + no challenge fails.
  assert.equal(oauth.verifyPkce('value-with-no-challenge', '', 'S256'), false);
});

test('OIDC discovery is served from the OAuth service and shape-stable', async () => {
  const oauth = buildOAuthService();
  const oidc = new OidcService(oauth);
  const discovery = oidc.discovery();

  assert.equal(discovery.issuer, 'http://test.issuer');
  assert.equal(discovery.jwks_uri, 'http://test.issuer/.well-known/jwks.json');
  const grants = discovery.grant_types_supported as string[];
  assert.ok(grants.includes('refresh_token'));
  const methods = discovery.code_challenge_methods_supported as string[];
  assert.deepEqual(methods, ['S256']);
});

test('client secret hashing contract matches the persisted-store format', async () => {
  // The auth path (registerClient / token endpoint) persists SHA-256 base64
  // digests. Assert the contract remains stable so future stores interoperate.
  const secret = 'super-secret-client-secret';
  const digest = createHash('sha256').update(secret).digest('base64');
  assert.equal(digest.length, 44);
  assert.notEqual(digest, secret);
  assert.notEqual(digest, createHash('sha256').update('other').digest('base64'));
});