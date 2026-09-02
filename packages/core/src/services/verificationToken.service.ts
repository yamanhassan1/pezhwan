/**
 * PEZHWAN — verification token service.
 *
 * Issues and redeems short-lived, single-use, URL-safe tokens for:
 *   - email verification
 *   - password reset
 *   - magic-link login
 * Tokens are 32-byte opaque random strings; only the SHA-256 hash is stored.
 * Consumption is atomic (unique hash index) so a token can never be replayed.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import {
  NotFoundError,
  TokenError,
  ValidationError,
  AUDIT_EVENT,
} from '@pezhwan/shared';
import type { VerificationTokenKind } from '@pezhwan/shared';
import { VerificationTokenModel } from '../models/index.ts';
import type { AuditService } from './audit.service.ts';

export interface IssueTokenInput {
  kind: VerificationTokenKind;
  tenantId: string;
  applicationId: string;
  userId: string;
  target?: string;
  redirectUri?: string;
  ttlMs?: number;
}

export interface RedeemResult {
  userId: string;
  kind: VerificationTokenKind;
  tenantId: string;
  applicationId: string;
  target?: string;
  redirectUri?: string;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64');
}

function matchHash(a: string, b: string): boolean {
  const lhs = Buffer.from(a, 'base64');
  let rhs: Buffer;
  try {
    rhs = Buffer.from(b, 'base64');
  } catch {
    return false;
  }
  return lhs.length === rhs.length && timingSafeEqual(lhs, rhs);
}

export class VerificationTokenService {
  constructor(
    private readonly tenantId: string,
    private readonly applicationId: string,
    private readonly audit?: AuditService,
  ) {}

  /** Issue a fresh token for a purpose. Returns the RAW token (shown once). */
  async issue(input: IssueTokenInput): Promise<{ token: string; expiresIn: number }> {
    // Revoke any previously issued, un-consumed tokens of the same kind for
    // this user before issuing a replacement (one-live-token policy).
    await VerificationTokenModel.updateMany(
      {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        userId: input.userId,
        kind: input.kind,
        consumedAt: null,
      },
      { $set: { consumedAt: new Date() } },
    );

    const token = randomBytes(32).toString('base64url');
    const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
    await VerificationTokenModel.create({
      kind: input.kind,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      userId: input.userId,
      tokenHash: hashToken(token),
      target: input.target,
      redirectUri: input.redirectUri,
      expiresAt: new Date(Date.now() + ttlMs),
      consumedAt: null,
    });

    await this.audit?.log({
      eventType: AUDIT_EVENT.VERIFICATION_TOKEN_ISSUED,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      userId: input.userId,
      metadata: { kind: input.kind },
    });

    return { token, expiresIn: Math.floor(ttlMs / 1000) };
  }

  /**
   * Atomically consume a token. Idempotent-safe: a second redemption of the
   * same token throws a hard TokenError (no info leak about why it failed).
   */
  async redeem(token: string): Promise<RedeemResult> {
    const tokenHash = hashToken(token);
    const doc = await VerificationTokenModel.findOneAndUpdate(
      { tokenHash, consumedAt: null },
      { $set: { consumedAt: new Date() } },
      { new: true },
    );
    if (!doc) {
      throw new TokenError('Token is invalid or already used', 'INVALID_TOKEN');
    }
    // Verify the tenant-scope still matches (cross-tenant redemption is a bug).
    if (String(doc.tenantId) !== this.tenantId) {
      throw new TokenError('Token tenant mismatch', 'INVALID_TOKEN');
    }
    if (new Date(doc.expiresAt) < new Date()) {
      throw new TokenError('Token expired', 'TOKEN_EXPIRED');
    }
    if (String(doc.applicationId) !== this.applicationId) {
      throw new NotFoundError('Token application mismatch', 'INVALID_TOKEN');
    }

    await this.audit?.log({
      eventType: AUDIT_EVENT.VERIFICATION_TOKEN_USED,
      tenantId: String(doc.tenantId),
      applicationId: String(doc.applicationId),
      userId: String(doc.userId),
      metadata: { kind: doc.kind },
    });

    return {
      userId: String(doc.userId),
      kind: doc.kind,
      tenantId: String(doc.tenantId),
      applicationId: String(doc.applicationId),
      target: doc.target,
      redirectUri: doc.redirectUri,
    };
  }

  /** Convenience verifier without consuming (e.g. pre-flight checks). */
  async existsActive(
    kind: VerificationTokenKind,
    userId: string,
  ): Promise<boolean> {
    const count = await VerificationTokenModel.countDocuments({
      tenantId: this.tenantId,
      applicationId: this.applicationId,
      userId,
      kind,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    });
    return count > 0;
  }
}