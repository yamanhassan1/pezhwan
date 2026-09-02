/**
 * PEZHWAN — Audit log model.
 *
 * Append-oriented, tamper-resistant security audit. Each record carries a
 * `prevHash` chain marker so any silent modification is detectable. Never log
 * passwords, tokens, OTP codes, or client secrets.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
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
  prevHash?: string;
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
    prevHash: { type: String },
  },
  { versionKey: false },
);

// Common query patterns for the admin console.
auditLogSchema.index({ tenantId: 1, userId: 1, timestamp: -1 });
// TTL retention (configurable; default 30 days via env at scan time if desired).
// Retention is intentionally NOT hard-coded here to allow admin configuration.

export const AuditLogModel: Model<AuditLogDoc> =
  (models.AuditLog as Model<AuditLogDoc>) ||
  model<AuditLogDoc>('AuditLog', auditLogSchema);