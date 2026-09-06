/**
 * PEZHWAN — Usage service.
 *
 * Aggregates tenant/billing usage counters from the quota store and the
 * metrics registry into a consumer-friendly summary.
 */

import type { QuotaService } from '../tenant/quota.service.ts';
import type { QuotaResource } from '../tenant/quota.service.ts';

export interface UsageSummary {
  tenantId: string;
  resources: Record<string, number>;
  reportedAt: string;
}

export class UsageService {
  constructor(private readonly quota: QuotaService) {}

  async summarize(tenantId: string): Promise<UsageSummary> {
    return {
      tenantId,
      resources: await this.quota.usage(tenantId),
      reportedAt: new Date().toISOString(),
    };
  }

  /** Record one usage event (e.g. request, storage byte). */
  async track(tenantId: string, resource: QuotaResource, by = 1): Promise<number> {
    return this.quota.increment(tenantId, resource, by);
  }
}