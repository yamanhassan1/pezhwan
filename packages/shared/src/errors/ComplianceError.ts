/**
 * PEZHWAN — compliance failure (GDPR / SOC2 / retention, ...).
 * HTTP 403.
 */

import { PezhwanError } from '../errors.ts';

/** A compliance requirement was not satisfied. */
export class ComplianceError extends PezhwanError {
  constructor(
    message = 'Compliance requirement not met',
    code = 'COMPLIANCE_FAILED',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 403, options);
  }
}
