/**
 * PEZHWAN — base OAuth provider adapter.
 *
 * Implements the standard redirect + authorization-code exchange flow and
 * leaves profile resolution to subclasses.
 */

import type {
  BuildAuthUrlParams,
  ExchangeParams,
  ExchangeResult,
  OAuthProviderAdapter,
  ProviderProfile,
} from '../adapter.ts';

export interface BaseProviderOptions {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
  extraAuthParams?: Record<string, string>;
}

export abstract class BaseOAuthProvider implements OAuthProviderAdapter {
  abstract readonly name: string;

  constructor(protected readonly options: BaseProviderOptions) {}

  buildAuthorizationUrl(params: BuildAuthUrlParams): string {
    const url = new URL(this.options.authorizeUrl);
    url.searchParams.set('client_id', params.clientId ?? this.options.clientId);
    url.searchParams.set(
      'redirect_uri',
      params.redirectUri ?? this.options.redirectUri,
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'scope',
      params.scope ?? this.options.scope ?? 'openid email profile',
    );
    url.searchParams.set('state', params.state);
    if (params.nonce) {
      url.searchParams.set('nonce', params.nonce);
    }
    for (const [key, value] of Object.entries(this.options.extraAuthParams ?? {})) {
      url.searchParams.set(key, value);
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
    if (params.clientSecret ?? this.options.clientSecret) {
      body.set('client_secret', params.clientSecret ?? this.options.clientSecret ?? '');
    }
    const res = await fetch(this.options.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error('OAuth token exchange failed (' + res.status + ')');
    }
    const json = (await res.json()) as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: json.access_token ?? '',
      idToken: json.id_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      scope: json.scope,
      raw: { ...json },
    };
  }

  abstract getProfile(accessToken: string, idToken?: string): Promise<ProviderProfile>;
}

/** Best-effort decode of a JWT payload (used for id_token claim mapping). */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}
