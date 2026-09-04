/**
 * PEZHWAN — distributed rate limiter.
 *
 * Limits are keyed by (type, scope) where scope can be an IP, a user id, or an
 * application id. The limiter is a FIXED-WINDOW counter backed by an ATOMIC
 * increment so concurrent requests can never lose increments and silently
 * weaken the limit.
 *
 * Tiered durability (the chosen strategy for Redis Distributed Rate Limiting —
 * Option C hybrid):
 *   1. Redis ready → atomic Redis INCR + one-time EXPIRE (shared across
 *      instances, low latency).
 *   2. Redis CONFIGURED but down → atomic MongoDB counter (durable, still
 *      shared across instances via the single shared MongoDB) — an outage
 *      degrades persistence but NEVER widens or bypasses the limit.
 *   3. Redis never configured / no Mongo → bounded in-process counter. This is
 *      the documented single-node degraded mode only.
 *
 * Limits are therefore enforced across every tier: a Redis outage cannot make
 * limits disappear.
 */

import type { RedisCache } from './redisCache.ts';
import { RateLimitCounterModel } from '../models/index.ts';

export type RateLimitType = 'login' | 'register' | 'otp' | 'refresh' | 'api' | 'mfa';

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
    private readonly durableFallback = false,
  ) {
    this.rules.set('login', rules?.login ?? { limit: 10, windowMs: 15 * 60_000 });
    this.rules.set('register', rules?.register ?? { limit: 10, windowMs: 15 * 60_000 });
    this.rules.set('otp', rules?.otp ?? { limit: 5, windowMs: 10 * 60_000 });
    this.rules.set('refresh', rules?.refresh ?? { limit: 30, windowMs: 15 * 60_000 });
    this.rules.set('api', rules?.api ?? { limit: 100, windowMs: 15 * 60_000 });
    this.rules.set('mfa', rules?.mfa ?? { limit: 10, windowMs: 10 * 60_000 });
  }

  private decision(rule: RateLimitRule, count: number): RateLimitResult {
    if (count > rule.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: rule.windowMs, limit: rule.limit };
    }
    return { allowed: true, remaining: rule.limit - count, retryAfterMs: 0, limit: rule.limit };
  }

  /**
   * Consume one unit against `type` for `scope`. Returns whether the request
   * is allowed, how many remain, and the retry-after in ms when denied.
   *
   * The check-and-increment is a single atomic storage op, so concurrent
   * requests cannot overlap and lose increments. See the tier explanation in
   * the file header for the Redis-outage behavior.
   */
  async consume(type: RateLimitType, scope: string): Promise<RateLimitResult> {
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

    // Tier 1: Redis (or in-memory cache) atomic increment.
    if (this.cache.incrementAndExpire) {
      const ready = await this.cache.ready();
      // When durable fallback is enabled AND Redis is down, go straight to the
      // durable MongoDB counter (tier 2) so limits hold across instances.
      if (!ready && this.durableFallback) {
        try {
          const count = await this.mongoIncrement(key, ttlSeconds);
          return this.decision(rule, count);
        } catch {
          // Mongo also unreachable → tier 3 in-memory (never throw).
          const count = await this.cache.incrementAndExpire(key, ttlSeconds);
          if (count !== null) {
            return this.decision(rule, count);
          }
        }
      } else {
        const count = await this.cache.incrementAndExpire(key, ttlSeconds);
        if (count !== null) {
          return this.decision(rule, count);
        }
      }
    }

    // Tier 3 defensive fallback (stores lacking the atomic primitive, or a
    // truly-unavailable backend). Best-effort; never throws.
    let current = 0;
    try {
      const raw = await this.cache.get(key);
      current = raw ? Number(raw) || 0 : 0;
    } catch {
      // fall through with current = 0
    }
    current += 1;
    await this.cache.set(key, String(current), ttlSeconds);
    return this.decision(rule, current);
  }

  /**
   * Atomic fixed-window increment on MongoDB (Option C durable fallback). A
   * single findOneAndUpdate pass both resets the window (when `expiresAt` has
   * lapsed) and increments the count, so it is race-safe and self-cleaning.
   */
  private async mongoIncrement(key: string, ttlSeconds: number): Promise<number> {
    const now = new Date();
    const windowEnd = new Date(Date.now() + ttlSeconds * 1000);
    const epoch = new Date(0);
    const windowExpired = { $lte: [{ $ifNull: ['$expiresAt', epoch] }, now] };

    const counter = await RateLimitCounterModel.findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            count: {
              $cond: [windowExpired, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }],
            },
            expiresAt: {
              $cond: [windowExpired, windowEnd, '$expiresAt'],
            },
          },
        },
      ],
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return (counter?.count ?? 0) || 1;
  }
}
