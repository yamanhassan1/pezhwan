/**
 * PEZHWAN — Decoy (honeypot) user service.
 *
 * Watches for login attempts against decoy users. Attackers probing
 * credentials (password spraying, credential stuffing) will hit decoys that
 * look like real users but can never authenticate. ANY attempt against a
 * decoy is a high-confidence intrusion signal.
 *
 * Flow:
 *   - The auth pipeline calls `probe(handle, ip)` for every login attempt.
 *   - If the handle matches an active decoy, the detector records the hit,
 *     returns `isDecoy: true` (so the pipeline can "authenticate" slowly and
 *     reject), and raises a critical security event.
 */

import { DecoyUserModel } from '../../models/index.ts';
import type { AuditService } from '../audit.service.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecoyProbeResult {
  isDecoy: boolean;
  decoyId?: string;
  hitCount?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DecoyService {
  constructor(private readonly audit?: AuditService) {}

  /**
   * Probe a login handle. Returns whether the handle belongs to a decoy and,
   * if so, records the attempt (rate-limits emailing to avoid alert storms).
   */
  async probe(tenantId: string, handle: string, ip?: string): Promise<DecoyProbeResult> {
    const decoy = await DecoyUserModel.findOne({ tenantId, handle, isActive: true }).lean();
    if (!decoy) return { isDecoy: false };

    const updated = await DecoyUserModel.findOneAndUpdate(
      { _id: decoy._id },
      {
        $inc: { hitCount: 1 },
        $set: { lastAttemptAt: new Date(), lastAttemptIp: ip },
      },
      { new: true, projection: { hitCount: 1 } },
    );

    const hitCount = updated?.hitCount ?? decoy.hitCount + 1;

    // Alert on the first hit, then at thresholds — avoids an alert per attempt.
    if (hitCount === 1 || hitCount % 10 === 0) {
      await this.audit?.log({
        eventType: 'LOGIN_FAILED',
        severity: 'critical',
        tenantId,
        ip,
        metadata: { signal: 'decoy_hit', decoyHandle: handle, hitCount },
      } as never);
    }

    return { isDecoy: true, decoyId: String(decoy._id), hitCount };
  }

  /**
   * Register a new decoy user (operator-driven). The password hash stored is a
   * random throwaway so it never collides with a real credential.
   */
  async createDecoy(params: {
    tenantId: string;
    handle: string;
    description?: string;
    passwordHash?: string;
  }): Promise<string> {
    const doc = await DecoyUserModel.create({
      tenantId: params.tenantId,
      handle: params.handle,
      passwordHash:
        params.passwordHash ?? `decoy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      description: params.description,
      isActive: true,
      hitCount: 0,
    });
    return String(doc._id);
  }

  /** List active decoys for a tenant (operator console). */
  async listDecoys(tenantId: string): Promise<
    Array<{
      id: string;
      handle: string;
      description?: string;
      hitCount: number;
      lastAttemptAt?: Date | null;
      lastAttemptIp?: string;
    }>
  > {
    const docs = await DecoyUserModel.find({ tenantId, isActive: true })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((d) => ({
      id: String(d._id),
      handle: d.handle,
      description: d.description,
      hitCount: d.hitCount,
      lastAttemptAt: d.lastAttemptAt,
      lastAttemptIp: d.lastAttemptIp,
    }));
  }

  /** Deactivate a decoy (stops triggering but keeps history). */
  async deactivate(tenantId: string, decoyId: string): Promise<void> {
    await DecoyUserModel.updateOne({ _id: decoyId, tenantId }, { $set: { isActive: false } });
  }
}
