/**
 * PEZHWAN — API key model.
 *
 * API keys are for server-to-server / service-to-service authentication. The
 * raw key is shown once at creation and stored only as a SHA-256 hash.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface ApiKeyDoc {
  tenantId: string;
  applicationId: string;
  name: string;
  keyHash: string;
  prefix?: string; // human-recognisable prefix like "pk_live_..."
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<ApiKeyDoc>(
  {
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    name: { type: String, required: true },
    keyHash: { type: String, required: true },
    prefix: { type: String },
    scopes: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

apiKeySchema.index({ tenantId: 1 });
apiKeySchema.index({ keyHash: 1 }, { unique: true });

export const ApiKeyModel: Model<ApiKeyDoc> =
  (models.ApiKey as Model<ApiKeyDoc>) ||
  model<ApiKeyDoc>('ApiKey', apiKeySchema);