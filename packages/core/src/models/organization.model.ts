/**
 * PEZHWAN — Organization model (multi-tenant grouping).
 */
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface OrganizationDoc {
  name: string;
  slug: string;
  tenantId?: string;
  ownerUserId: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<OrganizationDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tenantId: { type: String, index: true },
    ownerUserId: { type: String, required: true, index: true },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const OrganizationModel: Model<OrganizationDoc> =
  (models.Organization as Model<OrganizationDoc>) ?? model<OrganizationDoc>('Organization', OrganizationSchema);