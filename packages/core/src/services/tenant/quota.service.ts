/**
 * PEZHWAN — Tenant quota service.
 *
 * Enforces per-tenant resource limits (users, sessions, apiKeys, bytes, ...).
 * Usage counters are incremented atomically in the durable quota store.
 */

import { TenantQuotaModel, type TenantQuotaDoc } from '../../models/tenant-quota.model.ts';
import { RateLimitError } from '@pezhwan/shared';

export type QuotaResource =
  | 'users'
  | 'sessions'
  | 'api_keys'
  | 'oath_clients'
  | 'webhooks'
  | 'storage_bytes';

export interface QuotaOptions {
  limits: Partial<Record<QuotaResource, number>>;
}

export class QuotaService {
  private readonly limits: QuotaOptions['limits'];

  constructor(options: QuotaOptions) {
    this.limits = options.limits;
  }

  private async ensureDoc(tenantId: string): Promise<TenantQuotaDoc> {
    return TenantQuotaModel.findOneAndUpdate(
      { tenantId },
      { $setOnInsert: { quotas: this.limits, usage: {} } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async check(tenantId: string, resource: QuotaResource): Promise<void> {
    const doc = await this.ensureDoc(tenantId);
    const limit = doc.quotas[resource] ?? this.limits[resource] ?? Infinity;
    const used = doc.usage[resource] ?? 0;
    if (used >= limit) {
      throw new RateLimitError(`Tenant quota exceeded for ${resource}`, 60);
    }
  }

  async increment(tenantId: string, resource: QuotaResource, by = 1): Promise<number> {
    const doc = await TenantQuotaModel.findOneAndUpdate(
      { tenantId },
      { $inc: { [`usage.${resource}`]: by } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return doc.usage[resource] ?? by;
  }

  async usage(tenantId: string): Promise<Record<string, number>> {
    const doc = await this.ensureDoc(tenantId);
    return { ...doc.usage };
  }
}