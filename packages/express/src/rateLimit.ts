/**
 * PEZHWAN — Express rate-limiting middleware.
 *
 * Wraps the core `RateLimitService.consume()` so the HTTP surface actually
 * enforces the configured budgets (login, register, otp, refresh, api, mfa).
 * Obeys the documented degradation policy: if the limiter itself fails the
 * request is allowed through (availability over strictness — Redis is an
 * optimiser, never a gate).
 *
 * On denial it answers 429 with a `Retry-After` header plus `X-RateLimit-*`
 * headers on both allowed and denied responses.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { RateLimitType } from '@pezhwan/core';
import type { PezhwanRuntime } from '@pezhwan/core';

export interface RateLimitOptions {
  /** Which budget this route draws from (login/register/otp/refresh/api/mfa). */
  type: RateLimitType;
  /**
   * Optional scope extractor. Defaults to the client IP. Pass a custom
   * extractor for authenticated endpoints (e.g. scope by userId or OAuth
   * clientId) where IP-based limits would unfairly share a NAT.
   */
  scope?: (req: Request) => string;
}

function defaultScope(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0';
}

export function rateLimit(
  runtime: PezhwanRuntime,
  options: RateLimitOptions,
): RequestHandler {
  const scopeOf = options.scope ?? defaultScope;
  const type = options.type;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await runtime.rateLimiter.consume(type, scopeOf(req));
      if (result.limit !== Number.MAX_SAFE_INTEGER) {
        res.setHeader('X-RateLimit-Limit', String(result.limit));
        res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      }
      if (result.allowed) {
        return next();
      }
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
      );
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          retryAfterMs: result.retryAfterMs,
          requestId: (req as Request & { requestId?: string }).requestId,
        },
      });
    } catch {
      // Availability over strictness: if the limiter throws (it should not —
      // consume degrades internally), do not block the request on our own
      // defence being down.
      return next();
    }
  };
}