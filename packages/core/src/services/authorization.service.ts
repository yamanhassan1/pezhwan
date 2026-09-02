/**
 * PEZHWAN — authorization service (RBAC).
 *
 * Server-side only. Authorization is resolved from the verified identity
 * context plus permission/role lookups in the database — never from client
 * input. Supports hasRole, hasPermission, can(context), and role assignment.
 */

import { AuthorizationError } from '@pezhwan/shared';
import type { AuthorizationContext, IdentityContext } from '@pezhwan/shared';
import {
  RoleModel,
  UserRoleAssignmentModel,
  PermissionModel,
  UserModel,
  type RoleDoc,
} from '../models/index.ts';
import type { AuditService } from './audit.service.ts';
import type { AccountStateService } from './accountState.service.ts';

/** Attribute-based authorization policy hook. */
export interface PolicyEngine {
  /** Evaluate whether the request passes ABAC policy for a resource:action. */
  can(context: {
    userId: string;
    tenantId: string;
    applicationId: string;
    resourceId?: string;
    resource?: string;
    action?: string;
    attributes?: Record<string, unknown>;
  }): Promise<boolean>;
}

export interface AuthorizationInput {
  userId: string;
  tenantId: string;
  applicationId: string;
  /** Ownership context for resource-specific `can()` checks. */
  resource?: string;
  action?: string;
  resourceId?: string;
}

export class AuthorizationService {
  private policy?: PolicyEngine;

  constructor(
    private readonly audit?: AuditService,
    private readonly accountState?: AccountStateService,
  ) {}

  setPolicyEngine(policy: PolicyEngine): void {
    this.policy = policy;
  }

  /**
   * Force every access token for a user to be re-evaluated immediately after a
   * role change. Roles are embedded in access tokens at mint time; without this
   * bump a revoked privilege would persist until the token's TTL. Bumping
   * `tokenVersion` + dropping the account-state cache makes `accountState`
   * reject any token minted before the change on the very next request
   * (fail-closed privilege revocation).
   */
  private async invalidateUserTokens(userId: string): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
    await this.accountState?.invalidate(userId);
  }

  private asKey(context: {
    userId: string;
    tenantId: string;
    applicationId: string;
  }) {
    return `${context.userId}:${context.tenantId}:${context.applicationId}`;
  }

  async assignRole(input: {
    userId: string;
    tenantId: string;
    applicationId: string;
    roleName: string;
  }): Promise<void> {
    const role = await RoleModel.findOne({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      name: input.roleName,
    });
    if (!role) {
      throw new AuthorizationError(
        `Role "${input.roleName}" not found in this application`,
        'ROLE_NOT_FOUND',
      );
    }
    await UserRoleAssignmentModel.findOneAndUpdate(
      {
        userId: input.userId,
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        roleId: role._id,
      },
      { $setOnInsert: { assignedAt: new Date() } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    await this.audit?.log({
      eventType: 'ROLE_CHANGED',
      userId: input.userId,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      metadata: { action: 'assign', roleName: input.roleName },
    });
    await this.invalidateUserTokens(input.userId);
  }

  async removeRole(input: {
    userId: string;
    tenantId: string;
    applicationId: string;
    roleName: string;
  }): Promise<void> {
    const role = await RoleModel.findOne({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      name: input.roleName,
    });
    if (!role) {
      return; // nothing to remove
    }
    await UserRoleAssignmentModel.deleteOne({
      userId: input.userId,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      roleId: role._id,
    });
    await this.audit?.log({
      eventType: 'ROLE_CHANGED',
      userId: input.userId,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      metadata: { action: 'remove', roleName: input.roleName },
    });
    await this.invalidateUserTokens(input.userId);
  }

  /** Resolve the roles assigned to a user within a tenant+application. */
  async getUserRoles(context: {
    userId: string;
    tenantId: string;
    applicationId: string;
  }): Promise<RoleDoc[]> {
    const assignments = await UserRoleAssignmentModel.find({
      userId: context.userId,
      tenantId: context.tenantId,
      applicationId: context.applicationId,
    })
      .select('roleId')
      .lean();
    const roleIds = assignments.map((a) => a.roleId);
    if (roleIds.length === 0) {
      return [];
    }
    return RoleModel.find({ _id: { $in: roleIds } }).lean();
  }

  /** Resolve all permission names for a user within a tenant+application. */
  async getUserPermissions(context: {
    userId: string;
    tenantId: string;
    applicationId: string;
  }): Promise<string[]> {
    const roles = await this.getUserRoles(context);
    const permissionIds = new Set(
      roles.flatMap((r) => r.permissionIds.map(String)),
    );
    if (permissionIds.size === 0) {
      return [];
    }
    const perms = await PermissionModel.find({
      _id: { $in: [...permissionIds] },
      tenantId: context.tenantId,
      applicationId: context.applicationId,
    })
      .select('name')
      .lean();
    return perms.map((p) => p.name);
  }

  async hasRole(
    context: { userId: string; tenantId: string; applicationId: string },
    roleName: string,
  ): Promise<boolean> {
    const roles = await this.getUserRoles(context);
    return roles.some((r) => r.name === roleName);
  }

  async hasPermission(
    context: { userId: string; tenantId: string; applicationId: string },
    permission: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(context);
    return permissions.includes(permission);
  }

  /**
   * General authorization decision. `permission` is "resource:action".
   * By default a permission grant deems the request authorized; ownership
   * hooks are intentional future ABAC extension points.
   */
  async can(
    input: AuthorizationInput & { permission: string },
  ): Promise<boolean> {
    const context = {
      userId: input.userId,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      resourceId: input.resourceId,
      resource: input.resource,
      action: input.action,
    };
    if (this.policy) {
      const allowed = await this.policy.can(context);
      if (!allowed) {
        await this.audit?.log({
          eventType: 'AUTHZ_DENIED',
          userId: input.userId,
          tenantId: input.tenantId,
          applicationId: input.applicationId,
          metadata: {
            resource: input.resource,
            action: input.action,
            resourceId: input.resourceId,
            reason: 'policy_denied',
          },
        });
        return false;
      }
    }
    if (await this.hasPermission(context, input.permission)) {
      return true;
    }
    await this.audit?.log({
      eventType: 'AUTHZ_DENIED',
      userId: input.userId,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      metadata: {
        permission: input.permission,
        resource: input.resource,
        action: input.action,
        resourceId: input.resourceId,
        reason: 'no_permission',
      },
    });
    return false;
  }

  /**
   * Build a fully-populated IdentityContext (roles + permissions) for an
   * authenticated user — used when minting access tokens and attached to
   * req.pezhwan middlewares.
   */
  async buildIdentityContext(input: {
    userId: string;
    tenantId: string;
    applicationId: string;
    sessionId: string;
    authMethod: IdentityContext['authMethod'];
  }): Promise<IdentityContext> {
    const context = {
      userId: input.userId,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
    };
    const [roles, permissions] = await Promise.all([
      this.getUserRoles(context),
      this.getUserPermissions(context),
    ]);
    return {
      userId: input.userId,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      roles: roles.map((r) => r.name),
      permissions,
      authMethod: input.authMethod,
      authenticatedAt: Date.now(),
    };
  }
}