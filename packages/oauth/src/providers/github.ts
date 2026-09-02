/**
 * PEZHWAN — GitHub provider adapter.
 *
 * GitHub is OAuth2 (not OIDC): no id_token, profile fetched from the /user
 * endpoint. Emails are fetched separately and only when the user grants
 * `user:email` scope.
 */

import type {
  OAuthProviderAdapter,
  BuildAuthUrlParams,
  ExchangeParams,
  ExchangeResult,
  ProviderProfile,
} from '../adapter.ts';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';

export interface GitHubOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
}

export class GitHubProvider implements OAuthProviderAdapter {
  readonly name = 'github';

  constructor(private readonly options: GitHubOptions) {}

  buildAuthorizationUrl(params: BuildAuthUrlParams): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', params.clientId ?? this.options.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri ?? this.options.redirectUri);
    url.searchParams.set('scope', params.scope ?? this.options.scope ?? 'read:user user:email');
    url.searchParams.set('state', params.state);
    return url.toString();
  }

  async exchange(params: ExchangeParams): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      code: params.code,
      client_id: params.clientId ?? this.options.clientId,
      redirect_uri: params.redirectUri ?? this.options.redirectUri,
    });
    const secret = params.clientSecret ?? this.options.clientSecret;
    if (secret) {
      body.set('client_secret', secret);
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`GitHub token exchange failed (${res.status})`);
    }
    const json = (await res.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) {
      throw new Error('GitHub token exchange returned no access_token');
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      scope: json.scope,
      raw: json,
    };
  }

  async getProfile(accessToken: string): Promise<ProviderProfile> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'pezhwan',
      Accept: 'application/vnd.github+json',
    };
    const userRes = await fetch(USER_URL, { headers });
    if (!userRes.ok) {
      throw new Error(`GitHub userinfo failed (${userRes.status})`);
    }
    const user = (await userRes.json()) as {
      id?: number;
      login?: string;
      name?: string;
      avatar_url?: string;
      email?: string;
    };

    // Best-effort verified email.
    let email = user.email;
    let emailVerified = false;
    try {
      const emailRes = await fetch(EMAILS_URL, { headers });
      if (emailRes.ok) {
        const emails = (await emailRes.json()) as Array<{
          email?: string;
          verified?: boolean;
          primary?: boolean;
        }>;
        const primary = emails.find((e) => e.primary);
        email = primary?.email ?? emails[0]?.email ?? email;
        emailVerified = Boolean(primary?.verified ?? emails[0]?.verified);
      }
    } catch {
      // Ignore — email is best-effort.
    }

    return {
      subject: String(user.id ?? user.login ?? ''),
      email,
      emailVerified,
      name: user.name ?? user.login,
      picture: user.avatar_url,
      raw: user,
    };
  }
}