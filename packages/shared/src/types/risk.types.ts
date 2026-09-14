/**
 * PEZHWAN — real-time risk engine types.
 */

/** Signals the risk engine can observe. */
export type RiskEventType =
  'login' | 'password_change' | 'otp_verify' | 'sensitive_read' | 'admin_action' | 'token_reuse';

/** A single risk factor with a normalized score. */
export interface RiskFactor {
  name: string;
  /** Weighted contribution to the overall score (0..1). */
  score: number;
  reason?: string;
}

/** The decision the risk engine reached. */
export type RiskDecision = 'allow' | 'challenge' | 'block';

/** A full risk assessment for an interaction. */
export interface RiskAssessment {
  riskEvent: RiskEventType;
  userId?: string;
  factors: RiskFactor[];
  /** Overall risk score (0..1). */
  totalScore: number;
  decision: RiskDecision;
  evaluatedAt: Date;
}
