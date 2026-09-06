/**
 * PEZHWAN — Compliance middleware.
 *
 * Annotation-based hooks for GDPR/CCPA/HIPAA-style requirements: consent
 * capture, region awareness, and data-purpose tagging on requests.
 */

export interface ComplianceContext {
  purpose?: string;
  consent?: { given: boolean; scope?: string[] };
  region?: 'eu' | 'us' | 'other';
  legalBasis?: 'consent' | 'contract' | 'legal_obligation' | 'legitimate_interest';
}

export interface ComplianceResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
}

export class ComplianceMiddleware {
  /** Validates that a request carrying personal data has a declared purpose. */
  evaluate(context: ComplianceContext): ComplianceResult {
    const warnings: string[] = [];
    if (!context.purpose) {
      warnings.push('no-processing-purpose-declared');
    }
    if (context.region === 'eu' && !context.legalBasis) {
      warnings.push('eu-region-missing-legal-basis');
    }
    if (context.consent && !context.consent.given && context.purpose?.startsWith('marketing')) {
      warnings.push('marketing-without-consent');
    }
    const blocked = context.region === 'eu' && context.consent?.given === false && context.legalBasis !== 'legal_obligation';
    return {
      allowed: !blocked,
      reason: blocked ? 'EU consent required for this purpose' : undefined,
      warnings,
    };
  }
}