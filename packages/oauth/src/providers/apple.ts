/**
 * PEZHWAN — Apple provider adapter.
 *
 * Sign in with Apple uses form-post + authorization-code exchange. The user's
 * email is only returned on the FIRST authorization (or if they consent);
 * otherwise the subject (sub) is the stable identifier. The id_token signature
 * must be verified by the caller against Apple's JWKS.
 */

import type {
  OAuthProviderAdapter,
  BuildAuthUrlParams,
  ExchangeParams,
  ExchangeResult,
  ProviderProfile,
} from '../adapter.ts';

const AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf-8');
}

export interface AppleOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
}

export class AppleProvider implements OAuthProviderAdapter {
  readonly name = 'apple';

  constructor(private readonly options: AppleOptions) {}

  buildAuthorizationUrl(params: BuildAuthUrlParams): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', params.clientId ?? this.options.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri ?? this.options.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', (params.scope ?? this.options.scope ?? 'name email').replace(/,/g, ' '));
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('state', params.state);
    if (params.nonce) {
      url.searchParams.set('nonce', params.nonce);
    }
    return url.toString();
  }

  async exchange(params: ExchangeParams): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      code: params.code,
      client_id: params.clientId ?? this.options.clientId,
      redirect_uri: params.redirectUri ?? this.options.redirectUri,
      grant_type: 'authorization_code',
    });
    const secret = params.clientSecret ?? this.options.clientSecret;
    if (secret) {
      body.set('client_secret', secret);
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apple token exchange failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as ExchangeResult & { access_token: string; id_token?: string; refresh_token?: string };
    return {
      accessToken: json.access_token,
      idToken: json.id_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expiresIn,
      raw: { ...json },
    };
  }

  async getProfile(accessToken: string, idToken?: string): Promise<ProviderProfile> {
    // Apple returns the profile only in the id_token (first-time auth).
    const token = idToken;
    if (token) {
      const payload = token.split('.')[1];
      if (payload) {
        const claims = JSON.parse(b64urlDecode(payload)) as {
          sub?: string;
          email?: string;
          email_verified?: boolean;
        };
        return {
          subject: claims.sub ?? '',
          email: claims.email,
          emailVerified: Boolean(claims.email_verified),
          raw: claims,
        };
      }
    }
    void accessToken;
    throw new Error('Apple requires an id_token to resolve the profile');
  }
}