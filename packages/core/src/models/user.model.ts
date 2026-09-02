/**
 * PEZHWAN — User model.
 *
 * A user belongs to exactly one tenant. Email/phone are optional identity
 * handles but must be unique within a tenant when present. Passwords are NEVER
 * stored in plaintext — only the Argon2id hash.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import type { LinkedIdentity } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

export interface UserDoc {
  _id: Types.ObjectId;
  /** Opaque tenant identifier (string) — see identifier-policy.ts. */
  tenantId: string;
  email?: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  tokenVersion: number;
  passwordHash: string | null;
  identities?: LinkedIdentity[];
  failedLoginAttempts: number;
  loginLockUntil: Date | null;
  mfaEnabled: boolean;
  mfaSecret?: string | null;
  mfaSecretVerifiedAt?: number | null;
  mfaFailedAttempts: number;
  mfaLockUntil: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

const identitySchema = new Schema<LinkedIdentity>(
  {
    provider: { type: String, required: true, index: true },
    subject: { type: String, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<UserDoc>(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    email: { type: String, lowercase: true, trim: true, sparse: true },
    phone: { type: String, trim: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    passwordHash: { type: String, default: null },
    identities: { type: [identitySchema], default: [] },
    failedLoginAttempts: { type: Number, default: 0 },
    loginLockUntil: { type: Date, default: null },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, default: null, select: false },
    mfaSecretVerifiedAt: { type: Number, default: null },
    mfaFailedAttempts: { type: Number, default: 0 },
    mfaLockUntil: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Unique identity handles, scoped within a tenant. Uses partial indexes (not
// `sparse`) so that rows where the handle is missing/null are excluded from
// uniqueness. `sparse` still indexes explicit `null` values, which makes two
// email-only (or phone-only) users under one tenant collide — a real bug for
// a user base that mixes identity handles.
userSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
userSchema.index(
  { tenantId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } },
);
// For looking up a secondary identity (OAuth subject) within a tenant.
userSchema.index({ tenantId: 1, 'identities.provider': 1, 'identities.subject': 1 });
// For lockout queries.
userSchema.index({ tenantId: 1, isActive: 1 });

export const UserModel: Model<UserDoc> =
  (models.User as Model<UserDoc>) ||
  model<UserDoc>('User', userSchema);
