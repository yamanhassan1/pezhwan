/**
 * PEZHWAN — modular rate-limit facade.
 *
 * Kebab-case mirror of ./rateLimit.ts. Kept so both `rate-limit` and
 * `rateLimit` import paths resolve to the single real implementation.
 */

export { rateLimit, type RateLimitOptions } from './rateLimit.ts';
