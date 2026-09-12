/**
 * PEZHWAN — aggregated defaults for SDK entry points.
 */

import {
  DEFAULT_TTL,
  DEFAULT_RATE_LIMITS,
  DEFAULT_LOCKOUT,
  DEFAULT_OTP,
  DEFAULT_COOKIE,
  DEFAULT_JWT,
  OTP_PURPOSE,
  OTP_CHANNEL,
} from '../constants.ts';

/** Aggregated runtime defaults consumed by SDK entry points. */
export const DEFAULTS = {
  TTL: DEFAULT_TTL,
  RATE_LIMITS: DEFAULT_RATE_LIMITS,
  LOCKOUT: DEFAULT_LOCKOUT,
  OTP: DEFAULT_OTP,
  COOKIE: DEFAULT_COOKIE,
  JWT: DEFAULT_JWT,
} as const;

export { OTP_PURPOSE, OTP_CHANNEL };
