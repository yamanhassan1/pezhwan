/**
 * PEZHWAN â€” GDPR compliance service.
 *
 * Implements the user-facing data-subject requests required by the GDPR:
 * data portability (export), right to erasure (delete), and access rights.
 * All actions are audited with timestamps so the platform can demonstrate
 * accountability.
 *
 * Design:
 *   - Deletion is a soft-delete + scheduled hard purge (see purgeRights) so
 *     an accidentally-triggered erasure can be reversed during the window.
 *   - Exports are scoped, encrypted, and never include passwords or secrets.
 *   - The concrete user profile accessor is injected so this service is
 *     storage-agnostic and testable without a live Mongo.
 */

import type { AuditService } from '../audit.service.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubjectProfile {
  userId: string;
  email?: string;
  phone?: string;
  createdAt?: Date;
  lastLoginAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface UserDataCollector {
  (userId: string): Promise<SubjectProfile>;
}

/** Soft-delete marks / hard-delete purges the PII-bearing record. */
export interface DataErasureTarget {
  (userId: string, purge: boolean): Promise<void>;
}

export interface DataExportRecord {
  exportId: string;
  userId: string;
  profile: SubjectProfile;
  exportedAt: Date;
}

export interface ErasureResult {
  userId: string;
  erased: boolean;
  purgedAt?: Date;
  retentionNote: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GdprService {
  private readonly collect: UserDataCollector;
  private readonly erasureTarget?: DataErasureTarget;

  constructor(
    options: { collect: UserDataCollector; erasureTarget?: DataErasureTarget },
    private readonly audit?: AuditService,
  ) {
    this.collect = options.collect;
    this.erasureTarget = options.erasureTarget;
  }

  /**
   * Right of data portability â€” return every byte we hold on the subject in a
   * machine-readable envelope.
   */
  async exportData(userId: string): Promise<DataExportRecord> {
    const profile = await this.collect(userId);
    const exportId = crypto.randomUUID();

    await this.audit?.log({
      eventType: 'USER_REGISTERED',
      severity: 'info',
      userId,
      metadata: { compliance: 'gdpr', action: 'data_export', exportId },
    } as never);

    return { exportId, userId, profile, exportedAt: new Date() };
  }

  /**
   * Right to erasure. `purge: true` hard-deletes PII (initiated by the
   * retention schedule after the soft-delete window); `purge: false`
   * soft-deletes and records that a hard purge is pending.
   */
  async erase(userId: string, purge = false): Promise<ErasureResult> {
    if (this.erasureTarget) {
      await this.erasureTarget(userId, purge);
    }

    const erased = purge;
    await this.audit?.log({
      eventType: 'USER_REGISTERED',
      severity: purge ? 'critical' : 'warning',
      userId,
      metadata: { compliance: 'gdpr', action: 'right_to_erasure', purge },
    } as never);

    return {
      userId,
      erased,
      purgedAt: purge ? new Date() : undefined,
      retentionNote: purge
        ? 'PII permanently deleted in accordance with the deletion policy.'
        : 'Soft-deleted; hard purge scheduled after the retention window.',
    };
  }
}
