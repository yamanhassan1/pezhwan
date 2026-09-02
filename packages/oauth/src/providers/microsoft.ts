/**
 * PEZHWAN — Microsoft Entra (Azure AD) / Microsoft Account provider adapter.
 *
 * OIDC-compliant: the id_token (verified against Microsoft's JWKS by the
 * caller) contains the profile. Supports the "common" tenant and tenanted
 * endpoints.
 */

import type {
  OAuthProviderAdapter,
  BuildAuthUrlParams,
  ExchangeParams,
  ExchangeResult,
  ProviderProfile,
} from '../adapter.ts';

export interface MicrosoftOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  tenant?: string;
  scope?: string;
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf-8');
}

export class MicrosoftProvider implements OAuthProviderAdapter {
  readonly name = 'microsoft';

  private readonly tenant: string;

  constructor(private readonly options: MicrosoftOptions) {
    this.tenant = options.tenant ?? 'common';
  }

  private get authority(): string {
    return `https://login.microsoftonline.com/${this.tenant}`;
  }

  buildAuthorizationUrl(params: BuildAuthUrlParams): string {
    const url = new URL(`${this.authority}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', params.clientId ?? this.options.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri ?? this.options.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scope ?? this.options.scope ?? 'openid email profile offline_access');
    url.searchParams.set('response_mode', 'query');
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
    const res = await fetch(`${this.authority}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft token exchange failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as ExchangeResult & {
      access_token: string;
      id_token?: string;
      refresh_token?: string;
    };
    return {
      accessToken: json.access_token,
      idToken: json.id_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expiresIn,
      scope: json.scope,
      raw: { ...json },
    };
  }

  async getProfile(accessToken: string, idToken?: string): Promise<ProviderProfile> {
    const token = idToken;
    if (token) {
      const payload = token.split('.')[1];
      if (payload) {
        const claims = JSON.parse(b64urlDecode(payload)) as {
          sub?: string;
          email?: string;
          preferred_username?: string;
          name?: string;
          picture?: string;
        };
        return {
          subject: claims.sub ?? '',
          email: claims.email ?? claims.preferred_username,
          emailVerified: true,
          name: claims.name,
          picture: claims.picture,
          raw: claims,
        };
      }
    }
    const res = await fetch('https://graph.microsoft.com/oidc/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Microsoft userinfo failed (${res.status})`);
    }
    const json = (await res.json()) as {
      sub?: string;
      email?: string;
      preferred_username?: string;
      name?: string;
    };
    return {
      subject: json.sub ?? '',
      email: json.email ?? json.preferred_username,
      emailVerified: true,
      name: json.name,
      raw: { ...json },
    };
  }
}