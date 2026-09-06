/**
 * PEZHWAN — Webhook endpoint model (outbound event delivery registration).
 */
import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface WebhookDoc {
  _id: Types.ObjectId;
  tenantId?: string;
  applicationId?: string;
  url: string;
  secret?: string;
  events: string[];
  active: boolean;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema<WebhookDoc>(
  {
    tenantId: { type: String, index: true },
    applicationId: { type: String, index: true },
    url: { type: String, required: true },
    secret: { type: String },
    events: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    maxRetries: { type: Number, default: 5 },
  },
  { timestamps: true },
);

export const WebhookModel: Model<WebhookDoc> =
  (models.Webhook as Model<WebhookDoc>) ?? model<WebhookDoc>('Webhook', WebhookSchema);