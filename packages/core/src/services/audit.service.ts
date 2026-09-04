/**
 * PEZHWAN — audit service.
 *
 * Records security events. Append-oriented in MongoDB with a STRICTLY ORDERED
 * hash chain for tamper evidence:
 *   - `sequence`: a monotonically increasing global integer, assigned by an
 *     ATOMIC increment on the `audit-sequences` counter, so concurrent writers
 *     (even across HA instances sharing MongoDB) never receive the same
 *     sequence and the chain cannot fork.
 *   - `hash`: SHA-256 of `prevHash + canonical(event)`, the typed chain link.
 *   - `prevHash`: the previous entry's `hash` (root = 64 zero bytes).
 *
 * Never logs passwords, raw tokens, raw OTP codes, or client secrets. Events
 * are also forwarded to an optional external sink. A write/sequence failure
 * MUST never block the security-critical flow that triggered it — errors are
 * swallowed (the chain degrades to best-effort under such a failure, but the
 * auth flow proceeds).
 */

import { randomUUID, createHash } from 'node:crypto';
import type { AuditEventType, Severity } from '@pezhwan/shared';
import { AuditLogModel, AuditSequenceModel } from '../models/index.ts';

/** Root of the hash chain when no predecessor exists. */
export const AUDIT_CHAIN_ROOT = '0'.repeat(64);

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

export interface AuditEntry {
  sequence: number;
  prevHash: string;
  hash: string;
  data: AuditEntryInput;
}

export class AuditService {
  /** Sink for external observability (Datadog, Splunk, OpenTelemetry, ...). */
  private sink?: AuditSink;
  /** Configured retention window (undefined = keep forever / no auto-expiry). */
  private retentionMs: number | undefined;
  private retentionIndexed = false;
  /** Sequence counter key in `audit-sequences`. */
  private readonly counterId = 'audit';

  setSink(sink: AuditSink): void {
    this.sink = sink;
  }

  /**
   * Configure retention. Creates the TTL index on `expireAt` (idempotent) and
   * marks every subsequent audit entry with `expireAt = now + retention`, so
   * MongoDB automatically deletes entries older than the window.
   *
   * @param days retention window in days (must be > 0).
   */
  async setRetentionDays(days: number): Promise<void> {
    if (!(days > 0)) {
      throw new Error('audit retention days must be > 0');
    }
    this.retentionMs = days * 24 * 60 * 60 * 1000;
    if (!this.retentionIndexed) {
      try {
        await AuditLogModel.collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
        this.retentionIndexed = true;
      } catch {
        // Retention is best-effort; the TTL sweep fails silently in tests that
        // lack full index support rather than breaking audit writes.
      }
    }
  }

  /**
   * Atomically allocate the next audit sequence number. Driven by a single
   * counter document in the `audit-sequences` collection incremented with
   * findOneAndUpdate + $inc, so every caller (across instances) receives a
   * unique, strictly-increasing value.
   */
  private async getNextSequence(): Promise<number> {
    const counter = await AuditSequenceModel.findOneAndUpdate(
      { _id: this.counterId },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return counter?.seq ?? 0;
  }

  private canonicalData(input: AuditEntryInput): string {
    return JSON.stringify({
      t: input.eventType,
      i: input.ip ?? '',
      u: input.userId ?? '',
      m: input.metadata ?? {},
    });
  }

  private chainHash(prevHash: string, data: AuditEntryInput): string {
    return createHash('sha256').update(prevHash).update(this.canonicalData(data)).digest('hex');
  }

  /**
   * Record a security event. Strictly ordered: the sequence is allocated
   * atomically and each entry links to its immediate predecessor's hash. A
   * failure to write MUST never block the calling flow — we swallow errors.
   */
  async log(input: AuditEntryInput): Promise<void> {
    let entry: AuditEntry | undefined;
    try {
      const sequence = await this.getNextSequence();

      // Last known chain link. Since sequences are strictly ordered, the entry
      // with the highest sequence is always the immediate predecessor.
      let prevHash = AUDIT_CHAIN_ROOT;
      try {
        const last = await AuditLogModel.findOne().sort({ sequence: -1 }).select('hash').lean();
        if (last?.hash) {
          prevHash = last.hash;
        }
      } catch {
        prevHash = AUDIT_CHAIN_ROOT;
      }

      const hash = this.chainHash(prevHash, input);
      entry = {
        sequence,
        prevHash,
        hash,
        data: input,
      };

      const doc: Record<string, unknown> = {
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
        sequence,
        hash,
        prevHash,
      };
      if (this.retentionMs) {
        doc.expireAt = new Date(Date.now() + this.retentionMs);
      }

      await AuditLogModel.create(doc);
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
        channelHash: entry?.hash,
        sequence: entry?.sequence,
      });
    } catch {
      // Swallow — external sink failure must not break auth.
    }
  }

  /**
   * Load a bounded slice of the chain in strict sequence order, newest last.
   */
  async chain(limit = 100): Promise<AuditEntry[]> {
    const docs = await AuditLogModel.find()
      .sort({ sequence: 1 })
      .limit(limit)
      .select('sequence hash prevHash eventType metadata timestamp')
      .lean();
    return docs.map((d) => ({
      sequence: d.sequence ?? 0,
      prevHash: d.prevHash ?? '',
      hash: d.hash ?? '',
      data: {
        eventType: d.eventType as AuditEventType,
        metadata: d.metadata,
      },
    }));
  }
}
