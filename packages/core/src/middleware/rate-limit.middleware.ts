/**
 * PEZHWAN — Rate-limit middleware.
 *
 * Frame-agnostic rate limiting over the core RateLimitService. Enforces
 * per-type (auth, api, brute_force) windows for a given scope key.
 */

import type { RateLimitService } from '../services/rateLimit.service.ts';
import type { RateLimitType } from '../services/rateLimit.service.ts';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  retryAfterSeconds?: number;
}

export class RateLimitMiddleware {
  constructor(private readonly service: RateLimitService) {}

  async enforce(type: RateLimitType, scope: string): Promise<RateLimitDecision> {
    const result = await this.service.consume(type, scope);
    const retryAfterSeconds = result.allowed ? 0 : Math.ceil(result.retryAfterMs / 1000);
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetInSeconds: retryAfterSeconds,
      ...(retryAfterSeconds > 0 ? { retryAfterSeconds } : {}),
    };
  }

  /** Convenience: ip-based scope builder. */
  scopeFor(ip: string, route: string): string {
    return `${ip}:${route}`;
  }
}