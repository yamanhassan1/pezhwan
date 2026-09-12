/**
 * PEZHWAN — Facebook OAuth 2.0 provider adapter.
 */

import { BaseOAuthProvider } from './base.provider.ts';
import type { ProviderProfile } from '../adapter.ts';

export interface FacebookOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
  apiVersion?: string;
}

export class FacebookProvider extends BaseOAuthProvider {
  readonly name = 'facebook';

  constructor(options: FacebookOptions) {
    const version = options.apiVersion ?? 'v18.0';
    super({
      authorizeUrl: 'https://www.facebook.com/' + version + '/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/' + version + '/oauth/access_token',
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      redirectUri: options.redirectUri,
      scope: options.scope ?? 'email public_profile',
    });
  }

  async getProfile(accessToken: string, _idToken?: string): Promise<ProviderProfile> {
    const res = await fetch(
      'https://graph.facebook.com/me?fields=id,name,email,picture&access_token=' +
        encodeURIComponent(accessToken),
    );
    if (!res.ok) {
      throw new Error('Facebook userinfo failed (' + res.status + ')');
    }
    const json = (await res.json()) as {
      id?: string;
      name?: string;
      email?: string;
      picture?: { data?: { url?: string } };
    };
    return {
      subject: json.id ?? '',
      email: json.email,
      emailVerified: Boolean(json.email),
      name: json.name,
      picture: json.picture?.data?.url,
      raw: { ...json },
    };
  }
}
