/**
 * PEZHWAN — a security invariant was violated. HTTP 403.
 */

import { PezhwanError } from '../errors.ts';

/** A security invariant was violated or an unexpected state was reached. */
export class SecurityError extends PezhwanError {
  constructor(
    message = 'Security violation',
    code = 'SECURITY_ERROR',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 403, options);
  }
}
