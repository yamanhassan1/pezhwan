/**
 * PEZHWAN — OTP (one-time password) generation and constant-time verification.
 */

import { randomInt, createHash, timingSafeEqual } from 'node:crypto';

const DEFAULT_LENGTH = 6;

/**
 * Generate a cryptographically secure numeric OTP.
 * @param length number of digits (default 6).
 */
export function generateOtp(length: number = DEFAULT_LENGTH): string {
  const digits: string[] = [];
  for (let i = 0; i < length; i += 1) {
    digits.push(String(randomInt(0, 10)));
  }
  return digits.join('');
}

/** SHA-256 hash of an OTP (never store the raw code at rest). */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('base64');
}

/**
 * Constant-time comparison of a plaintext OTP against a stored hash.
 * Deliberately does not reveal whether the code format matched.
 */
export function verifyOtp(code: string, hash: string): boolean {
  const a = createHash('sha256').update(code).digest();
  let b: Buffer;
  try {
    b = Buffer.from(hash, 'base64');
  } catch {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
