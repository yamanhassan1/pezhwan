/**
 * PEZHWAN — general-purpose helpers (crypto, sanitization, coercion).
 */

import { createHash, randomBytes } from 'node:crypto';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function now(): number {
  return Date.now();
}

/** Cryptographically random base64url token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex digest of a string (constant width, no secret). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Lowercased, dash-separated slug suitable for tenants/applications. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Redacts everything but the leading character before the domain. */
export function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return local.charAt(0) + '***' + domain;
}

/** Redacts the digits of a phone number keeping first four and last two. */
export function redactPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return phone.slice(0, 4) + '***' + phone.slice(-2);
}

/** Masks a secret, keeping a short prefix for operator correlation. */
export function maskSecret(secret: string): string {
  const tail = Math.max(0, Math.min(4, secret.length - 4));
  return secret.slice(0, 4) + '\u2022'.repeat(tail);
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exhaustiveness guard for discriminated unions. */
export function assertNever(value: never): never {
  throw new Error('Unexpected value: ' + String(value));
}
