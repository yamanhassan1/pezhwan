/**
 * PEZHWAN — one-time authorization-code lifecycle.
 *
 * Raw codes are never stored; only their SHA-256 hash is, so a database
 * compromise yields no redeemable codes. Codes are single-use and expire.
 */

import type { AuthMethod, AuthorizationCode } from '@pezhwan/shared';
import { sha256Hex, randomToken } from '@pezhwan/shared';

export interface AuthorizationCodeParams {
  tenantId: string;
  applicationId: string;
  clientId: string;
  userId: string;
  sessionId: string;
  redirectUri: string;
  scope: string[];
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain' | null;
  nonce?: string | null;
  authMethod: AuthMethod;
  ttlMs?: number;
}

/** Storage contract for authorization codes. */
export interface AuthorizationCodeStore {
  create(record: AuthorizationCode): AuthorizationCode | Promise<AuthorizationCode>;
  findByHash(codeHash: string): AuthorizationCode | null | Promise<AuthorizationCode | null>;
  consume(id: string, at?: Date): boolean | Promise<boolean>;
}

/** In-memory store (tests, single-instance deployments). */
export class MemoryAuthorizationCodeStore implements AuthorizationCodeStore {
  private readonly records = new Map<string, AuthorizationCode>();

  create(record: AuthorizationCode): AuthorizationCode {
    this.records.set(record.id, record);
    return record;
  }

  findByHash(codeHash: string): AuthorizationCode | null {
    for (const record of this.records.values()) {
      if (record.codeHash === codeHash) {
        return record;
      }
    }
    return null;
  }

  consume(id: string, at = new Date()): boolean {
    const record = this.records.get(id);
    if (!record || record.consumedAt) {
      return false;
    }
    this.records.set(id, { ...record, consumedAt: at });
    return true;
  }

  get size(): number {
    return this.records.size;
  }
}

const DEFAULT_CODE_TTL_MS = 5 * 60 * 1000;

/** Issues and redeems hashed, single-use authorization codes. */
export class AuthorizationCodeManager {
  constructor(private readonly store: AuthorizationCodeStore) {}

  get storeRef(): AuthorizationCodeStore {
    return this.store;
  }

  async issue(
    params: AuthorizationCodeParams,
  ): Promise<{ code: string; record: AuthorizationCode }> {
    const code = randomToken(32);
    const now = new Date();
    const record: AuthorizationCode = {
      id: randomToken(16),
      codeHash: sha256Hex(code),
      tenantId: params.tenantId,
      applicationId: params.applicationId,
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge ?? null,
      codeChallengeMethod: params.codeChallengeMethod ?? null,
      nonce: params.nonce ?? null,
      authMethod: params.authMethod,
      expiresAt: new Date(now.getTime() + (params.ttlMs ?? DEFAULT_CODE_TTL_MS)),
      consumedAt: null,
      createdAt: now,
    };
    await this.store.create(record);
    return { code, record };
  }

  /**
   * Redeems a raw code. Returns the record exactly once and null for
   * unknown, consumed, or expired codes.
   */
  async redeem(rawCode: string): Promise<AuthorizationCode | null> {
    const record = await this.store.findByHash(sha256Hex(rawCode));
    if (!record || record.consumedAt || record.expiresAt <= new Date()) {
      return null;
    }
    const consumed = await this.store.consume(record.id);
    return consumed ? record : null;
  }
}
