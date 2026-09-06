/**
 * PEZHWAN — Security headers middleware.
 *
 * Opinionated, safe-by-default response headers for HTML/JSON endpoints.
 * CSP is configurable because strict CSPs conflict with some SPA setups.
 */

export interface SecurityHeadersOptions {
  csp?: string;
  hstsMaxAge?: number;
  frameAncestors?: string[];
  enableHsts?: boolean;
}

export interface SecurityHeadersResult {
  'Content-Security-Policy'?: string;
  'X-Content-Type-Options': 'nosniff';
  'Referrer-Policy': 'strict-origin-when-cross-origin';
  'Permissions-Policy': string;
  'X-Frame-Options'?: 'DENY' | 'SAMEORIGIN';
  'X-XSS-Protection': '0';
  'Strict-Transport-Security'?: string;
  'Cross-Origin-Opener-Policy': 'same-origin';
  'Cross-Origin-Resource-Policy'?: 'same-origin' | 'cross-origin';
}

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export class SecurityHeaders {
  private readonly options: SecurityHeadersOptions;

  constructor(options: SecurityHeadersOptions = {}) {
    this.options = options;
  }

  build(): SecurityHeadersResult {
    const headers: SecurityHeadersResult = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'X-XSS-Protection': '0',
      'Cross-Origin-Opener-Policy': 'same-origin',
    };
    const csp = this.options.csp ?? DEFAULT_CSP;
    headers['Content-Security-Policy'] = csp;
    const frame =
      this.options.frameAncestors?.length ? `frame-ancestors ${this.options.frameAncestors.join(' ')}` : undefined;
    if (frame && this.options.csp) {
      headers['Content-Security-Policy'] = `${this.options.csp}; ${frame}`;
    }
    if (this.options.frameAncestors === undefined) headers['X-Frame-Options'] = 'DENY';
    if (this.options.enableHsts !== false) {
      headers['Strict-Transport-Security'] = `max-age=${this.options.hstsMaxAge ?? 60 * 60 * 24}`;
    }
    return headers;
  }
}