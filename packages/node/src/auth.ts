/**
 * PEZHWAN — authentication facade for the node SDK.
 */

import type { PezhwanRuntime } from '@pezhwan/core';

/** The core authentication engine. */
export type AuthFacade = PezhwanRuntime['auth'];

/** Access the authentication engine from a runtime. */
export function auth(runtime: PezhwanRuntime): AuthFacade {
  return runtime.auth;
}
