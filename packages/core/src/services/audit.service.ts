/**
 * PEZHWAN — audit service.
 *
 * Records security events. Append-oriented in MongoDB with a prevHash chain
 * for tamper evidence. Never logs passwords, raw tokens, raw OTP codes, or
 * client secrets. Events are also forwarded to an optional external sink.
 */

import { randomUUID, createHash } from 'node:crypto';
import type { AuditEventType, Severity } from '@pezhwan/shared';
import { AuditLogModel } from '../models/index.ts';

export interface AuditEntryInput {
  eventType: AuditEventType;
  severity?: Severity;
  tenantId?: string;
  applicationId?: string;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditSink {
  (entry: Record<string, unknown>): Promise<void> | void;
}

export class AuditService {
  /** Sink for external observability (Datadog, Splunk, OpenTelemetry, ...). */
  private sink?: AuditSink;

  setSink(sink: AuditSink): void {
    this.sink = sink;
  }

  /**
   * Record a security event. A failure to write the audit log must NEVER
   * block the security-critical flow that triggered it — we swallow errors.
   */
  async log(input: AuditEntryInput): Promise<void> {
    // Last known chain marker. In HA the chain is best-effort; the marker
    // still makes tampering detectably break the sequence when present.
    let prevHash: string | undefined;
    try {
      const last = await AuditLogModel.findOne().sort({ _id: -1 }).lean();
      prevHash = (last as { prevHash?: string } | null)?.prevHash;
    } catch {
      prevHash = undefined;
    }

    const chainInput = JSON.stringify({
      t: input.eventType,
      i: input.ip ?? '',
      u: input.userId ?? '',
      m: input.metadata ?? {},
      p: prevHash ?? '',
    });
    const chain = createHash('sha256').update(chainInput).digest('hex');

    try {
      await AuditLogModel.create({
        timestamp: new Date(),
        eventType: input.eventType,
        severity: input.severity ?? 'info',
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        userId: input.userId,
        sessionId: input.sessionId,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: input.metadata ?? {},
        prevHash: chain,
      });
    } catch {
      // Swallow — logging must not break auth.
    }

    try {
      await this.sink?.({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: input.eventType,
        severity: input.severity ?? 'info',
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        userId: input.userId,
        sessionId: input.sessionId,
        ip: input.ip,
        channelHash: chain,
      });
    } catch {
      // Swallow — external sink failure must not break auth.
    }
  }
}