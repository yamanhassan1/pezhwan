/**
 * PEZHWAN — authorization facade for the node SDK.
 */

import type { PezhwanRuntime } from '@pezhwan/core';

/** The core authorization service (RBAC/ABAC checks). */
export type AuthorizationFacade = PezhwanRuntime['authorization'];

/** Access the authorization service from a runtime. */
export function authorization(runtime: PezhwanRuntime): AuthorizationFacade {
  return runtime.authorization;
}
