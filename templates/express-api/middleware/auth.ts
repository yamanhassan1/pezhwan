import type { RequestHandler } from 'express';
import type { PezhwanRuntime } from '@pezhwan/core';
import { createAuthenticate, requireAuth } from '@pezhwan/express';

export interface AuthMiddleware {
  /** Verify the bearer token and attach `req.pezhwan` (optional-auth). */
  authenticate: RequestHandler;
  /** Reject the request with 401 when no valid identity is attached. */
  requireAuth: RequestHandler;
}

export function createAuthMiddleware(runtime: PezhwanRuntime): AuthMiddleware {
  return {
    authenticate: createAuthenticate(runtime),
    requireAuth,
  };
}
