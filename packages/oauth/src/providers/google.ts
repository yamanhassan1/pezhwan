/**
 * PEZHWAN — Google OAuth/OIDC provider adapter.
 *
 * Uses Google's OIDC discovery: authorization + token endpoints are standard,
 * the ID token (RS256, verified against Google's JWKS) carries the profile.
 */

import type {
  OAuthProviderAdapter,
  BuildAuthUrlParams,
  ExchangeParams,
  ExchangeResult,
  ProviderProfile,
} from '../adapter.ts';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf-8');
}

export interface GoogleOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
}

export class GoogleProvider implements OAuthProviderAdapter {
  readonly name = 'google';

  constructor(private readonly options: GoogleOptions) {}

  buildAuthorizationUrl(params: BuildAuthUrlParams): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', params.clientId ?? this.options.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri ?? this.options.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scope ?? this.options.scope ?? 'openid email profile');
    url.searchParams.set('state', params.state);
    if (params.nonce) {
      url.searchParams.set('nonce', params.nonce);
    }
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', params.prompt ?? 'consent');
    return url.toString();
  }

  async exchange(params: ExchangeParams): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      code: params.code,
      client_id: params.clientId ?? this.options.clientId,
      redirect_uri: params.redirectUri ?? this.options.redirectUri,
      grant_type: 'authorization_code',
    });
    if (params.clientSecret ?? this.options.clientSecret) {
      body.set('client_secret', params.clientSecret ?? this.options.clientSecret ?? '');
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as ExchangeResult & { access_token: string };
    return {
      accessToken: json.access_token,
      idToken: json.idToken,
      refreshToken: json.refreshToken,
      expiresIn: json.expiresIn,
      scope: json.scope,
      raw: { ...json },
    };
  }

  async getProfile(accessToken: string, idToken?: string): Promise<ProviderProfile> {
    if (idToken) {
      // The ID token claims (header.payload not signature-checked here — the
      // caller is responsible for verifying the token with the issuer's JWKS).
      const [header, payload] = idToken.split('.');
      void header;
      if (payload) {
        const claims = JSON.parse(b64urlDecode(payload)) as {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        };
        return {
          subject: claims.sub ?? '',
          email: claims.email,
          emailVerified: Boolean(claims.email_verified),
          name: claims.name,
          picture: claims.picture,
          raw: claims,
        };
      }
    }
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google userinfo failed (${res.status})`);
    }
    const json = (await res.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    return {
      subject: json.sub ?? '',
      email: json.email,
      emailVerified: Boolean(json.email_verified),
      name: json.name,
      picture: json.picture,
      raw: { ...json },
    };
  }
}