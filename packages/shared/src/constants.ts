/**
 * PEZHWAN — shared constants and configuration options.
 */

import type { JwtAlgorithm } from './types.ts';

/** Default token/session lifetimes (milliseconds). */
export const DEFAULT_TTL = {
  ACCESS_TOKEN_MS: 15 * 60 * 1000, // 15 minutes
  REFRESH_TOKEN_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  SESSION_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  OTP_MS: 5 * 60 * 1000, // 5 minutes
  VERIFICATION_TOKEN_MS: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET_TOKEN_MS: 15 * 60 * 1000, // 15 minutes
  EMAIL_VERIFICATION_MS: 24 * 60 * 60 * 1000,
} as const;

/** Default rate-limit windows (requests / window ms). */
export const DEFAULT_RATE_LIMITS = {
  LOGIN: { limit: 10, windowMs: 15 * 60 * 1000 },
  REGISTER: { limit: 10, windowMs: 15 * 60 * 1000 },
  OTP: { limit: 5, windowMs: 10 * 60 * 1000 },
  REFRESH: { limit: 30, windowMs: 15 * 60 * 1000 },
  API: { limit: 100, windowMs: 15 * 60 * 1000 },
} as const;

/** Default account lockout policy. */
export const DEFAULT_LOCKOUT = {
  MAX_ATTEMPTS: 5,
  DURATION_MS: 15 * 60 * 1000, // 15 minutes
} as const;

/** Default OTP policy. */
export const DEFAULT_OTP = {
  LENGTH: 6,
  TTL_MS: 5 * 60 * 1000,
  MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_MS: 30_000,
} as const;

/** Default cookie names. */
export const DEFAULT_COOKIE = {
  ACCESS: 'pezhwan_access',
  REFRESH: 'pezhwan_refresh',
  CSRF: 'pezhwan_csrf',
} as const;

/** Default JWT issuer/audience placeholders (override via config). */
export const DEFAULT_JWT = {
  ALGORITHM: 'RS256' as JwtAlgorithm,
  SERVICE_AUDIENCE: 'pezhwan.services',
  CLIENT_AUDIENCE: 'pezhwan.clients',
} as const;

/** OTP purposes. */
export const OTP_PURPOSE = {
  LOGIN: 'login',
  VERIFY_EMAIL: 'verify_email',
  VERIFY_PHONE: 'verify_phone',
  PASSWORD_RESET: 'password_reset',
  CHANGE_EMAIL: 'change_email',
  CHANGE_PHONE: 'change_phone',
} as const;

export type OtpPurpose = (typeof OTP_PURPOSE)[keyof typeof OTP_PURPOSE];

/** OTP channels. */
export const OTP_CHANNEL = {
  EMAIL: 'email',
  PHONE: 'phone',
} as const;

export type OtpChannel = (typeof OTP_CHANNEL)[keyof typeof OTP_CHANNEL];
