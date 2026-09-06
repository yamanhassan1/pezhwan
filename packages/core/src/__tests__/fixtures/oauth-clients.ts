/**
 * PEZHWAN — OAuth client fixtures for integration tests.
 *
 * Shapes follow the canonical OAuthClientDoc (see models/oauthClient.model.ts).
 */

import type { OAuthClientDoc } from '../../models/oauthClient.model.ts';

export const OAUTH_CLIENT_ID = 'client_spa_demo';
export const PKCE_S256_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
export const PKCE_S256_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

export function fixtureOAuthClient(overrides: Partial<OAuthClientDoc> = {}): OAuthClientDoc {
  return {
    _id: '000000000000000000000201' as unknown as OAuthClientDoc['_id'],
    tenantId: '000000000000000000000001',
    applicationId: '000000000000000000000002',
    name: 'Demo SPA',
    clientId: OAUTH_CLIENT_ID,
    clientSecretHash: null,
    redirectUris: ['http://localhost:3000/callback'],
    grants: ['authorization_code', 'refresh_token'],
    pkceMethods: ['S256'],
    scopes: ['openid', 'profile', 'email'],
    isActive: true,
    isConfidential: false,
    tokenEndpointAuthMethod: 'none',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export const OAUTH_CLIENTS = [fixtureOAuthClient()] as const;