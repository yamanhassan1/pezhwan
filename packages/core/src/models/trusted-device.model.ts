/**
 * PEZHWAN — Trusted device model (step-up / MFA device whitelisting).
 */
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface TrustedDeviceDoc {
  userId: string;
  deviceId: string;
  label?: string;
  fingerprint: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TrustedDeviceSchema = new Schema<TrustedDeviceDoc>(
  {
    userId: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    label: { type: String },
    fingerprint: { type: String, required: true },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

TrustedDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export const TrustedDeviceModel: Model<TrustedDeviceDoc> =
  (models.TrustedDevice as Model<TrustedDeviceDoc>) ?? model<TrustedDeviceDoc>('TrustedDevice', TrustedDeviceSchema);