/**
 * PEZHWAN — password policy service.
 *
 * Enforced server-side at register, change-password and password-reset.
 */

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  /** Max bytes accepted (protects Argon2 hashing and login round-trips). */
  maxBytes: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  /** Disallow repeated characters 4+ times in a row (e.g. "aaaa"). */
  maxRepeatedRun: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  maxBytes: 72,
  requireLowercase: true,
  requireUppercase: true,
  requireDigit: true,
  requireSymbol: false,
  maxRepeatedRun: 4,
};

export interface PasswordValidationResult {
  ok: boolean;
  errors: string[];
}

/** Count UTF-8 bytes (Argon2 input size matters more than JS chars). */
export function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf-8');
}

/**
 * Evaluate a password against the policy. Returns a boolean + list of
 * human-readable reasons (safe to surface to the end user).
 */
export function evaluatePassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordValidationResult {
  const errors: string[] = [];

  if (byteLength(password) > policy.maxBytes) {
    errors.push(
      `Password must be at most ${policy.maxBytes} bytes (UTF-8).`,
    );
  }
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters.`);
  }
  if (password.length > policy.maxLength) {
    errors.push(`Password must be at most ${policy.maxLength} characters.`);
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter.');
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter.');
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    errors.push('Password must contain a digit.');
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain a symbol.');
  }
  const repeated = password.match(/(.)\1{3,}/);
  if (repeated && (repeated[1]?.length ?? 0) >= policy.maxRepeatedRun) {
    errors.push('Password must not contain long repeated runs.');
  }

  return { ok: errors.length === 0, errors };
}