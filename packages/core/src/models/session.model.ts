/**
 * PEZHWAN — Session model.
 *
 * Refresh tokens are NEVER stored in plaintext. We store the SHA-256 hash of
 * the current refresh token, a familyId for rotation tracking, and a
 * replacedBySessionId to detect reuse. Reuse of an already-rotated token
 * revokes the whole family.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import type { SessionStatus } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

export interface SessionDoc {
  _id: Types.ObjectId;
  userId: string;
  tenantId: string;
  applicationId: string;
  status: SessionStatus;
  familyId: string;
  currentRefreshTokenHash: string;
  replacedBySessionId?: string;
  device?: {
    ip: string;
    userAgent: string;
    deviceLabel: string;
  };
  lastUsedAt?: Date;
  createdFromIp?: string;
  lastUsedIp?: string;
  userAgentHash?: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

const sessionSchema = new Schema<SessionDoc>(
  {
    userId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'rotating', 'revoked', 'replaced', 'expired'],
      default: 'active',
      index: true,
    },
    familyId: { type: String, required: true, index: true },
    currentRefreshTokenHash: { type: String, required: true },
    replacedBySessionId: { type: String, default: null },
    device: {
      ip: { type: String },
      userAgent: { type: String },
      deviceLabel: { type: String },
      _id: false,
    },
    lastUsedAt: { type: Date, default: null },
    createdFromIp: { type: String },
    lastUsedIp: { type: String },
    userAgentHash: { type: String },
    lastActiveAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Active sessions per user+application (session management UI + caps).
sessionSchema.index({ userId: 1, tenantId: 1, applicationId: 1, status: 1 });
// Expiry pruning (Mongo removes the whole document after expiry).
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Look-up by refresh-token hash on refresh.
sessionSchema.index({ currentRefreshTokenHash: 1 }, { unique: true });

export const SessionModel: Model<SessionDoc> =
  (models.Session as Model<SessionDoc>) ||
  model<SessionDoc>('Session', sessionSchema);