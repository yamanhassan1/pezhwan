/**
 * PEZHWAN — rejected by the real-time risk engine. HTTP 429.
 */

import { PezhwanError } from '../errors.ts';

/** Real-time risk scoring rejected or challenged an interaction. */
export class RiskError extends PezhwanError {
  constructor(
    message = 'Request rejected by risk engine',
    code = 'RISK_EVENT',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 429, options);
  }
}
