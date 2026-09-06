/**
 * PEZHWAN — Subscription service.
 *
 * Subscription lifecycle backed by the subscription model. Keeps provider
 * identifiers opaque; billing side-effects belong to the billing service.
 */

import { SubscriptionModel, type SubscriptionDoc, type SubscriptionStatus } from '../../models/subscription.model.ts';
import { ValidationError } from '@pezhwan/shared';

export interface CreateSubscriptionInput {
  tenantId?: string;
  applicationId?: string;
  plan: string;
  status?: SubscriptionStatus;
  provider?: string;
  externalId?: string;
  cancelAtPeriodEnd?: boolean;
}

export class SubscriptionService {
  async create(input: CreateSubscriptionInput): Promise<SubscriptionDoc> {
    if (!input.plan) throw new ValidationError('plan is required', 'PLAN_REQUIRED');
    return SubscriptionModel.create({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      plan: input.plan,
      status: input.status ?? 'active',
      provider: input.provider,
      externalId: input.externalId,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    });
  }

  async getByTenant(tenantId: string): Promise<SubscriptionDoc | null> {
    return SubscriptionModel.findOne({ tenantId }).sort({ createdAt: -1 });
  }

  async updateStatus(subscriptionId: string, status: SubscriptionStatus): Promise<SubscriptionDoc | null> {
    return SubscriptionModel.findByIdAndUpdate(subscriptionId, { $set: { status } }, { new: true });
  }

  async cancel(subscriptionId: string, atPeriodEnd = true): Promise<SubscriptionDoc | null> {
    return this.updateStatus(subscriptionId, 'canceled');
  }

  async list(tenantId?: string): Promise<SubscriptionDoc[]> {
    if (tenantId) return SubscriptionModel.find({ tenantId });
    return SubscriptionModel.find();
  }
}