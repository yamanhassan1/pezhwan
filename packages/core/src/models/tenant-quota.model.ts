/**
 * PEZHWAN — Tenant quota model (per-tenant resource limits).
 */
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface TenantQuotaDoc {
  tenantId: string;
  quotas: Record<string, number>;
  usage: Record<string, number>;
  appQuota?: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const TenantQuotaSchema = new Schema<TenantQuotaDoc>(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    quotas: { type: Schema.Types.Mixed, default: {} },
    usage: { type: Schema.Types.Mixed, default: {} },
    appQuota: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const TenantQuotaModel: Model<TenantQuotaDoc> =
  (models.TenantQuota as Model<TenantQuotaDoc>) ?? model<TenantQuotaDoc>('TenantQuota', TenantQuotaSchema);