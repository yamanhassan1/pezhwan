/**
 * PEZHWAN — password hashing with Argon2id.
 *
 * Argon2id is the OWASP-recommended password hashing algorithm. It is memory
 * and CPU-hard, resistant to GPU cracking, and supports configurable
 * parallelism/memory/time trade-offs.
 */

import argon2 from 'argon2';

export interface Argon2Options {
  /** Number of iterations. */
  timeCost?: number;
  /** Memory cost in KiB. */
  memoryCost?: number;
  /** Degree of parallelism. */
  parallelism?: number;
  /** Type of Argon2 (argon2id is the default and recommended). */
  type?: argon2.Options['type'];
}

/** Production-sensible defaults tuned for interactive login. */
export const DEFAULT_ARGON2_OPTIONS: Argon2Options = {
  timeCost: 3,
  memoryCost: 64 * 1024, // 64 MiB
  parallelism: 1,
  type: argon2.argon2id,
};

/**
 * Hash a password with Argon2id.
 * @throws {Error} on hash failure (callers should map to a 500).
 */
export async function hashPassword(
  plaintext: string,
  options: Argon2Options = DEFAULT_ARGON2_OPTIONS,
): Promise<string> {
  return argon2.hash(plaintext, {
    timeCost: options.timeCost ?? DEFAULT_ARGON2_OPTIONS.timeCost,
    memoryCost: options.memoryCost ?? DEFAULT_ARGON2_OPTIONS.memoryCost,
    parallelism: options.parallelism ?? DEFAULT_ARGON2_OPTIONS.parallelism,
    type: options.type ?? DEFAULT_ARGON2_OPTIONS.type,
  });
}

/**
 * Verify a plaintext password against an Argon2id hash.
 * Returns false (never throws) for a malformed hash so callers can treat
 * unknown/legacy credentials as a generic auth failure.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

/** Whether a stored hash uses Argon2id (good for detecting legacy bcrypt). */
export function isArgon2Hash(hash: string): boolean {
  return typeof hash === 'string' && hash.startsWith('$argon2');
}
