/**
 * PEZHWAN — rate-limit counter model.
 *
 * Durable, distributed fixed-window counter used as the Option-C fallback when
 * Redis is configured but unavailable. Incremented ATOMICALLY with
 * findOneAndUpdate + an aggregation pipeline so concurrent requests across
 * instances can never lose increments. The window is reset in the same atomic
 * pass when `expiresAt` is in the past, so the counter is self-cleaning (no
 * background job required).
 *
 * This is only engaged when Redis is CONFIGURED but DOWN; a never-configured
 * deployment uses the process-local fallback instead.
 */

import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface RateLimitCounterDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}

const rateLimitCounterSchema = new Schema<RateLimitCounterDoc>(
  {
    _id: { type: String, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

export const RateLimitCounterModel: Model<RateLimitCounterDoc> =
  (models.RateLimitCounter as Model<RateLimitCounterDoc>) ||
  model<RateLimitCounterDoc>('RateLimitCounter', rateLimitCounterSchema);
