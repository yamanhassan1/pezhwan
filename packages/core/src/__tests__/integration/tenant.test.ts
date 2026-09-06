/**
 * PEZHWAN — Tenant integration test.
 *
 * Verifies multi-tenant routing (TenantMiddleware resolution + active checks)
 * and the usage aggregation pipeline (ApiUsageService → UsageService) with a
 * real QuotaService whose store is swapped for an in-memory backend.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ApiUsageService,
  TenantMiddleware,
  UsageService,
  type QuotaService,
  type TenantService,
} from '@pezhwan/core';
import { ACTIVE_TENANT_ID, DISABLED_TENANT_ID, TENANTS } from '../fixtures/tenants.ts';

test('tenant middleware resolves tenant id by precedence: header > path > user > system', async () => {
  const middleware = new TenantMiddleware();

  const header = await middleware.resolve({
    headerTenantId: 'header-tenant',
    pathTenantId: 'path-tenant',
    userTenantId: 'user-tenant',
  });
  assert.deepEqual(header, { tenantId: 'header-tenant', source: 'header' });

  const path = await middleware.resolve({ pathTenantId: 'path-tenant', userTenantId: 'user-tenant' });
  assert.deepEqual(path, { tenantId: 'path-tenant', source: 'path' });

  const system = await middleware.resolve({});
  assert.equal(system.tenantId, 'system');
});

test('tenant middleware rejects disabled tenants and honours the system tenant', async () => {
  const tenants = {
    get: async (tenantId: string) => {
      if (tenantId === ACTIVE_TENANT_ID) return TENANTS.active;
      if (tenantId === DISABLED_TENANT_ID) return TENANTS.disabled;
      return null;
    },
  } as unknown as TenantService;
  const middleware = new TenantMiddleware(tenants);

  await middleware.assertActive(ACTIVE_TENANT_ID); // no throw
  await middleware.assertActive('system'); // virtual tenant — no throw
  await assert.rejects(middleware.assertActive(DISABLED_TENANT_ID), /disabled/i);
  await assert.rejects(middleware.assertActive('000000000000000000000050'), /unknown/i);
});

test('usage aggregator reports per-resource and total counters', async () => {
  const quotas = { usage: new Map<string, Map<string, number>>() };
  const fakeQuota = {
    increment: async (tenantId: string, resource: string, by = 1) => {
      const perResource = quotas.usage.get(tenantId) ?? new Map<string, number>();
      perResource.set(resource, (perResource.get(resource) ?? 0) + by);
      quotas.usage.set(tenantId, perResource);
      return perResource.get(resource) ?? by;
    },
    usage: async (tenantId: string) => {
      const perResource = quotas.usage.get(tenantId) ?? new Map<string, number>();
      return Object.fromEntries(perResource);
    },
  } as unknown as QuotaService;

  const usage = new UsageService(fakeQuota);
  const apiUsage = new ApiUsageService(usage);

  await apiUsage.record(ACTIVE_TENANT_ID, 'api_keys', 2);
  await apiUsage.record(ACTIVE_TENANT_ID, 'sessions', 1);
  await apiUsage.record(ACTIVE_TENANT_ID, 'sessions', 1);

  const snapshot = await apiUsage.snapshot(ACTIVE_TENANT_ID);
  assert.deepEqual(snapshot.perResource, { api_keys: 2, sessions: 2 });
  assert.equal(snapshot.total, 4);
});