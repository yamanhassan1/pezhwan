/**
 * PEZHWAN — verification token model.
 *
 * Covers email verification, password reset, and magic-link tokens. Single use,
 * short TTL, bound to a user + tenant + application. Only the SHA-256 hash is
 * stored at rest.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import type { VerificationTokenKind } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

export interface VerificationTokenDoc {
  _id: Types.ObjectId;
  kind: VerificationTokenKind;
  tenantId: string;
  applicationId: string;
  userId: string;
  tokenHash: string;
  target?: string;
  redirectUri?: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

const verificationTokenSchema = new Schema<VerificationTokenDoc>(
  {
    kind: {
      type: String,
      enum: [
        'email_verification',
        'password_reset',
        'magic_link',
        'email_change',
        'phone_change',
      ],
      required: true,
    },
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    userId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    target: { type: String },
    redirectUri: { type: String },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// One live, un-consumed token per (kind, tenant, application, user) for
// password-reset / verification uniqueness is enforced at the service layer;
// the unique hash guarantees a token can only ever be redeemed once.
verificationTokenSchema.index({ tokenHash: 1 }, { unique: true });
verificationTokenSchema.index({ userId: 1, tenantId: 1, applicationId: 1, kind: 1 });
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationTokenModel: Model<VerificationTokenDoc> =
  (models.VerificationToken as Model<VerificationTokenDoc>) ||
  model<VerificationTokenDoc>('VerificationToken', verificationTokenSchema);
