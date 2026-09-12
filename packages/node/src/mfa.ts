/**
 * PEZHWAN — multi-factor authentication facade for the node SDK.
 */

import type { PezhwanRuntime } from '@pezhwan/core';

/** The core MFA service (TOTP enroll/verify, step-up). */
export type MfaFacade = PezhwanRuntime['mfa'];

/** Access the MFA service from a runtime. */
export function mfa(runtime: PezhwanRuntime): MfaFacade {
  return runtime.mfa;
}
