/**
 * PEZHWAN — Risk middleware.
 *
 * Computes a request risk score from trust signals (device trust, velocity,
 * region, TOR/VPN heuristics) and returns a decision with optional action.
 * The actual risk engine lives in RiskAssessmentService in the flat services;
 * this middleware exposes the frame-agnostic adapter.
 */

export interface RiskSignals {
  ipReputation?: number;
  isNewDevice?: boolean;
  regionMismatch?: boolean;
  velocity?: number;
  mfaSatisfied?: boolean;
  authMethod?: string;
}

export interface RiskDecision {
  score: number;
  level: 'low' | 'medium' | 'high' | 'blocked';
  action: 'allow' | 'challenge' | 'block';
  reasons: string[];
}

export type RiskPolicyFn = (signals: RiskSignals) => RiskDecision;

export class RiskMiddleware {
  private readonly policy: RiskPolicyFn;

  constructor(policy?: RiskPolicyFn) {
    this.policy = policy ?? deterministicPolicy;
  }

  evaluate(signals: RiskSignals): RiskDecision {
    return this.policy(signals);
  }
}

function deterministicPolicy(signals: RiskSignals): RiskDecision {
  const reasons: string[] = [];
  let score = 0;
  if (signals.ipReputation !== undefined) {
    score += signals.ipReputation;
    if (signals.ipReputation > 0.8) reasons.push('poor-ip-reputation');
  }
  if (signals.isNewDevice) {
    score += 0.3;
    reasons.push('new-device');
  }
  if (signals.regionMismatch) {
    score += 0.4;
    reasons.push('region-mismatch');
  }
  if (signals.velocity !== undefined && signals.velocity > 5) {
    score += 0.35;
    reasons.push('high-velocity');
  }
  if (signals.mfaSatisfied) score -= 0.5;
  const clamped = Math.max(0, Math.min(1, score));
  if (clamped >= 0.9) return { score: clamped, level: 'blocked', action: 'block', reasons };
  if (clamped >= 0.6) return { score: clamped, level: 'high', action: 'challenge', reasons };
  if (clamped >= 0.35) return { score: clamped, level: 'medium', action: 'challenge', reasons };
  return { score: clamped, level: 'low', action: 'allow', reasons };
}