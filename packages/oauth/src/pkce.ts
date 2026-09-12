/**
 * PEZHWAN — PKCE (RFC 7636).
 *
 * S256 (SHA-256 base64url) challenges are REQUIRED for public clients under
 * OAuth 2.1. Plain challenges and the 'none' fallback are supported only for
 * legacy/documented flows and are never used by default.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Generates a high-entropy \"code_verifier\" (43..128 chars). */
export function generateCodeVerifier(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Derives the \"code_challenge\" for a verifier under the given method. */
export function generateCodeChallenge(
  verifier: string,
  method: 'S256' | 'plain' = 'S256',
): string {
  if (method === 'plain') {
    return verifier;
  }
  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

/** Constant-time PKCE verification. */
export function verifyPkce(
  verifier: string,
  challenge: string | null | undefined,
  method: 'S256' | 'plain' | 'none' | null = 'S256',
): boolean {
  if (!challenge || !method || method === 'none') {
    return false;
  }
  const expected = generateCodeChallenge(verifier, method);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(challenge, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
