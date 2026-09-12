/**
 * PEZHWAN — session facade for the node SDK.
 */

import type { PezhwanRuntime } from '@pezhwan/core';

/** The core session service (refresh-token families, rotation, reuse detection). */
export type SessionFacade = PezhwanRuntime['sessions'];

/** Access the session service from a runtime. */
export function session(runtime: PezhwanRuntime): SessionFacade {
  return runtime.sessions;
}
