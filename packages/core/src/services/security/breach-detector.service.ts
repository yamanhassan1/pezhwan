/**
 * PEZHWAN — Breach detection.
 *
 * Watches credential/security events for evidence that an account has been
 * compromised: reused leaked passwords (via HIBP), password dumps hitting the
 * API, unusual credential material. Emits high-severity security events that
 * adaptive-auth policy can consume.
 *
 * This service is the policy orchestration layer on top of the HIBP range
 * lookup — it decides WHEN to check (never at page load), how often, and what
 * to do with a hit.
 */

import { HibpService } from './hibp.service.ts';
import { RiskService } from './risk.service.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreachDetectorConfig {
  /** HIBP range service (k-anonymity). */
  hibp?: HibpService;
  /** Rate limit: don't check the same password twice within this window (ms). */
  cacheWindowMs?: number;
  /** Apply a risk penalty when a breach matches. */
  riskService?: RiskService;
}

export interface BreachCheckInput {
  password: string;
  userAgent?: string;
  ip?: string;
}

export interface BreachCheckResult {
  breached: boolean;
  /** Breach count reported by HIBP (0 if not breached / check skipped). */
  count: number;
  checked: boolean;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BreachDetectorService {
  private readonly hibp?: HibpService;
  private readonly cachedWindowMs: number;
  private readonly riskService?: RiskService;
  private readonly recentChecks = new Map<
    string,
    { breached: boolean; count: number; at: number }
  >();

  constructor(config: BreachDetectorConfig = {}) {
    this.hibp = config.hibp;
    this.cachedWindowMs = config.cacheWindowMs ?? 60 * 60_000;
    this.riskService = config.riskService;
  }

  /**
   * Check a candidate password against breach databases (k-anonymity). The
   * result is cached per password for the configured window so repeated logins
   * don't hammer HIBP. When no HIBP service is wired (offline/dev) this
   * returns a non-blocking "not checked".
   */
  async checkPassword(input: BreachCheckInput): Promise<BreachCheckResult> {
    if (!this.hibp) {
      return { breached: false, count: 0, checked: false, cached: false };
    }

    const cached = this.recentChecks.get(input.password);
    if (cached && Date.now() - cached.at < this.cachedWindowMs) {
      return { breached: cached.breached, count: cached.count, checked: true, cached: true };
    }

    const result = await this.hibp.isBreached(input.password);
    this.recentChecks.set(input.password, {
      breached: result.breached,
      count: result.count,
      at: Date.now(),
    });

    // Surface a risk signal when the password is breached.
    if (result.breached && this.riskService) {
      await this.riskService.assessAndRecord({
        breachedPassword: true,
        ip: input.ip,
        userAgent: input.userAgent,
      });
    }

    return { breached: result.breached, count: result.count, checked: true, cached: false };
  }
}
