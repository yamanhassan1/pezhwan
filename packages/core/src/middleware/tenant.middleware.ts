/**
 * PEZHWAN — Tenant middleware.
 *
 * Resolves the effective tenantId from (in order): X-Tenant-Id header, path
 * prefix, or the authenticated user's tenant. Enforces that a resolved tenant
 * is active before allowing the request through.
 */

import type { TenantService } from '../services/tenant/tenant.service.ts';
import { AuthorizationError } from '@pezhwan/shared';

export interface TenantResolution {
  tenantId: string;
  source: 'header' | 'path' | 'user' | 'system';
}

export class TenantMiddleware {
  constructor(private readonly tenants?: TenantService) {}

  async resolve(input: {
    headerTenantId?: string;
    pathTenantId?: string;
    userTenantId?: string;
  }): Promise<TenantResolution> {
    if (input.headerTenantId) return { tenantId: input.headerTenantId, source: 'header' };
    if (input.pathTenantId) return { tenantId: input.pathTenantId, source: 'path' };
    if (input.userTenantId) return { tenantId: input.userTenantId, source: 'user' };
    return { tenantId: 'system', source: 'system' };
  }

  /** Verifies the tenant exists and is active (when a service is wired). */
  async assertActive(tenantId: string): Promise<void> {
    if (!this.tenants) return;
    const tenant = await this.tenants.get(tenantId);
    if (!tenant) {
      if (tenantId === 'system') return;
      throw new AuthorizationError('Unknown tenant', 'TENANT_NOT_FOUND');
    }
    if (!tenant.isActive) {
      throw new AuthorizationError('Tenant is disabled', 'TENANT_DISABLED');
    }
  }
}