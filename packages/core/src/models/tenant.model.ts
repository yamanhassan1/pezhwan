/**
 * PEZHWAN — Tenant model.
 *
 * First-class multi-tenancy with tenant isolation. Tenant A's users, roles,
 * permissions, applications, and OAuth clients must never be visible to
 * Tenant B.
 */

import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface TenantDoc {
  name: string;
  slug: string;
  isActive: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<TenantDoc>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

export const TenantModel: Model<TenantDoc> =
  (models.Tenant as Model<TenantDoc>) ||
  model<TenantDoc>('Tenant', tenantSchema);
