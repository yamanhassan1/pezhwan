/**
 * PEZHWAN — Express middleware.
 *
 * Provides:
 *   - authenticate(): verify the bearer/cookie access token, attach req.pezhwan
 *   - requireAuth(): reject when no valid identity
 *   - requireRole('ADMIN') / requirePermission('ride:create'): RBAC gates
 *   - authRouter(): pre-built /register /login /logout /refresh /otp /password
 *   - sessionRouter(): session list / revoke / revoke-all
 *   - jwksHandler(): serve the public JWKS
 *
 * Identity is ALWAYS derived from the verified access token — never from
 * req.body.role, req.body.userId, or req.body.permissions.
 */

import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router,
} from 'express';
import type { IdentityContext } from '@pezhwan/shared';
import { AuthorizationError, AuthenticationError } from '@pezhwan/shared';
import type { PezhwanRuntime } from '@pezhwan/core';
import { createAuthRouter, createSessionRouter } from './routes.ts';
import { createOauthRouter, discoveryHandler } from './routes.oauth.ts';
import { createMfaRouter, createVerificationRouter } from './routes.extra.ts';
import { createAuthenticateApiKey, requireApiKey } from './apikey.ts';
import { rateLimit, type RateLimitOptions } from './rateLimit.ts';
import {
  securityHeaders,
  requestContext,
  csrfProtection,
  corsAllowlist,
} from './security.ts';

export * from './security.ts';
export * from './apikey.ts';
export { rateLimit, type RateLimitOptions } from './rateLimit.ts';

export interface PezhwanRequest extends Request {
  pezhwan?: IdentityContext;
}

/** Extract the raw access token from Authorization header or cookie. */
export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || null;
  }
  const cookie = req.cookies?.pezhwan_access;
  return typeof cookie === 'string' ? cookie : null;
}

/**
 * Verify the access token and attach req.pezhwan. Never throws into the
 * handler — it defers unauthenticated responses to requireAuth() or lets
 * optional-auth routes proceed with req.pezhwan undefined.
 *
 * One exception: when the presented token is cryptographically valid but the
 * account state cannot be VERIFIED (Mongo unreachable), the middleware forwards
 * the SecurityDependencyError (503) instead of collapsing to a misleading 401.
 * "Cannot check" must resolve to "rejected", and the outage must be visible.
 */
export function createAuthenticate(runtime: PezhwanRuntime): RequestHandler {
  return async (req: PezhwanRequest, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      return next();
    }
    let identity: ReturnType<PezhwanRuntime['tokens']['verifyAccessToken']>;
    try {
      identity = runtime.tokens.verifyAccessToken(token);
    } catch {
      // Malformed/expired/unknown-kid token → treat as unauthenticated.
      // requireAuth() (if mounted) rejects with 401.
      return next();
    }
    let valid = false;
    try {
      valid = await runtime.accountState.validate(
        identity.userId,
        identity.tokenVersion ?? 0,
      );
    } catch (err) {
      // Account state could not be checked (Mongo down). Fail closed AND
      // surface the failure as 503 (SecurityDependencyError) rather than a
      // misleading 401.
      return next(err);
    }
    if (!valid) {
      // Account deleted, disabled, or its tokenVersion was rotated (e.g.
      // password change). Fail closed — do not attach an identity.
      return next();
    }
    req.pezhwan = identity;
    return next();
  };
}

/** Require a valid req.pezhwan identity; otherwise 401. */
export function requireAuth(): RequestHandler {
  return (req: PezhwanRequest, _res: Response, next: NextFunction) => {
    if (!req.pezhwan) {
      return next(
        new AuthenticationError('Authentication required', 'UNAUTHENTICATED'),
      );
    }
    return next();
  };
}

/** Require a role (e.g. 'ADMIN') on the authenticated identity. */
export function requireRole(roleName: string): RequestHandler {
  return (req: PezhwanRequest, _res: Response, next: NextFunction) => {
    const identity = req.pezhwan;
    if (!identity) {
      return next(
        new AuthenticationError('Authentication required', 'UNAUTHENTICATED'),
      );
    }
    if (!identity.roles.includes(roleName)) {
      return next(
        new AuthorizationError(`Role "${roleName}" required`, 'ROLE_REQUIRED'),
      );
    }
    return next();
  };
}

/** Require a permission (e.g. 'ride:create') on the authenticated identity. */
export function requirePermission(permission: string): RequestHandler {
  return (req: PezhwanRequest, _res: Response, next: NextFunction) => {
    const identity = req.pezhwan;
    if (!identity) {
      return next(
        new AuthenticationError('Authentication required', 'UNAUTHENTICATED'),
      );
    }
    if (!identity.permissions.includes(permission)) {
      return next(
        new AuthorizationError(
          `Permission "${permission}" required`,
          'PERMISSION_REQUIRED',
        ),
      );
    }
    return next();
  };
}

/** Serve the public JWKS from the runtime KeyStore. */
export function jwksHandler(runtime: PezhwanRuntime): RequestHandler {
  return (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ keys: runtime.store.jwks() });
  };
}

/**
 * Build the pre-wired auth + session routers. Returns an object with
 * `.auth` and `.sessions` routers for mountPoints like /v1/auth and
 * /v1/sessions.
 */
export function buildRouters(runtime: PezhwanRuntime): {
  auth: Router;
  sessions: Router;
  oauth: Router;
  mfa: Router;
  verification: Router;
} {
  return {
    auth: createAuthRouter(runtime),
    sessions: createSessionRouter(runtime),
    oauth: createOauthRouter(runtime),
    mfa: createMfaRouter(runtime),
    verification: createVerificationRouter(runtime),
  };
}

export { createAuthRouter, createSessionRouter } from './routes.ts';
export { createOauthRouter, discoveryHandler } from './routes.oauth.ts';
export { createMfaRouter, createVerificationRouter } from './routes.extra.ts';
export { createAuthenticateApiKey, requireApiKey } from './apikey.ts';