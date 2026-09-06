/**
 * Timing-safe comparison and constant-time utilities.
 *
 * Prevents timing attacks on secret comparison operations.
 *
 * @module
 */

import { timingSafeEqual } from 'node:crypto';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimingSafeOptions {
  /** Expected value (the secret to compare against) */
  expected: string | Buffer;
  /** Actual value (the user-provided input) */
  actual: string | Buffer;
}

export interface HashCompareOptions {
  /** Algorithm for hashing (default: sha256) */
  algorithm?: string;
}

// ---------------------------------------------------------------------------
// Core comparison functions
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison.
 *
 * Prevents timing attacks by ensuring all bytes are compared
 * regardless of where a mismatch occurs.
 *
 * @example
 * ```ts
 * const isValid = timingSafeCompare({ expected: secret, actual: userInput });
 * if (!isValid) throw new Error('Invalid token');
 * ```
 */
export function timingSafeCompare(options: TimingSafeOptions): boolean {
  const { expected, actual } = options;

  const expectedBuf = typeof expected === 'string' ? Buffer.from(expected, 'utf-8') : expected;
  const actualBuf = typeof actual === 'string' ? Buffer.from(actual, 'utf-8') : actual;

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Constant-time hex string comparison.
 *
 * Useful for comparing hex-encoded hashes, signatures, or tokens.
 */
export function timingSafeHexCompare(expected: string, actual: string): boolean {
  return timingSafeCompare({ expected, actual });
}

/**
 * Constant-time buffer comparison.
 */
export function timingSafeBufferCompare(expected: Buffer, actual: Buffer): boolean {
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

// ---------------------------------------------------------------------------
// Hash-based comparison
// ---------------------------------------------------------------------------

/**
 * Compare two values by hashing them first, then comparing hashes.
 *
 * This prevents length-based side channels since both inputs are
 * hashed to a fixed-size digest before comparison.
 *
 * @example
 * ```ts
 * // Compare potentially different-length secrets safely
 * const match = hashCompare({
 *   expected: 'my-long-secret-key',
 *   actual: userProvidedKey,
 *   algorithm: 'sha256'
 * });
 * ```
 */
export function hashCompare(options: TimingSafeOptions & HashCompareOptions): boolean {
  const { expected, actual, algorithm = 'sha256' } = options;

  const expectedBuf = typeof expected === 'string' ? Buffer.from(expected, 'utf-8') : expected;
  const actualBuf = typeof actual === 'string' ? Buffer.from(actual, 'utf-8') : actual;

  const expectedHash = createHash(algorithm).update(expectedBuf).digest();
  const actualHash = createHash(algorithm).update(actualBuf).digest();

  return timingSafeEqual(expectedHash, actualHash);
}

// ---------------------------------------------------------------------------
// Token and nonce comparison
// ---------------------------------------------------------------------------

/**
 * Validate a bearer token in constant time.
 *
 * Strips the "Bearer " prefix before comparison.
 */
export function validateBearerToken(
  authHeader: string | undefined,
  expectedToken: string,
): boolean {
  if (!authHeader) {
    return false;
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  return timingSafeCompare({ expected: expectedToken, actual: token });
}

/**
 * Validate a CSRF token in constant time.
 */
export function validateCsrfToken(token: string | undefined, expected: string): boolean {
  if (!token) {
    return false;
  }
  return timingSafeCompare({ expected, actual: token });
}

/**
 * Compare HMAC signatures (e.g., webhook signatures).
 */
export function validateHmacSignature(
  payload: Buffer | string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256',
): boolean {
  const { createHmac } = require('node:crypto');
  const expected = createHmac(algorithm, secret)
    .update(typeof payload === 'string' ? payload : payload)
    .digest('hex');

  return timingSafeHexCompare(expected, signature);
}

// ---------------------------------------------------------------------------
// Array and map comparison
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison of two byte arrays.
 *
 * Uses a cumulative XOR approach — any single-byte difference will
 * cause the accumulator to be non-zero.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

/**
 * Constant-time string equality check.
 *
 * Returns false if lengths differ (without leaking timing on content).
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');

  return constantTimeEqual(aBuf, bBuf);
}

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

/**
 * Check if a secret matches a known value without leaking the secret.
 *
 * Returns a boolean and never logs or exposes the secret.
 */
export function verifySecret(
  input: string,
  stored: string,
  algorithm: 'sha256' | 'sha512' = 'sha256',
): boolean {
  return hashCompare({
    expected: stored,
    actual: input,
    algorithm,
  });
}

/**
 * Create a fixed-length hash of a secret for safe storage.
 *
 * Use this to hash secrets before logging or storing in non-secure locations.
 */
export function hashSecret(secret: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
  return createHash(algorithm).update(secret, 'utf-8').digest('hex');
}

// ---------------------------------------------------------------------------
// Rate limit key comparison
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison of rate limit keys.
 *
 * Rate limit keys may contain IP addresses, user IDs, and other
 * identifying information that should not be leaked through timing.
 */
export function compareRateLimitKeys(key1: string, key2: string): boolean {
  return timingSafeCompare({ expected: key1, actual: key2 });
}

// ---------------------------------------------------------------------------
// Password strength (auxiliary)
// ---------------------------------------------------------------------------

/**
 * Estimate the entropy of a password string.
 *
 * Returns bits of entropy. Generally:
 * - < 28 bits: very weak
 * - 28-35 bits: weak
 * - 36-59 bits: reasonable
 * - 60-127 bits: strong
 * - ≥ 128 bits: very strong
 */
export function estimateEntropy(password: string): number {
  let charsetSize = 0;

  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 33;

  if (charsetSize === 0) return 0;

  return Math.floor(password.length * Math.log2(charsetSize));
}

/**
 * Check if a password meets minimum entropy requirements.
 */
export function hasMinimumEntropy(password: string, minBits = 60): boolean {
  return estimateEntropy(password) >= minBits;
}
