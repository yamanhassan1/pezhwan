/**
 * PEZHWAN — validation utilities built on the shared regex catalog.
 */

import {
  EMAIL_RE,
  PHONE_RE,
  UUID_RE,
  SLUG_RE,
  BASE64URL_RE,
  PASSWORD_LOWERCASE_RE,
  PASSWORD_UPPERCASE_RE,
  PASSWORD_DIGIT_RE,
  PASSWORD_SYMBOL_RE,
} from './regex.ts';
import { PASSWORD_POLICY } from '../constants/policies.ts';

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export function isPhone(value: string): boolean {
  return PHONE_RE.test(value);
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isSlug(value: string): boolean {
  return SLUG_RE.test(value);
}

export function isBase64Url(value: string): boolean {
  return BASE64URL_RE.test(value);
}

/** Whether a password satisfies the configured composition policy. */
export function isStrongPassword(
  value: string,
  policy = PASSWORD_POLICY,
): boolean {
  if (value.length < policy.MIN_LENGTH || value.length > policy.MAX_LENGTH) {
    return false;
  }
  if (policy.REQUIRE_LOWERCASE && !PASSWORD_LOWERCASE_RE.test(value)) return false;
  if (policy.REQUIRE_UPPERCASE && !PASSWORD_UPPERCASE_RE.test(value)) return false;
  if (policy.REQUIRE_DIGIT && !PASSWORD_DIGIT_RE.test(value)) return false;
  if (policy.REQUIRE_SYMBOL && !PASSWORD_SYMBOL_RE.test(value)) return false;
  return true;
}

/** Returns an OWASP-style entropy score (0..4). */
export function evaluatePasswordStrength(value: string): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  let classes = 0;
  if (PASSWORD_LOWERCASE_RE.test(value)) classes += 1;
  if (PASSWORD_UPPERCASE_RE.test(value)) classes += 1;
  if (PASSWORD_DIGIT_RE.test(value)) classes += 1;
  if (PASSWORD_SYMBOL_RE.test(value)) classes += 1;
  if (classes >= 3) score += 1;
  if (classes >= 4 && value.length >= 12) score += 1;
  if (value.length < 8) reasons.push('password is too short');
  if (value.length > PASSWORD_POLICY.MAX_LENGTH) reasons.push('password is too long');
  if (!isStrongPassword(value)) reasons.push('fails the composition policy');
  return { score: Math.min(score, 4), reasons };
}
