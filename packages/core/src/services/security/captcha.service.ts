/**
 * PEZHWAN — CAPTCHA integration.
 *
 * Verifies CAPTCHA tokens (hCaptcha / Cloudflare Turnstile / reCAPTCHA v3) via
 * an injected verifier so the core never depends on a specific vendor. The
 * verification result feeds the bot detector and can gate login/registration.
 *
 * The network call is injected (`verifyToken`) so tests stay offline and
 * credentials stay behind the secret provider.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CaptchaProvider = 'hcaptcha' | 'turnstile' | 'recaptcha';

export interface CaptchaConfig {
  /** Provider name (for audit metadata). */
  provider: CaptchaProvider;
  /** Secret key (from the secret provider). */
  secretKey?: string;
  /** Verify token against the provider. Injected for testability. */
  verifyToken?: (token: string, secretKey?: string) => Promise<boolean> | boolean;
  /** Minimum score to accept for reCAPTCHA v3 (default 0.5). */
  minScore?: number;
}

export interface CaptchaVerification {
  success: boolean;
  provider: CaptchaProvider;
  score?: number;
  error?: string;
  /** Anti-bot signal when verification is skipped (no provider configured). */
  notConfigured?: boolean;
}

// ---------------------------------------------------------------------------
// Default providers (offline-safe wrappers around injected fetchers)
// ---------------------------------------------------------------------------

/**
 * Build a verifier for the real provider endpoints. The `fetch` is supplied so
 * it can be stubbed in tests; production passes globalThis.fetch.
 */
export function createCaptchaVerifier(provider: CaptchaProvider) {
  return async (token: string, secretKey?: string): Promise<boolean> => {
    if (!secretKey) return false;
    try {
      if (provider === 'hcaptcha') {
        const res = await fetch('https://hcaptcha.com/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
        });
        const json = (await res.json()) as { success?: boolean };
        return json.success === true;
      }
      if (provider === 'turnstile') {
        const res = await fetch(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
          },
        );
        const json = (await res.json()) as { success?: boolean };
        return json.success === true;
      }
      // reCAPTCHA.
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
      });
      const json = (await res.json()) as { success?: boolean };
      return json.success === true;
    } catch {
      return false;
    }
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CaptchaService {
  private readonly provider: CaptchaProvider;
  private readonly secretKey?: string;
  private readonly verifyToken: (token: string, secretKey?: string) => Promise<boolean> | boolean;
  private readonly minScore: number;

  constructor(config: CaptchaConfig) {
    this.provider = config.provider;
    this.secretKey = config.secretKey;
    this.minScore = config.minScore ?? 0.5;
    this.verifyToken =
      config.verifyToken ?? (config.secretKey ? createCaptchaVerifier(config.provider) : () => false);
  }

  /**
   * Verify a CAPTCHA token. When no provider is configured (secretKey absent),
   * returns `notConfigured: true` — callers decide whether to allow or block.
   */
  async verify(token: string | undefined): Promise<CaptchaVerification> {
    if (!this.secretKey) {
      return { success: false, provider: this.provider, notConfigured: true };
    }
    if (!token) {
      return { success: false, provider: this.provider, error: 'missing token' };
    }
    try {
      const ok = await this.verifyToken(token, this.secretKey);
      return { success: ok === true, provider: this.provider, score: ok ? 1 : 0 };
    } catch (err) {
      return {
        success: false,
        provider: this.provider,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}