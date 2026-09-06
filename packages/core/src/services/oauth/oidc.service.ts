/**
 * PEZHWAN — OpenID Connect service.
 *
 * Serves OIDC discovery metadata and the UserInfo endpoint for validated
 * access tokens. UserInfo claims are mapped from the UserDoc on demand.
 */

import type { OAuthService } from '../oauth.service.ts';
import { UserModel } from '../../models/user.model.ts';

export interface UserInfoClaims {
  sub: string;
  [key: string]: unknown;
}

export class OidcService {
  constructor(private readonly oauth: OAuthService) {}

  /** /.well-known/openid-configuration */
  discovery(): Record<string, unknown> {
    return this.oauth.discovery();
  }

  /**
   * /userinfo — resolves subject from an already-validated access token.
   * Respects the `scope` claim: only requested claims are disclosed.
   */
  async userinfo(
    payload: {
      sub: string;
      tenantId: string;
      applicationId?: string;
      scope?: string;
    },
    requestedScopes?: string[],
  ): Promise<UserInfoClaims> {
    const scopes = new Set((payload.scope ?? requestedScopes?.join(' ') ?? 'openid').split(/\s+/));
    const user = await UserModel.findById(payload.sub);
    const claims: UserInfoClaims = { sub: payload.sub };
    if (user && scopes.has('email') && user.email) {
      claims.email = user.email;
      claims.email_verified = user.emailVerified;
    }
    if (user && scopes.has('profile')) {
      const meta = user.metadata ?? {};
      if (meta.name) claims.name = meta.name;
      if (meta.given_name) claims.given_name = meta.given_name;
      if (meta.family_name) claims.family_name = meta.family_name;
      if (meta.picture) claims.picture = meta.picture;
    }
    return claims;
  }
}