/**
 * PEZHWAN — external OAuth provider federation.
 *
 * Turns a provider callback into a local identity: exchange the code, fetch
 * the normalized profile, then resolve-or-link a Pezhwan user identity.
 */

import type {
  BuildAuthUrlParams,
  ExchangeParams,
} from '../adapter.ts';
import type { SsoProfile, SsoProviderName } from '@pezhwan/shared';
import { ProviderRegistry } from '../registry.ts';

export interface OAuthFederationDeps {
  registry: ProviderRegistry;
  findUserByIdentity: (
    provider: string,
    subject: string,
  ) => Promise<{ userId: string } | null>;
  createUserFromProfile: (profile: SsoProfile) => Promise<{ userId: string }>;
  linkIdentity: (
    userId: string,
    provider: string,
    subject: string,
    profile: SsoProfile,
  ) => Promise<{ identityId: string }>;
}

function toSsoProfile(
  provider: SsoProviderName | string,
  profile: {
    subject: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
    picture?: string;
    raw?: Record<string, unknown>;
  },
): SsoProfile {
  return {
    provider: provider as SsoProviderName,
    subject: profile.subject,
    email: profile.email,
    emailVerified: profile.emailVerified,
    name: profile.name,
    picture: profile.picture,
    raw: profile.raw ?? {},
  };
}

export class OAuthFederationService {
  constructor(private readonly deps: OAuthFederationDeps) {}

  buildAuthorizationUrl(providerName: string, params: BuildAuthUrlParams): string {
    return this.deps.registry.get(providerName).buildAuthorizationUrl(params);
  }

  async handleCallback(
    providerName: string,
    params: ExchangeParams,
  ): Promise<{ userId: string; isNew: boolean; profile: SsoProfile }> {
    const adapter = this.deps.registry.get(providerName);
    const exchange = await adapter.exchange(params);
    const profile = await adapter.getProfile(exchange.accessToken, exchange.idToken);
    const sso = toSsoProfile(providerName, profile);

    const existing = await this.deps.findUserByIdentity(providerName, profile.subject);
    if (existing) {
      await this.deps.linkIdentity(existing.userId, providerName, profile.subject, sso);
      return { userId: existing.userId, isNew: false, profile: sso };
    }
    const created = await this.deps.createUserFromProfile(sso);
    await this.deps.linkIdentity(created.userId, providerName, profile.subject, sso);
    return { userId: created.userId, isNew: true, profile: sso };
  }
}
