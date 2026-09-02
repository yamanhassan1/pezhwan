/**
 * PEZHWAN — TOTP (RFC 6238) time-based one-time password for MFA.
 *
 * Uses HMAC-SHA1 as mandated by the RFC, 30-second step, 6-digit codes, and a
 * configurable clock-skew window. Backed by a cryptographically secure secret.
 * Never log or expose the secret.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_DIGITS = 6;
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_WINDOW_STEPS = 1; // accept ±1 step (30s of skew)

/** Decode a base32 string (RFC 4648, no padding) used by otpauth URIs. */
function base32DecodeAndHexBuffer(
  input: string,
): { ok: true; secret: Buffer } | { ok: false } {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const upper = input.toUpperCase().replace(/=+/g, '');
  let bits = '';
  for (const ch of upper) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) {
      return { ok: false };
    }
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return { ok: true, secret: Buffer.from(bytes) };
}

/** Generate a buffer of `length` cryptographically random bytes. */
export function generateToptSecretBytes(length = 32): Buffer {
  return randomBytes(length);
}

/** Encode a binary secret to base32 (RFC 4648, no padding) for otpauth URIs. */
export function encodeBase32(secret: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of secret) {
    bits += byte.toString(2).padStart(8, '0');
  }
  while (bits.length % 5 !== 0) {
    bits += '0';
  }
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

/** Compute a single TOTP code for the given secret + counter. */
export function hotp(secret: Buffer, counter: number, digits = DEFAULT_DIGITS): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(counterBuf).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  const code = bin % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

/**
 * Generate a README otpauth:// URI for provisioning a TOTP authenticator app.
 * This is the only user-facing value; the raw base32 secret is embedded.
 */
export function buildOtpauthUri(opts: {
  issuer: string;
  accountName: string;
  secret: Buffer;
}): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.accountName}`);
  const params = new URLSearchParams({
    secret: encodeBase32(opts.secret),
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Compute the value at `time` (epoch seconds) for the given secret.
 * @returns the 6-digit code.
 */
export function generateTotp(
  secret: Buffer,
  timeSeconds: number,
  opts: { digits?: number; step?: number } = {},
): string {
  const digits = opts.digits ?? DEFAULT_DIGITS;
  const step = opts.step ?? DEFAULT_STEP_SECONDS;
  const counter = Math.floor(timeSeconds / step);
  return hotp(secret, counter, digits);
}

/**
 * Verify a presented TOTP code against a secret within a clock-skew window.
 * Constant-time so a wrong code does not leak how close it was.
 */
export function verifyTotp(
  code: string,
  secret: Buffer,
  timeSeconds: number,
  opts: { digits?: number; step?: number; window?: number } = {},
): boolean {
  const digits = opts.digits ?? DEFAULT_DIGITS;
  const step = opts.step ?? DEFAULT_STEP_SECONDS;
  const window = opts.window ?? DEFAULT_WINDOW_STEPS;
  const counter = Math.floor(timeSeconds / step);
  for (let i = -window; i <= window; i += 1) {
    const candidate = hotp(secret, counter + i, digits);
    const a = Buffer.from(candidate, 'utf-8');
    const b = Buffer.from(code, 'utf-8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

/** Decode a user-supplied base32 secret into a Buffer (or fail). */
export function secretFromBase32(input: string): Buffer | null {
  const res = base32DecodeAndHexBuffer(input);
  return res.ok ? res.secret : null;
}

/** Generate a set of single-use random backup codes (hashed variants derived by caller). */
export function generateBackupCodes(count = 10, length = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(length);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let code = '';
    for (let j = 0; j < bytes.length; j += 1) {
      code += alphabet[bytes[j]! % alphabet.length];
    }
    codes.push(code);
  }
  return codes;
}