/**
 * PEZHWAN — Decoy (honeypot) user model.
 *
 * Decoy users look like real users to an attacker probing credentials but
 * belong to no human. Any login attempt against a decoy triggers a high-priority
 * alert and is never allowed to succeed.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface DecoyUserDoc {
  _id: Types.ObjectId;
  tenantId: string;
  /** The decoy's login handle (email or phone). */
  handle: string;
  /** Any hash stored to make the decoy look real (hash of a throwaway password). */
  passwordHash?: string;
  /** Description for operators (which env / purpose). */
  description?: string;
  isActive: boolean;
  /** Incremented on every attempt against the decoy. */
  hitCount: number;
  lastAttemptAt?: Date | null;
  lastAttemptIp?: string;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

const schema = new Schema<DecoyUserDoc>(
  {
    tenantId: { type: String, required: true, index: true },
    handle: { type: String, required: true },
    passwordHash: { type: String },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    hitCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    lastAttemptIp: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// A decoy handle is unique within a tenant.
schema.index({ tenantId: 1, handle: 1 }, { unique: true });

export const DecoyUserModel: Model<DecoyUserDoc> =
  (models.DecoyUser as Model<DecoyUserDoc>) || model<DecoyUserDoc>('DecoyUser', schema);