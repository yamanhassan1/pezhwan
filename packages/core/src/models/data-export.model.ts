/**
 * PEZHWAN — Data export record model (GDPR right-to-data-portability).
 */
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface DataExportDoc {
  userId: string;
  tenantId?: string;
  scope: string[];
  status: 'pending' | 'processing' | 'ready' | 'failed';
  format: 'json' | 'csv';
  url?: string;
  expiresAt?: Date;
  requestedAt: Date;
  completedAt?: Date;
  error?: string;
}

const DataExportSchema = new Schema<DataExportDoc>(
  {
    userId: { type: String, required: true, index: true },
    tenantId: { type: String },
    scope: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'processing', 'ready', 'failed'], default: 'pending', index: true },
    format: { type: String, enum: ['json', 'csv'], default: 'json' },
    url: { type: String },
    expiresAt: { type: Date },
    requestedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true },
);

export const DataExportModel: Model<DataExportDoc> =
  (models.DataExport as Model<DataExportDoc>) ?? model<DataExportDoc>('DataExport', DataExportSchema);