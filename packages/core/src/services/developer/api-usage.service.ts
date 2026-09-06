/**
 * PEZHWAN — API usage service.
 *
 * Aggregates per-key/per-tenant API consumption from the usage service and
 * (when available) audit log records. Powers developer-portal dashboards and
 * throttling dashboards.
 */

import type { UsageService } from '../ecosystem/usage.service.ts';
import type { QuotaResource } from '../tenant/quota.service.ts';

export interface UsageBreakdown {
  tenantId: string;
  perResource: Record<string, number>;
  total: number;
  measuredAt: string;
}

export class ApiUsageService {
  constructor(private readonly usage: UsageService) {}

  /** Current counter snapshot for a tenant. */
  async snapshot(tenantId: string): Promise<UsageBreakdown> {
    const resources = await this.usage.summarize(tenantId);
    const total = Object.values(resources.resources).reduce((sum, value) => sum + value, 0);
    return {
      tenantId,
      perResource: resources.resources,
      total,
      measuredAt: new Date().toISOString(),
    };
  }

  /** Records one unit of a resource (e.g. a request). */
  async record(tenantId: string, resource: QuotaResource, by = 1): Promise<void> {
    await this.usage.track(tenantId, resource, by);
  }
}