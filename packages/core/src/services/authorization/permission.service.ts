/**
 * PEZHWAN — Permission service.
 *
 * Resolves permission checks against the canonical RBAC AuthorizationService,
 * including resource/action aware `can` evaluations.
 */

import type { AuthorizationService, PolicyEngine } from '../authorization.service.ts';

export interface PermissionContext {
  userId: string;
  tenantId: string;
  applicationId: string;
  resource?: string;
  action?: string;
  resourceId?: string;
  attributes?: Record<string, unknown>;
}

export class PermissionService {
  constructor(private readonly authorization: AuthorizationService) {}

  has(context: PermissionContext, permission: string): Promise<boolean> {
    return this.authorization.hasPermission(context, permission);
  }

  can(context: PermissionContext, permission: string): Promise<boolean> {
    return this.authorization.can({ ...context, permission });
  }

  /** True when every permission is granted. */
  async hasAll(context: PermissionContext, permissions: string[]): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.has(context, permission))) return false;
    }
    return true;
  }

  /** Adapter for callers that hold a bare policy engine. */
  static fromPolicyEngine(engine: PolicyEngine): PermissionService {
    const authorization = {
      hasPermission: async (_context: PermissionContext, _permission: string) => true,
      can: async (input: Parameters<AuthorizationService['can']>[0]) => engine.can(input),
    } as unknown as AuthorizationService;
    return new PermissionService(authorization);
  }
}