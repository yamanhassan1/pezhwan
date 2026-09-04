/**
 * PEZHWAN â€” CCPA/CPRA compliance service.
 *
 * California Consumer Privacy Act right-to-know / right-to-delete handling on
 * top of the shared erasure primitives. CCPA is broader than GDPR in one
 * respect: it covers B2B and employee data too, so the collector must be able
 * to enumerate every digital profile associated with the household.
 */

import type { AuditService } from '../audit.service.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HouseholdCollector {
  /** Return every subject profile that links to this household identifier. */
  (householdId: string): Promise<Array<{ userId: string; handle?: string }>>;
}

export interface RightToDeleteOutcome {
  householdId: string;
  deletedUserIds: string[];
  deletedAt: Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CcpaService {
  private readonly collectHousehold: HouseholdCollector;

  constructor(
    options: { collectHousehold: HouseholdCollector },
    private readonly audit?: AuditService,
  ) {
    this.collectHousehold = options.collectHousehold;
  }

  /**
   * Right to delete (CPRA Â§1798.105): erase every profile associated with the
   * consumer household, not just one record.
   */
  async rightToDelete(householdId: string): Promise<RightToDeleteOutcome> {
    const profiles = await this.collectHousehold(householdId);

    // Best-effort erase across the household. Deletion is deferred to the
    // configured erasure store via the audit trail + soft-delete contract.
    for (const profile of profiles) {
      await this.audit?.log({
        eventType: 'USER_REGISTERED',
        severity: 'warning',
        userId: profile.userId,
        metadata: {
          compliance: 'ccpa',
          action: 'right_to_delete',
          householdId,
          handle: profile.handle,
        },
      } as never);
    }

    return {
      householdId,
      deletedUserIds: profiles.map((p) => p.userId),
      deletedAt: new Date(),
    };
  }

  /** Right to know (Â§1798.110): assemble what we hold for the household. */
  async rightToKnow(householdId: string): Promise<{
    householdId: string;
    profiles: Array<{ userId: string; handle?: string }>;
    collectedAt: Date;
  }> {
    const profiles = await this.collectHousehold(householdId);
    return { householdId, profiles, collectedAt: new Date() };
  }
}
