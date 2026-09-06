/**
 * PEZHWAN — Risk event model.
 *
 * Persists per-login risk signals (IP, geo, device, velocity, HIBP match) so
 * the risk engine can compute a score and the audit trail can reconstruct why
 * a login was allowed, challenged, or blocked.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface RiskSignal {
  /** e.g. 'new_ip', 'impossible_travel', 'tor', 'proxy', 'hibp_match', 'bot_like', 'dev_anomaly' */
  kind: string;
  /** Human-readable description. */
  detail: string;
  /** Contribution to the final 0-100 score. */
  weight: number;
}

export interface RiskEventDoc {
  _id: Types.ObjectId;
  tenantId: string;
  userId?: Types.ObjectId;
  applicationId?: string;
  /** Risk score 0-100 (100 = block). */
  score: number;
  /** Recommended action. */
  action: 'allow' | 'challenge' | 'block' | 'monitor';
  /** Login attempt identifier (correlates risk + auth). */
  attemptId: string;
  ip?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  userAgent?: string;
  deviceId?: string;
  signals: RiskSignal[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

const signalSchema = new Schema<RiskSignal>(
  {
    kind: { type: String, required: true },
    detail: { type: String, required: true },
    weight: { type: Number, required: true },
  },
  { _id: false },
);

const schema = new Schema<RiskEventDoc>(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    applicationId: { type: String },
    score: { type: Number, required: true },
    action: { type: String, enum: ['allow', 'challenge', 'block', 'monitor'], required: true },
    attemptId: { type: String, required: true, index: true },
    ip: { type: String },
    country: { type: String },
    city: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    userAgent: { type: String },
    deviceId: { type: String, index: true },
    signals: { type: [signalSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

schema.index({ userId: 1, createdAt: -1 });

export const RiskEventModel: Model<RiskEventDoc> =
  (models.RiskEvent as Model<RiskEventDoc>) || model<RiskEventDoc>('RiskEvent', schema);
