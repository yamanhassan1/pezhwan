/**
 * PEZHWAN — OTP model.
 *
 * Stores the SHA-256 hash (not the raw code), expiry, and a monotonic attempts
 * counter to bound brute-force guessing. The raw code is only ever held in
 * memory and never written to storage, logs, or responses.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import type { OtpChannel, OtpPurpose } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

export interface OtpDoc {
  tenantId: string;
  applicationId: string;
  userId?: string;
  channel: OtpChannel;
  target: string; // email address or phone number
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumed: boolean;
  createdAt: Date;
}

const otpSchema = new Schema<OtpDoc>(
  {
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    userId: { type: String },
    channel: { type: String, enum: ['email', 'phone'], required: true },
    target: { type: String, required: true },
    purpose: {
      type: String,
      enum: [
        'login',
        'verify_email',
        'verify_phone',
        'password_reset',
        'change_email',
        'change_phone',
      ],
      required: true,
    },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// Lookup for verify: exactly one active code per (purpose, channel, target).
otpSchema.index(
  { tenantId: 1, applicationId: 1, purpose: 1, channel: 1, target: 1 },
  { unique: true },
);
// TTL: auto-remove expired codes.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel: Model<OtpDoc> =
  (models.Otp as Model<OtpDoc>) || model<OtpDoc>('Otp', otpSchema);