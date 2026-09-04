/**
 * PEZHWAN â€” PCI DSS compliance service.
 *
 * Provides the controls the platform needs to demonstrate PCI DSS alignment
 * for cardholder-data-adjacent systems (the identity layer itself does not
 * store card data, but separation of duties, logging, and scope reduction
 * still apply):
 *   - Tokenization of PAN-equivalent data (never store raw)
 *   - Separation of duties (no single role can do everything)
 *   - Access control and audit for systems in the CDE
 *
 * Tokenization here is a placeholder interface â€” production should delegate to
 * a certified tokenization vault or the acquiring bank's token service.
 */

import type { AuditService } from '../audit.service.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenVault {
  tokenize(pan: string): Promise<string>;
  detokenize(token: string): Promise<string | null>;
}

export interface PciDutyMatrix {
  /** Roles that must NOT be held by the same person per segregation. */
  incompatibleRoles: string[][];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PciDssService {
  constructor(
    private readonly vault?: TokenVault,
    private readonly audit?: AuditService,
  ) {}

  /**
   * Tokenize a PAN. The raw value never touches logs, memory pools, or
   * MongoDB â€” it is exchanged for a token via the vault.
   */
  async tokenize(pan: string): Promise<string> {
    if (!this.vault) {
      throw new Error('PCI tokenization vault not configured');
    }
    const token = await this.vault.tokenize(pan);
    await this.audit?.log({
      eventType: 'API_KEY_CREATED',
      severity: 'info',
      metadata: { compliance: 'pci', action: 'tokenize', scope: 'card_data' },
    } as never);
    return token;
  }

  /** Detect a separation-of-duties violation in a user's assigned roles. */
  checkSeparationOfDuties(userId: string, roles: string[], matrix: PciDutyMatrix): boolean {
    for (const incompatible of matrix.incompatibleRoles) {
      const overlap = incompatible.filter((r) => roles.includes(r));
      if (overlap.length > 1) {
        this.audit?.log({
          eventType: 'ROLE_CHANGED',
          severity: 'critical',
          userId,
          metadata: {
            compliance: 'pci',
            finding: 'separation_of_duties_violation',
            overlapping: overlap,
          },
        } as never);
        return false;
      }
    }
    return true;
  }

  /** Low-level CDE system access review (cron-friendly). */
  async reviewCdeAccess(findings: Array<{ userId: string; detail: string }>): Promise<void> {
    for (const f of findings) {
      await this.audit?.log({
        eventType: 'AUTHZ_DENIED',
        severity: 'warning',
        userId: f.userId,
        metadata: { compliance: 'pci', finding: 'cde_access_review', detail: f.detail },
      } as never);
    }
  }
}
