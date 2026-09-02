/**
 * PEZHWAN — distributed rate limiter.
 *
 * Limits are keyed by (type, scope) where scope can be an IP, a user id, or an
 * application id. The limiter is a FIXED-WINDOW counter backed by an ATOMIC
 * increment (Redis INCR + one-time EXPIRE) so concurrent requests can never lose
 * increments and silently weaken the limit.
 *
 * Fault tolerance: when Redis is down (or never configured) the cache degrades
 * to a bounded process-local counter so the app keeps serving — but each
 * instance is then only watching its own traffic (documented degraded mode).
 */

import type { RedisCache } from './redisCache.ts';

export type RateLimitType =
  | 'login'
  | 'register'
  | 'otp'
  | 'refresh'
  | 'api'
  | 'mfa';

export interface RateLimitResult {
  allowed: boolean;
  /** Units remaining before the limit, expressed against `limit` (0 when denied). */
  remaining: number;
  retryAfterMs: number;
  /** Window budget. Always set — used for `X-RateLimit-Limit` headers. */
  limit: number;
}

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export class RateLimitService {
  private readonly rules = new Map<RateLimitType, RateLimitRule>();

  constructor(
    private readonly cache: RedisCache,
    rules?: Partial<Record<RateLimitType, RateLimitRule>>,
  ) {
    this.rules.set('login', rules?.login ?? { limit: 10, windowMs: 15 * 60_000 });
    this.rules.set('register', rules?.register ?? { limit: 10, windowMs: 15 * 60_000 });
    this.rules.set('otp', rules?.otp ?? { limit: 5, windowMs: 10 * 60_000 });
    this.rules.set('refresh', rules?.refresh ?? { limit: 30, windowMs: 15 * 60_000 });
    this.rules.set('api', rules?.api ?? { limit: 100, windowMs: 15 * 60_000 });
    this.rules.set('mfa', rules?.mfa ?? { limit: 10, windowMs: 10 * 60_000 });
  }

  /**
   * Consume one unit against `type` for `scope`. Returns whether the request
   * is allowed, how many remain, and the retry-after in ms when denied.
   *
   * The check-and-increment is a single atomic storage op, so concurrent
   * requests cannot overlap and lose increments.
   */
  async consume(
    type: RateLimitType,
    scope: string,
  ): Promise<RateLimitResult> {
    const rule = this.rules.get(type);
    if (!rule) {
      return {
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        retryAfterMs: 0,
        limit: Number.MAX_SAFE_INTEGER,
      };
    }
    const key = `rl:${type}:${scope}`.toLowerCase();
    const ttlSeconds = Math.max(1, Math.ceil(rule.windowMs / 1000));

    if (this.cache.incrementAndExpire) {
      const count = await this.cache.incrementAndExpire(key, ttlSeconds);
      if (count !== null) {
        if (count > rule.limit) {
          return { allowed: false, remaining: 0, retryAfterMs: rule.windowMs, limit: rule.limit };
        }
        return {
          allowed: true,
          remaining: rule.limit - count,
          retryAfterMs: 0,
          limit: rule.limit,
        };
      }
    }

    // Defensive fallback for stores that lack the atomic primitive. This is
    // inherently racy; the atomic path above is what real deployments use.
    let current = 0;
    try {
      const raw = await this.cache.get(key);
      current = raw ? (Number(raw) || 0) : 0;
    } catch {
      // fall through with current = 0
    }
    current += 1;
    await this.cache.set(key, String(current), ttlSeconds);
    if (current > rule.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: rule.windowMs, limit: rule.limit };
    }
    return {
      allowed: true,
      remaining: rule.limit - current,
      retryAfterMs: 0,
      limit: rule.limit,
    };
  }
}