/**
 * PEZHWAN — cryptographic random number generation.
 *
 * Wraps Node.js crypto.randomBytes / crypto.randomInt with validation
 * and additional utilities (UUID generation, secure random selection,
 * timing-safe comparison).
 */

import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Secure random bytes
// ---------------------------------------------------------------------------

/**
 * Generate cryptographically secure random bytes.
 */
export function secureRandomBytes(length: number): Buffer {
  return randomBytes(length);
}

/**
 * Generate a cryptographically secure random hex string.
 */
export function secureRandomHex(length: number): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a cryptographically secure random base64 string.
 */
export function secureRandomBase64(length: number): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Generate a cryptographically secure random alphanumeric string.
 */
export function secureRandomAlphanumeric(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

/**
 * Generate a UUID v4 (random).
 */
export function generateUuidV4(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 1
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// ---------------------------------------------------------------------------
// Secure random selection
// ---------------------------------------------------------------------------

/**
 * Securely select a random element from an array.
 */
export function secureRandomChoice<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('Cannot select from empty array');
  }
  const index = randomInt(items.length);
  return items[index]!;
}

/**
 * Securely shuffle an array (Fisher-Yates with CSPRNG).
 */
export function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Timing-safe comparison
// ---------------------------------------------------------------------------

/**
 * Timing-safe comparison of two buffers.
 * Prevents timing attacks that could leak information about the comparison.
 */
export function secureCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Timing-safe comparison of two hex strings.
 */
export function secureCompareHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return secureCompare(bufA, bufB);
}

/**
 * Timing-safe comparison of two UTF-8 strings.
 */
export function secureCompareString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return secureCompare(bufA, bufB);
}
