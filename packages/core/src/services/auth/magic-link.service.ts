/**
 * PEZHWAN — Magic link service.
 *
 * Issues one-time, single-purpose, expiring magic links for passwordless login.
 * The token itself is opaque and random; redemption is handled by the caller
 * against a durable store.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export interface MagicLinkOptions {
  /** Lifetime of a link in seconds. */
  ttlSeconds?: number;
  /** Secret used to sign the link payload (HMAC). */
  secret: string;
}

export interface MagicLink {
  url: string;
  token: string;
  expiresAt: Date;
}

export interface MagicLinkPayload {
  sub: string;
  aud: string;
  exp: number;
  nonce: string;
  sig: string;
}

export class MagicLinkService {
  private readonly ttlSeconds: number;
  private readonly secret: string;

  constructor(options: MagicLinkOptions) {
    this.ttlSeconds = options.ttlSeconds ?? 15 * 60;
    this.secret = options.secret;
    if (!options.secret) throw new Error('MagicLinkService requires a secret');
  }

  private sign(payload: string): string {
    return createHash('sha256').update(`${payload}.${this.secret}`).digest('base64url');
  }

  create({ subject, audience, redirectUri }: { subject: string; audience: string; redirectUri?: string }): MagicLink {
    const nonce = randomBytes(24).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    const base = `${subject}.${audience}.${exp}.${nonce}`;
    const sig = this.sign(base);
    const token = `${base}.${sig}`;
    const url = redirectUri
      ? `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}magic=${encodeURIComponent(token)}`
      : token;
    return { url, token, expiresAt: new Date(exp * 1000) };
  }

  verify(token: string): { subject: string; audience: string; nonce: string } {
    const parts = token.split('.');
    if (parts.length !== 5) throw new Error('Invalid magic link');
    const [subject, audience, expStr, nonce, sig] = parts as unknown as [string, string, string, string, string];
    const base = `${subject}.${audience}.${expStr}.${nonce}`;
    const expected = this.sign(base);
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid magic link signature');
    const exp = Number.parseInt(expStr, 10);
    if (!Number.isFinite(exp) || Date.now() / 1000 > exp) throw new Error('Magic link expired');
    return { subject, audience, nonce };
  }
}