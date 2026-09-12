/**
 * PEZHWAN — fully parameterized provider for enterprise IdPs.
 *
 * Point it at any RFC 6749 endpoint set; profile resolution happens either
 * through an injected resolver or id_token claim mapping.
 */

import { BaseOAuthProvider, decodeJwtPayload } from './base.provider.ts';
import type { ProviderProfile } from '../adapter.ts';

export interface CustomProviderOptions {
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
  extraAuthParams?: Record<string, string>;
  /** Preferred: resolves the profile without assumptions about the IdP. */
  profileResolver?: (
    accessToken: string,
    idToken?: string,
  ) => Promise<ProviderProfile>;
  /** Fallback mapping used when no resolver is supplied (id_token claims). */
  fieldMapping?: {
    subject?: string;
    email?: string;
    emailVerified?: string;
    name?: string;
    picture?: string;
  };
}

export class CustomProvider extends BaseOAuthProvider {
  readonly name: string;

  constructor(private readonly opts: CustomProviderOptions) {
    super({ ...opts });
    this.name = opts.name;
  }

  async getProfile(accessToken: string, idToken?: string): Promise<ProviderProfile> {
    if (this.opts.profileResolver) {
      return this.opts.profileResolver(accessToken, idToken);
    }
    const claims = decodeJwtPayload(idToken ?? '');
    const mapping = this.opts.fieldMapping ?? {};
    const subjectKey = mapping.subject ?? 'sub';
    const emailKey = mapping.email ?? 'email';
    const verifiedKey = mapping.emailVerified ?? 'email_verified';
    const nameKey = mapping.name ?? 'name';
    const pictureKey = mapping.picture ?? 'picture';
    return {
      subject: String(claims[subjectKey] ?? ''),
      email: typeof claims[emailKey] === 'string' ? (claims[emailKey] as string) : undefined,
      emailVerified: Boolean(claims[verifiedKey]),
      name: typeof claims[nameKey] === 'string' ? (claims[nameKey] as string) : undefined,
      picture: typeof claims[pictureKey] === 'string' ? (claims[pictureKey] as string) : undefined,
      raw: claims,
    };
  }
}
