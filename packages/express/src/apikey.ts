/**
 * PEZHWAN — Express API-key + service auth middleware.
 *
 * API keys authenticate server-to-server / service-to-service requests via the
 * `X-API-Key` header. The key is hashed and matched against the ApiKeyModel;
 * a successful match attaches an identity context with an `api_key` auth
 * method. Service (client_credentials) flows are handled by the OAuth service.
 */

import type { NextFunction, RequestHandler, Response } from 'express';
import type { PezhwanRequest } from './index.ts';
import { AuthenticationError } from '@pezhwan/shared';
import type { PezhwanRuntime } from '@pezhwan/core';

const API_KEY_HEADER = 'x-api-key';

/** Extract the API key from the `X-API-Key` header. */
export function extractApiKey(req: PezhwanRequest): string | null {
  const header = req.headers[API_KEY_HEADER];
  return typeof header === 'string' && header.length > 0 ? header : null;
}

/** Verify an API key and attach req.pezhwan (never throws into the handler). */
export function createAuthenticateApiKey(
  runtime: PezhwanRuntime,
): RequestHandler {
  return (req: PezhwanRequest, _res: Response, next: NextFunction) => {
    const raw = extractApiKey(req);
    if (!raw) {
      return next();
    }
    runtime.apiKeys
      .authenticate(raw)
      .then((result) => {
        if (!result) {
          return next();
        }
        req.pezhwan = {
          userId: `apikey:${result.apiKeyId}`,
          tenantId: result.tenantId,
          applicationId: result.applicationId,
          sessionId: '',
          roles: [],
          permissions: result.scopes,
          authMethod: 'api_key',
          authenticatedAt: Date.now(),
          scope: result.scopes.join(' '),
        };
        runtime.metrics.increment('auth.api_key.total');
        runtime.audit.log?.({
          eventType: 'API_KEY_AUTHENTICATED',
          tenantId: result.tenantId,
          applicationId: result.applicationId,
          userId: `apikey:${result.apiKeyId}`,
          metadata: { scopes: result.scopes },
        });
        return next();
      })
      .catch(() => next());
  };
}

/** Require a valid API-key identity (rejects non-API-key authenticated calls). */
export function requireApiKey(): RequestHandler {
  return (req: PezhwanRequest, _res: Response, next: NextFunction) => {
    if (!req.pezhwan || req.pezhwan.authMethod !== 'api_key') {
      return next(
        new AuthenticationError(
          'A valid API key is required',
          'API_KEY_REQUIRED',
        ),
      );
    }
    return next();
  };
}