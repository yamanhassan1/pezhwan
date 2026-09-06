/**
 * PEZHWAN — MFA middleware.
 *
 * Enforces step-up authentication for high-risk actions. Whether MFA is
 * required is delegated to a policy function; the middleware returns a
 * challenge requirement the caller can act on (e.g. 401 with mfa_required).
 */

export interface MfaDecisionInput {
  userId: string;
  mfaEnabled: boolean;
  authMethod: string;
  sessionVerifiedAt?: number;
  riskScore?: number;
}

export interface MfaDecision {
  required: boolean;
  reason?: string;
  challenge: 'otp' | 'totp' | 'none';
}

export type MfaPolicyFn = (input: MfaDecisionInput) => Promise<boolean> | boolean;

const STEP_UP_WINDOW_MS = 10 * 60 * 1000;

export class MfaMiddleware {
  constructor(private readonly policy: MfaPolicyFn = () => true) {}

  async evaluate(input: MfaDecisionInput): Promise<MfaDecision> {
    if (!input.mfaEnabled) {
      return { required: false, challenge: 'none', reason: 'mfa-not-enabled' };
    }
    const highRisk = (input.riskScore ?? 0) >= 0.7;
    const stepUpStale =
      input.sessionVerifiedAt !== undefined && Date.now() - input.sessionVerifiedAt > STEP_UP_WINDOW_MS;
    const needsStepUp = (await this.policy(input)) || highRisk || stepUpStale;
    if (!needsStepUp) {
      return { required: false, challenge: 'none', reason: 'mfa-satisfied' };
    }
    return {
      required: true,
      challenge: input.authMethod === 'totp' ? 'totp' : 'otp',
      reason: 'step-up-required',
    };
  }
}