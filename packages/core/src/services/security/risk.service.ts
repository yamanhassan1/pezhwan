/**
 * PEZHWAN — Risk scoring engine (account takeover protection).
 *
 * Computes a 0-100 risk score for each login attempt from a set of signals:
 * impossible travel, new device/IP, TOR/proxy, velocity, HIBP breach match,
 * bot-like behaviour. Produces an allow / challenge / block / monitor verdict
 * with per-signal transparency for audit and adaptive-auth policy.
 */

import { RiskEventModel, type RiskSignal } from '../../models/index.ts';
import type { AuditService } from '../audit.service.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskVerdict = 'allow' | 'challenge' | 'block' | 'monitor';

export interface RiskContext {
  userId?: string;
  tenantId?: string;
  applicationId?: string;
  ip?: string;
  userAgent?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  deviceId?: string;
  /** Seconds since the user's previous successful login (for velocity). */
  loginVelocityMs?: number;
  /** Whether this principal's password was found in a known breach. */
  breachedPassword?: boolean;
  botScore?: number;
  isTor?: boolean;
  isProxy?: boolean;
  /** Historical count of failed logins for this IP in the window. */
  ipFailureCount?: number;
}

export interface RiskAssessment {
  score: number;
  verdict: RiskVerdict;
  signals: RiskSignal[];
  /** Whether MFA should be required on top of the normal flow. */
  requireMfa: boolean;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const THRESHOLD_CHALLENGE = 40;
const THRESHOLD_BLOCK = 75;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RiskService {
  constructor(
    private readonly tenantId?: string,
    private readonly applicationId?: string,
    private readonly audit?: AuditService,
  ) {}

  /**
   * Compute a risk assessment for a login attempt from the available context.
   * Pure signal scoring — no persistence — so it can run in hot paths.
   */
  assess(context: RiskContext): RiskAssessment {
    const signals: RiskSignal[] = [];

    const push = (kind: string, detail: string, weight: number): void => {
      if (weight > 0) signals.push({ kind, detail, weight });
    };

    // Impossible travel / geographic anomaly.
    if (context.latitude != null && context.longitude != null) {
      const recent = this.recentLocation(context.userId, context.latitude, context.longitude);
      if (recent.distanceKm > 500 && recent.timeGapMs < 6 * 60 * 60_000) {
        push(
          'impossible_travel',
          `Login ${recent.distanceKm}km from previous location within ${Math.floor(recent.timeGapMs / 60_000)}min`,
          45,
        );
      }
    }

    // Breached password carries very high weight — an attacker who owns the
    // password can log in, so challenge regardless.
    if (context.breachedPassword) {
      push('hibp_match', 'Password found in known breach databases', 60);
    }

    // Anonymisation networks.
    if (context.isTor) push('tor', 'Login via Tor exit node', 40);
    if (context.isProxy) push('proxy', 'Login via proxy/VPN', 25);

    // Velocity — login shortly after a previous successful login in a far
    // location is suspicious. Fast repeated failures from one IP → block.
    if (context.loginVelocityMs != null && context.loginVelocityMs < 30_000) {
      push('velocity', `Logins within ${context.loginVelocityMs}ms of each other`, 35);
    }

    // IP failure reputation.
    if ((context.ipFailureCount ?? 0) >= 10) {
      push('ip_failures', `${context.ipFailureCount} recent failed logins from this IP`, 50);
    } else if ((context.ipFailureCount ?? 0) >= 3) {
      push('ip_failures', `${context.ipFailureCount} recent failed logins from this IP`, 20);
    }

    // Bot-like behaviour.
    if ((context.botScore ?? 0) >= 0.7) {
      push('bot_like', `Bot score ${(context.botScore ?? 0).toFixed(2)}`, 40);
    }

    const score = Math.min(
      100,
      signals.reduce((s, x) => s + x.weight, 0),
    );
    const verdict: RiskVerdict =
      score >= THRESHOLD_BLOCK ? 'block' : score >= THRESHOLD_CHALLENGE ? 'challenge' : 'allow';

    // Challenge whenever any credential-compromise signal fires, even below the
    // challenge threshold, because the account is demonstrably at risk.
    const requireMfa = verdict !== 'allow' || context.breachedPassword === true;

    return { score, verdict, signals, requireMfa };
  }

  /**
   * Assess and persist a risk event for audit + trend analysis.
   * Returns the same assessment but also writes a RiskEvent document.
   */
  async assessAndRecord(context: RiskContext): Promise<RiskAssessment> {
    const assessment = this.assess(context);

    await RiskEventModel.create({
      tenantId: context.tenantId ?? this.tenantId ?? 'default',
      userId: context.userId,
      applicationId: context.applicationId ?? this.applicationId,
      score: assessment.score,
      action: assessment.verdict,
      attemptId: crypto.randomUUID(),
      ip: context.ip,
      country: context.country,
      city: context.city,
      latitude: context.latitude,
      longitude: context.longitude,
      userAgent: context.userAgent,
      deviceId: context.deviceId,
      signals: assessment.signals,
    });

    if (assessment.verdict === 'block') {
      await this.audit?.log({
        eventType: 'LOGIN_FAILED',
        tenantId: context.tenantId ?? this.tenantId,
        userId: context.userId,
        ip: context.ip,
        metadata: { riskScore: assessment.score, signal: 'account_takeover_block' },
      } as never);
    }

    return assessment;
  }

  // ---------------------------------------------------------------------
  // Locality cache (module-level map of user → last login location).
  // ---------------------------------------------------------------------

  private lastLocations = new Map<string, { lat: number; lon: number; at: number }>();

  private recentLocation(
    userId: string | undefined,
    lat: number,
    lon: number,
  ): { distanceKm: number; timeGapMs: number } {
    if (!userId) return { distanceKm: 0, timeGapMs: 0 };
    const prev = this.lastLocations.get(userId);
    this.lastLocations.set(userId, { lat, lon, at: Date.now() });
    if (!prev) return { distanceKm: 0, timeGapMs: 0 };

    const distanceKm = haversineKm(prev.lat, prev.lon, lat, lon);
    return { distanceKm, timeGapMs: Date.now() - prev.at };
  }
}

/** Great-circle distance in kilometres between two coordinates (Haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
