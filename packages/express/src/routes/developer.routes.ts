/**
 * PEZHWAN — developer router.
 *
 *   POST   /api-keys       — (ADMIN) create an API key (raw key shown once)
 *   DELETE /api-keys/:id   — (ADMIN) revoke an API key
 *
 * Wraps the core ApiKeyService. Persistence is delegated to the ApiKeyModel,
 * so the endpoints behave exactly like the engine's own API-key surface.
 */

import { Router, type Request, type Response } from 'express';
import { ValidationError } from '@pezhwan/shared';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from '../rateLimit.ts';
import { requireAuth, requireRole } from '../index.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function createDeveloperRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const scope = (req: Request) => req.ip ?? '';

  router.post(
    '/api-keys',
    requireAuth(),
    requireRole('ADMIN'),
    rateLimit(runtime, { type: 'api', scope }),
    async (req: Request, res: Response) => {
      const { name, scopes } = (req.body ?? {}) as { name?: unknown; scopes?: unknown };
      if (typeof name !== 'string' || name.length === 0) {
        throw new ValidationError('name is required', 'NAME_REQUIRED');
      }
      const result = await runtime.apiKeys.create({
        tenantId: runtime.config.tenantId,
        applicationId: runtime.config.applicationId,
        name,
        scopes: Array.isArray(scopes) ? scopes.filter((s): s is string => typeof s === 'string') : [],
      });
      ok(res, result, 201);
    },
  );

  router.delete(
    '/api-keys/:id',
    requireAuth(),
    requireRole('ADMIN'),
    rateLimit(runtime, { type: 'api', scope }),
    async (req: Request, res: Response) => {
      const { id } = req.params;
      if (!id || Array.isArray(id)) {
        throw new ValidationError('API key id is required', 'API_KEY_ID_REQUIRED');
      }
      await runtime.apiKeys.revoke(id);
      ok(res, { message: 'API key revoked' });
    },
  );

  return router;
}