/**
 * PEZHWAN — Webhook delivery attempt model (outbound delivery ledger).
 */
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export interface WebhookDeliveryDoc {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastStatusCode?: number;
  lastError?: string;
  nextAttemptAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookDeliverySchema = new Schema<WebhookDeliveryDoc>(
  {
    webhookId: { type: String, required: true, index: true },
    event: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed', 'retrying'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastStatusCode: { type: Number },
    lastError: { type: String },
    nextAttemptAt: { type: Date },
    deliveredAt: { type: Date },
  },
  { timestamps: true },
);

export const WebhookDeliveryModel: Model<WebhookDeliveryDoc> =
  (models.WebhookDelivery as Model<WebhookDeliveryDoc>) ?? model<WebhookDeliveryDoc>('WebhookDelivery', WebhookDeliverySchema);