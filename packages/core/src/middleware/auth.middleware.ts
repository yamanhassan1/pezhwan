/**
 * PEZHWAN — Auth middleware.
 *
 * Frame-agnostic helpers to validate an access token against the runtime's
 * TokenService + AccountStateService and attach the identity to the context
 * object (Express request, Fastify request, or a plain object).
 */

import type { TokenService } from '../services/token.service.ts';
import type { AccountStateService } from '../services/accountState.service.ts';
import type { IdentityContext } from '@pezhwan/shared';
import { AuthenticationError } from '@pezhwan/shared';

export interface AuthContext {
  userId: string;
  tenantId: string;
  applicationId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  authMethod: string;
  scope?: string;
}

export class AuthMiddleware {
  constructor(
    private readonly tokens: TokenService,
    private readonly accountState: AccountStateService,
  ) {}

  /** Validates `Authorization: Bearer <token>` and returns the identity. */
  async verify(bearerToken: string | undefined): Promise<AuthContext> {
    if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing bearer token', 'AUTH_REQUIRED');
    }
    const token = bearerToken.slice('Bearer '.length).trim();
    const identity = this.tokens.verifyAccessToken(token);
    const accountValid = await this.accountState.validate(identity.userId, identity.tokenVersion ?? 0);
    if (!accountValid) {
      throw new AuthenticationError('Session revoked', 'SESSION_REVOKED');
    }
    return {
      userId: identity.userId,
      tenantId: identity.tenantId,
      applicationId: identity.applicationId,
      sessionId: identity.sessionId,
      roles: identity.roles,
      permissions: identity.permissions,
      authMethod: identity.authMethod,
      scope: identity.scope,
    };
  }
}