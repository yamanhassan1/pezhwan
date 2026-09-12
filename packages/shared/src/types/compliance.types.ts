/**
 * PEZHWAN — compliance domain types.
 */

import type { Severity } from '../types.ts';

/** Compliance frameworks Pezhwan can produce evidence for. */
export type ComplianceDomain = 'gdpr' | 'soc2' | 'hipaa' | 'pci' | 'iso27001';

/** A single compliance check result. */
export interface ComplianceCheck {
  id: string;
  name: string;
  passed: boolean;
  severity: Severity;
  /** Optional evidence reference (audit record id, log line, artifact). */
  evidence?: string;
}

/** A compliance report over a domain. */
export interface ComplianceReport {
  domain: ComplianceDomain;
  compliant: boolean;
  checks: ComplianceCheck[];
  generatedAt: Date;
}
