/**
 * PEZHWAN — Application model.
 *
 * An application registers itself with Pezhwan and scopes its own roles,
 * permissions, users, and sessions. A single user authenticates across
 * applications while authorization remains application-specific.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import type { ApplicationPlatform } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

export interface ApplicationDoc {
  tenantId: string;
  name: string;
  platform: ApplicationPlatform;
  clientId: string;
  clientSecretHash: string;
  redirectUris: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<ApplicationDoc>(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    platform: { type: String, required: true },
    clientId: { type: String, required: true, unique: true },
    clientSecretHash: { type: String, required: true },
    redirectUris: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

applicationSchema.index({ tenantId: 1, clientId: 1 }, { unique: true });

export const ApplicationModel: Model<ApplicationDoc> =
  (models.Application as Model<ApplicationDoc>) ||
  model<ApplicationDoc>('Application', applicationSchema);