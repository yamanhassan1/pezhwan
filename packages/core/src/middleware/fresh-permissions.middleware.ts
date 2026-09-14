/**
 * PEZHWAN — Fresh-permissions middleware (frame-agnostic).
 *
 * Roles and permissions are embedded in the access token at mint time, so a
 * token can carry privileges that were revoked seconds ago until its TTL
 * elapses. For handlers that need ZERO revocation latency this helper
 * re-resolves the user's roles and permissions directly against MongoDB on
 * every request (an opt-in DB read) and returns the refreshed identity.
 *
 * It is deliberately OPT-IN: most routes are fine with token-baked claims and
 * the cheaper AccountState check; only sensitive handlers that must reflect a
 * revocation immediately should mount it.
 *
 * Machine identities (client-credentials `service` and `api_key`) have no user
 * account behind the token — their roles/permissions come from the token's
 * scope and are NOT re-resolved (a DB hit would wipe them to empty).
 */

import { AuthorizationError } from '@pezhwan/shared';
import type { IdentityContext } from '@pezhwan/shared';
import type { AuthorizationService } from '../services/authorization.service.ts';

const MACHINE_AUTH_METHODS = new Set(['service', 'api_key']);

/**
 * Opt-in middleware that re-resolves an authenticated identity's roles and
 * permissions from Mongo, overriding the (potentially stale) claims embedded
 * in the access token.
 */
export class FreshPermissionsMiddleware {
  constructor(private readonly authorization: AuthorizationService) {}

  /**
   * Re-resolve roles + permissions for an authenticated identity. Returns an
   * identity whose claims reflect the CURRENT database state — a role revoked
   * seconds ago is reflected immediately, before the token TTL.
   *
   * Machine identities pass through unchanged (their grants are token scope,
   * not DB assignments).
   */
  async refresh(identity: IdentityContext): Promise<IdentityContext> {
    if (
      MACHINE_AUTH_METHODS.has(identity.authMethod) ||
      // The token carried no role claims — nothing to refresh.
      !Array.isArray(identity.roles)
    ) {
      return identity;
    }

    const context = {
      userId: identity.userId,
      tenantId: identity.tenantId,
      applicationId: identity.applicationId,
    };
    const [roles, permissions] = await Promise.all([
      this.authorization.getUserRoles(context),
      this.authorization.getUserPermissions(context),
    ]);

    return {
      ...identity,
      roles: roles.map((r) => r.name),
      permissions,
    };
  }

  /**
   * Re-resolve the identity and require a specific permission on the fresh
   * claims. Throws AuthorizationError when the current DB state no longer
   * grants the permission (immediate revocation, regardless of token TTL).
   */
  async require(identity: IdentityContext, permission: string): Promise<IdentityContext> {
    const fresh = await this.refresh(identity);
    if (!fresh.permissions.includes(permission)) {
      throw new AuthorizationError(`Permission "${permission}" required`, 'PERMISSION_REQUIRED');
    }
    return fresh;
  }
}
