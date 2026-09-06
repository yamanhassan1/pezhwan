/**
 * PEZHWAN — CSRF middleware.
 *
 * Double-submit cookie pattern (stateful-free) with strict origin comparison
 * for state-changing methods. Safe for SPA backends served same-site.
 */

import { createHash, randomBytes } from 'node:crypto';

export interface CsrfOptions {
  cookieName?: string;
  headerName?: string;
  sameSite?: 'strict' | 'lax' | 'none';
  origin: string;
}

export interface CsrfResult {
  ok: boolean;
  reason?: 'missing_token' | 'mismatch' | 'bad_origin';
}

export class CsrfMiddleware {
  private readonly cookieName: string;
  private readonly headerName: string;
  private readonly sameSite: 'strict' | 'lax' | 'none';
  private readonly origin: string;

  constructor(options: CsrfOptions) {
    this.cookieName = options.cookieName ?? 'pezhwan_csrf';
    this.headerName = options.headerName ?? 'x-csrf-token';
    this.sameSite = options.sameSite ?? 'strict';
    this.origin = options.origin;
  }

  /** Issues a fresh double-submit token (does NOT rotate the session token). */
  issue(): { cookieName: string; cookieValue: string; httpOnly: boolean } {
    return {
      cookieName: this.cookieName,
      cookieValue: randomBytes(24).toString('base64url'),
      httpOnly: false,
    };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Validates the header against the cookie (double-submit) + origin. */
  validate(input: {
    method: string;
    cookie?: string;
    header?: string;
    origin?: string;
  }): CsrfResult {
    if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.toUpperCase())) {
      return { ok: true };
    }
    if (!input.cookie || !input.header) return { ok: false, reason: 'missing_token' };
    if (this.hash(input.cookie) !== this.hash(input.header)) {
      return { ok: false, reason: 'mismatch' };
    }
    if (input.origin && input.origin !== this.origin) {
      return { ok: false, reason: 'bad_origin' };
    }
    return { ok: true };
  }

  setCookieAttributes(options: { secure: boolean; path?: string }): string {
    return `${this.cookieName}=x; HttpOnly; SameSite=${this.sameSite}${options.secure ? '; Secure' : ''}; Path=${options.path ?? '/'}`;
  }
}