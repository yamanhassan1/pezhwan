/**
 * PEZHWAN — Node.js SDK entry.
 *
 * A thin convenience facade over @pezhwan/core exposing the public
 * authentication/session/authorization API described in the spec:
 *
 *   pezhwan.auth.register / login / logout / refresh / verifyEmail / ...
 *   pezhwan.session.*
 *   pezhwan.authorization.*
 *   pezhwan.user.*
 */

import { createPezhwan, type PezhwanConfig, type PezhwanRuntime } from '@pezhwan/core';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
  TokenError,
  SessionError,
  PezhwanError,
} from '@pezhwan/shared';

export {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
  TokenError,
  SessionError,
  PezhwanError,
};

export * from '@pezhwan/core';

export * from './client.ts';
export * from './auth.ts';
export * from './session.ts';
export * from './authorization.ts';
export * from './mfa.ts';

/**
 * Construct the Pezhwan runtime. Validates configuration at startup and
 * wires the full stack (keystore → tokens → sessions → OTP → RBAC → audit).
 */
export function Pezhwan(config: PezhwanConfig): PezhwanRuntime {
  return createPezhwan(config);
}

export const PezhwanClient = { ...(Pezhwan as unknown as object) };
