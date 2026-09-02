/**
 * PEZHWAN — MFA backup code model.
 *
 * Single-use recovery codes for when a user loses their TOTP authenticator.
 * Only SHA-256 hashes are stored at rest. Each code is consumed exactly once.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface BackupCodeDoc {
  userId: string;
  tenantId: string;
  codeHash: string;
  usedAt: Date | null;
  createdAt: Date;
}

const backupCodeSchema = new Schema<BackupCodeDoc>(
  {
    userId: { type: String, required: true },
    tenantId: { type: String, required: true },
    codeHash: { type: String, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// One batch per user; a hash can only be redeemed once.
backupCodeSchema.index({ userId: 1, tenantId: 1 });
backupCodeSchema.index({ codeHash: 1 }, { unique: true });
backupCodeSchema.index({ userId: 1, codeHash: 1 }, { unique: true });

export const BackupCodeModel: Model<BackupCodeDoc> =
  (models.BackupCode as Model<BackupCodeDoc>) ||
  model<BackupCodeDoc>('BackupCode', backupCodeSchema);
