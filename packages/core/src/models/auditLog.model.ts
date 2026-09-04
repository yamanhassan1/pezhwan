/**
 * PEZHWAN — Audit log model.
 *
 * Append-oriented, tamper-resistant security audit. Each record carries a
 * `prevHash` chain marker so any silent modification is detectable. Never log
 * passwords, tokens, OTP codes, or client secrets.
 */

import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import type { AuditEventType, Severity } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

export interface AuditLogDoc {
  timestamp: Date;
  eventType: AuditEventType | string;
  severity: Severity;
  tenantId?: string;
  applicationId?: string;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  /** Monotonically increasing global sequence — strict ordering under concurrency. */
  sequence?: number;
  /** SHA-256 of `prevHash + canonical(data)` — the typed chain link. */
  hash?: string;
  /** SHA-256 of the immediately preceding audit entry's `hash` (chain anchor). */
  prevHash?: string;
  /** TTL pivot for configurable retention (unset = no auto-expiry). */
  expireAt?: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    eventType: { type: String, required: true, index: true },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
    },
    tenantId: { type: String, index: true },
    applicationId: { type: String, index: true },
    userId: { type: String, index: true },
    sessionId: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    sequence: { type: Number },
    hash: { type: String },
    prevHash: { type: String },
    expireAt: { type: Date },
  },
  { versionKey: false },
);

// Global monotonic sequence must be unique: gating enforcement of strict
// ordering and rejecting any duplicate/gapped insert.
auditLogSchema.index({ sequence: 1 }, { unique: true, sparse: true });
// Common query patterns for the admin console.
auditLogSchema.index({ tenantId: 1, userId: 1, timestamp: -1 });
// Retention is configured at runtime via AuditService.setRetentionDays, which
// creates the TTL index on `expireAt`. Not hard-coded here to allow admin
// control.

export const AuditLogModel: Model<AuditLogDoc> =
  (models.AuditLog as Model<AuditLogDoc>) || model<AuditLogDoc>('AuditLog', auditLogSchema);

/**
 * Distributed sequence generator for the audit chain ("audit-sequences").
 *
 * A single counter document is incremented ATOMICALLY with findOneAndUpdate +
 * $inc, so concurrent writers receive unique, strictly-increasing sequence
 * numbers even across multiple instances sharing one MongoDB. This is the
 * single-writer arbitration that prevents the audit chain from forking.
 */
export interface AuditSequenceDoc {
  _id: string;
  seq: number;
}

export const AuditSequenceModel: Model<AuditSequenceDoc> =
  (models.AuditSequence as Model<AuditSequenceDoc>) ||
  model<AuditSequenceDoc>(
    'AuditSequence',
    new Schema<AuditSequenceDoc>(
      {
        _id: { type: String, required: true },
        seq: { type: Number, default: 0 },
      },
      { versionKey: false },
    ),
  );
