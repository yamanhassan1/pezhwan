/**
 * PEZHWAN — account state service.
 *
 * Per-request validation that the account behind a presented token still
 * exists, is active, and carries the same tokenVersion as when the token was
 * minted. Backed by a short Redis cache (Mongo is the source of truth). On a
 * Mongo read failure we THROW a security-critical error — the pipeline fails
 * closed (503), never grants on an unverifiable state.
 */

import { SecurityDependencyError } from '@pezhwan/shared';
import { UserModel } from '../models/index.ts';
import type { RedisCache } from './redisCache.ts';

export interface AccountState {
  exists: boolean;
  isActive: boolean;
  tokenVersionMatch: boolean;
}

const CACHE_TTL_SECONDS = 30;

export class AccountStateService {
  constructor(private readonly cache: RedisCache) {}

  private cacheKey(userId: string): string {
    return `accountState:${userId}`;
  }

  /**
   * Validate the account. `tokenVersion` is the version the access token was
   * minted with. Returns true only when the account exists, is active, and
   * the version matches.
   */
  async validate(userId: string, tokenVersion: number): Promise<boolean> {
    const cached = await this.cache.get(this.cacheKey(userId));
    if (cached) {
      const state = JSON.parse(cached) as AccountState;
      return state.exists && state.isActive && state.tokenVersionMatch;
    }

    let doc: {
      isActive?: boolean;
      tokenVersion?: number;
    } | null;
    try {
      doc = await UserModel.findById(userId)
        .select('isActive tokenVersion')
        .lean();
    } catch {
      throw new SecurityDependencyError(
        'Account state could not be verified',
        undefined,
        { requestId: undefined },
      );
    }

    const state: AccountState = {
      exists: Boolean(doc),
      isActive: doc?.isActive ?? false,
      tokenVersionMatch: Boolean(doc && doc.tokenVersion === tokenVersion),
    };
    await this.cache.set(
      this.cacheKey(userId),
      JSON.stringify(state),
      CACHE_TTL_SECONDS,
    );

    return state.exists && state.isActive && state.tokenVersionMatch;
  }

  /** Invalidate the cached account state (e.g. after password change). */
  async invalidate(userId: string): Promise<void> {
    await this.cache.del(this.cacheKey(userId));
  }
}