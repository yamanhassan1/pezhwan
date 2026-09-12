/**
 * PEZHWAN — default security policies.
 *
 * These are safe defaults; deployments are expected to override them from
 * configuration without weakening the minimum bars below.
 */

/** Default password composition policy enforced by validation utilities. */
export const PASSWORD_POLICY = {
  MIN_LENGTH: 12,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_DIGIT: true,
  REQUIRE_SYMBOL: true,
} as const;

/** Default account lockout policy. */
export const LOCKOUT_POLICY = {
  MAX_ATTEMPTS: 5,
  DURATION_MS: 15 * 60 * 1000,
  FAILED_ATTEMPT_WINDOW_MS: 15 * 60 * 1000,
} as const;

/** Default device-binding and session-trust policy. */
export const DEVICE_POLICY = {
  REQUIRE_DEVICE_LABEL: true,
  TOKEN_VERSION_ROTATION: true,
  MAX_SESSIONS_PER_USER: 10,
} as const;

/** Default API-key policy. */
export const API_KEY_POLICY = {
  PREFIX: 'pzk_',
  BYTES: 32,
  MAX_KEYS_PER_APPLICATION: 100,
} as const;

/** Default backup-code policy. */
export const BACKUP_CODE_POLICY = {
  COUNT: 10,
  LENGTH: 10,
} as const;
