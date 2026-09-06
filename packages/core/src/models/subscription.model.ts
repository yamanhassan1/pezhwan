/**
 * PEZHWAN — Subscription model (billing / entitlements).
 */
import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';

export interface SubscriptionDoc {
  _id: Types.ObjectId;
  tenantId?: string;
  applicationId?: string;
  plan: string;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  provider?: string;
  externalId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<SubscriptionDoc>(
  {
    tenantId: { type: String, index: true },
    applicationId: { type: String, index: true },
    plan: { type: String, required: true },
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'canceled', 'unpaid'],
      default: 'active',
      index: true,
    },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    provider: { type: String },
    externalId: { type: String },
  },
  { timestamps: true },
);

export const SubscriptionModel: Model<SubscriptionDoc> =
  (models.Subscription as Model<SubscriptionDoc>) ?? model<SubscriptionDoc>('Subscription', SubscriptionSchema);