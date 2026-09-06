/**
 * PEZHWAN — Developer portal service.
 *
 * Aggregates the developer-facing surface (API keys, webhooks, usage) into one
 * dashboard view per tenant/application. Read-only except for onboarding state.
 */

import type { ApiUsageService } from './api-usage.service.ts';
import type { WebhookService } from '../events/webhook.service.ts';
import { WebhookModel } from '../../models/webhook.model.ts';
import { WebhookDeliveryModel } from '../../models/webhook-delivery.model.ts';

export interface ApiKeySummary {
  id: string;
  label?: string;
  createdAt: Date;
  lastUsedAt?: Date | null;
}

export interface DeveloperPortalView {
  tenantId: string;
  applicationId: string;
  apiKeys: ApiKeySummary[];
  webhooks: Array<{ id: string; url: string; events: string[]; active: boolean }>;
  usage: { total: number };
  onboarding: 'started' | 'configured' | 'live';
}

export type ApiKeyListFn = (filter: { tenantId: string; applicationId?: string }) => Promise<ApiKeySummary[]>;

export class DeveloperPortalService {
  constructor(
    private readonly listKeys: ApiKeyListFn,
    private readonly usage: ApiUsageService,
    private readonly webhooks?: WebhookService,
  ) {}

  async dashboard(tenantId: string, applicationId: string): Promise<DeveloperPortalView> {
    const [apiKeys, webhooks, usage] = await Promise.all([
      this.listKeys({ tenantId, applicationId }),
      WebhookModel.find({ tenantId, applicationId }),
      this.usage.snapshot(tenantId),
    ]);

    const configured = apiKeys.length > 0 || webhooks.length > 0;
    const delivery = webhooks.length
      ? await WebhookDeliveryModel.exists({ webhookId: { $in: webhooks.map((w) => w._id) } })
      : null;

    return {
      tenantId,
      applicationId,
      apiKeys,
      webhooks: webhooks.map((w) => ({
        id: String(w._id),
        url: w.url,
        events: w.events,
        active: w.active,
      })),
      usage: { total: usage.total },
      onboarding: configured && delivery ? 'live' : configured ? 'configured' : 'started',
    };
  }
}