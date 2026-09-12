/**
 * PEZHWAN — OpenID Connect federation.
 *
 * Performs discovery, drives the authorization-code exchange, and verifies
 * the id_token against the discovered JWKS before releasing any identity.
 */

import { jwkToPem, verifyIdToken, type IdTokenClaims } from '../oidc.service.ts';
import type { SsoProfile } from '@pezhwan/shared';

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  [key: string]: unknown;
}

export interface OidcFederationDeps {
  fetchJson?: (url: string) => Promise<unknown>;
}

interface OidcTokenSet {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export class OidcFederationService {
  constructor(private readonly deps: OidcFederationDeps = {}) {}

  private async getJson(url: string): Promise<Record<string, unknown>> {
    if (this.deps.fetchJson) {
      return (await this.deps.fetchJson(url)) as Record<string, unknown>;
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('OIDC discovery failed (' + res.status + ')');
    }
    return (await res.json()) as Record<string, unknown>;
  }

  async discover(issuer: string): Promise<OidcDiscovery> {
    const base = issuer.replace(/\/+$/, '');
    const doc = await this.getJson(base + '/.well-known/openid-configuration');
    return doc as OidcDiscovery;
  }

  buildAuthorizationUrl(
    discovery: OidcDiscovery,
    options: {
      clientId: string;
      redirectUri: string;
      state: string;
      nonce?: string;
      scope?: string;
    },
  ): string {
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('client_id', options.clientId);
    url.searchParams.set('redirect_uri', options.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', options.scope ?? 'openid email profile');
    url.searchParams.set('state', options.state);
    if (options.nonce) {
      url.searchParams.set('nonce', options.nonce);
    }
    return url.toString();
  }

  async handleCallback(params: {
    discovery: OidcDiscovery;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    code: string;
    nonce?: string;
  }): Promise<{ tokenSet: OidcTokenSet; claims: IdTokenClaims; profile: SsoProfile }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
    });
    if (params.clientSecret) {
      body.set('client_secret', params.clientSecret);
    }
    const res = await fetch(params.discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error('OIDC token exchange failed (' + res.status + ')');
    }
    const tokenSet = (await res.json()) as OidcTokenSet;
    if (!tokenSet.id_token) {
      throw new Error('OIDC token response missing id_token');
    }
    const jwksDoc = (await this.getJson(params.discovery.jwks_uri)) as { keys?: Array<Record<string, unknown>> };
    const keys = jwksDoc.keys ?? [];
    const { header } = await import('../oidc.service.ts').then((m) => m.decodeIdToken(tokenSet.id_token as string));
    const jwk = (keys.find((k) => k.kid === header.kid) ?? keys[0]) as {
  kty: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
};
if (!jwk) {
  throw new Error('No usable key in JWKS');
}
    const pem = jwkToPem(jwk);
    const claims = await verifyIdToken(tokenSet.id_token, {
      issuer: params.discovery.issuer,
      audience: params.clientId,
      nonce: params.nonce,
      jwksProvider: async () => pem,
    });
    const profile: SsoProfile = {
      provider: 'oidc',
      subject: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      emailVerified: Boolean(claims.email_verified),
      name: typeof claims.name === 'string' ? claims.name : undefined,
      picture: typeof claims.picture === 'string' ? claims.picture : undefined,
      raw: { ...claims },
    };
    return { tokenSet, claims, profile };
  }
}
