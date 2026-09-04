/**
 * PEZHWAN — Breach record model.
 *
 * Caches breached-credential ranges pulled from HIBP (k-anonymity protocol).
 * Only the SHA-1 hash prefix (first 5 chars) is stored, so the cache never
 * holds full password hashes.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface BreachRecordDoc {
  _id: Types.ObjectId;
  /** SHA-1 hash prefix (first 5 hex chars) as returned by HIBP. */
  hashPrefix: string;
  /** JSON array of suffix→count pairs for this prefix. */
  suffixes: string;
  fetchedAt: Date;
  createdAt: Date;
  __v?: number;
}

const schema = new Schema<BreachRecordDoc>(
  {
    hashPrefix: { type: String, required: true },
    suffixes: { type: String, required: true },
    fetchedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Only one cached range per prefix.
schema.index({ hashPrefix: 1 }, { unique: true });

export const BreachRecordModel: Model<BreachRecordDoc> =
  (models.BreachRecord as Model<BreachRecordDoc>) ||
  model<BreachRecordDoc>('BreachRecord', schema);