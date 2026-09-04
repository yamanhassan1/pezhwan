/**
 * PEZHWAN â€” HIPAA compliance service.
 *
 * Provides the audit and access-control hooks needed to demonstrate HIPAA
 * compliance for platforms that handle PHI (Protected Health Information):
 *   - PHI access audit trail
 *   - Minimum-necessary access reviews
 *   - BAA (Business Associate Agreement) tracking
 *
 * The service records every PHI read/write with who/what/when so covered
 * entities can respond to an access disclosure inquiry.
 */

import type { AuditService } from '../audit.service.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhiAccessEvent {
  userId: string;
  subjectId: string;
  action: 'read' | 'write' | 'delete';
  resource: string;
  reason?: string;
  ip?: string;
}

export interface BaaRecord {
  organizationId: string;
  signedAt: Date;
  version: string;
  status: 'active' | 'expiring' | 'expired';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HipaaService {
  constructor(private readonly audit?: AuditService) {}

  /**
   * Log a PHI access event. Required for demonstrating "who accessed whose
   * PHI, when, why" â€” the core HIPAA Privacy Rule accountability requirement.
   */
  async recordPhiAccess(event: PhiAccessEvent): Promise<void> {
    await this.audit?.log({
      eventType: 'AUTHZ_DENIED',
      severity: 'info',
      userId: event.userId,
      ip: event.ip,
      metadata: {
        compliance: 'hipaa',
        action: event.action,
        resource: event.resource,
        subjectId: event.subjectId,
        reason: event.reason,
      },
    } as never);
  }

  /**
   * Minimum-necessary review: flag an access pattern that exceeds the
   * "minimum necessary" standard (e.g. a role reading PHI it does not need).
   */
  async flagExcessiveAccess(params: {
    userId: string;
    resource: string;
    detail: string;
  }): Promise<void> {
    await this.audit?.log({
      eventType: 'AUTHZ_DENIED',
      severity: 'warning',
      userId: params.userId,
      metadata: {
        compliance: 'hipaa',
        finding: 'minimum_necessary_exceeded',
        resource: params.resource,
        detail: params.detail,
      },
    } as never);
  }

  /** Assess BAA status for an organization (for the compliance dashboard). */
  assessBaa(record: BaaRecord): BaaRecord['status'] {
    if (record.status === 'expired') return 'expired';
    const daysLeft = (record.signedAt.getTime() + 365 * 24 * 60 * 60_000 - Date.now()) / 86_400_000;
    if (daysLeft < 30) return 'expiring';
    return 'active';
  }
}
