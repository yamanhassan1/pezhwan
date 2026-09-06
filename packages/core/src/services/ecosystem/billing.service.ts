/**
 * PEZHWAN — Billing service.
 *
 * Coordinates subscription state with pluggable billing providers (adapters).
 * Provider calls happen in adapters; this service owns the reconciliation.
 */

import type { SubscriptionService } from './subscription.service.ts';
import type { SubscriptionStatus } from '../../models/subscription.model.ts';

export interface BillingProviderClient {
  createCheckout(plan: string, customerRef: string): Promise<{ url: string; externalId: string }>;
  cancelSubscription(externalId: string): Promise<void>;
}

export interface BillingServiceOptions {
  subscription: SubscriptionService;
  provider?: BillingProviderClient;
}

export interface CheckoutResult {
  url: string;
  subscriptionId: string;
}

export class BillingService {
  private readonly subscription: SubscriptionService;
  private readonly provider?: BillingProviderClient;

  constructor(options: BillingServiceOptions) {
    this.subscription = options.subscription;
    this.provider = options.provider;
  }

  async checkout(options: { tenantId: string; applicationId?: string; plan: string }): Promise<CheckoutResult> {
    const subscription = await this.subscription.create({
      tenantId: options.tenantId,
      applicationId: options.applicationId,
      plan: options.plan,
      status: 'trialing',
    });
    if (this.provider) {
      const { url, externalId } = await this.provider.createCheckout(
        options.plan,
        options.tenantId,
      );
      await this.subscription.updateStatus(String(subscription._id), 'trialing');
      return { url, subscriptionId: String(subscription._id) };
    }
    await this.subscription.updateStatus(String(subscription._id), 'active');
    return { url: '', subscriptionId: String(subscription._id) };
  }

  async webhookStatusChanged(externalId: string, status: SubscriptionStatus): Promise<void> {
    const match = (await this.subscription.list()).find((s) => s.externalId === externalId);
    if (match) await this.subscription.updateStatus(String(match._id), status);
  }
}