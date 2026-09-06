/**
 * PEZHWAN — Tenant fixtures for integration tests.
 *
 * Shapes follow the canonical TenantDoc in models/tenant.model.ts.
 */

import type { TenantDoc } from '../../models/tenant.model.ts';

export function fixtureTenant(overrides: Partial<TenantDoc> = {}): TenantDoc {
  return {
    name: 'Acme Corp',
    slug: 'acme',
    isActive: true,
    config: { plan: 'enterprise' },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export const ACTIVE_TENANT_ID = '000000000000000000000001';
export const DISABLED_TENANT_ID = '000000000000000000000099';

export const TENANTS = {
  active: fixtureTenant({ slug: 'acme' }),
  disabled: fixtureTenant({ slug: 'acme-disabled', isActive: false }),
} as const;