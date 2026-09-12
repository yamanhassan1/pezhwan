/**
 * PEZHWAN — SCIM 2.0 router.
 *
 * Implements the provisioning surface (/Users, /Groups, /ServiceProviderConfig)
 * on top of the @pezhwan/oauth SCIM stores. Resources live in memory per
 * runtime instance — the reference surface for directory integrations; a
 * production deployment swaps the store for UserModel-backed persistence.
 *
 * Responses follow RFC 7643 (resource/list/error envelopes).
 */

import { Router, type Request, type Response } from 'express';
import { ValidationError, type ScimUser, type ScimGroup, type ScimPatchOperation } from '@pezhwan/shared';
import {
  MemoryScimUserStore,
  MemoryScimGroupStore,
  scimListUsers,
  scimListGroups,
  serviceProviderConfig,
  userSchemaDocument,
} from '@pezhwan/oauth';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from '../rateLimit.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json(data);
}

function paramId(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

function parseCount(req: Request): number | undefined {
  const raw = req.query.count;
  if (raw === undefined) {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : undefined;
}

function parseStartIndex(req: Request): number {
  const raw = req.query.startIndex;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function createScimRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const scope = (req: Request) => req.ip ?? '';
  const users = new MemoryScimUserStore();
  const groups = new MemoryScimGroupStore();
  const linked = rateLimit(runtime, { type: 'api', scope });

  // --- Users -----------------------------------------------------------------

  router.get('/Users', linked, (req: Request, res: Response) => {
    const filter = typeof req.query.filter === 'string' ? req.query.filter : undefined;
    ok(res, scimListUsers(users, { filter, startIndex: parseStartIndex(req), count: parseCount(req) }));
  });

  router.post('/Users', linked, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const userName = body?.userName;
    if (typeof userName !== 'string' || userName.length === 0) {
      throw new ValidationError('userName is required', 'USERNAME_REQUIRED');
    }
    ok(res, users.create({ ...(body as Omit<ScimUser, 'id'>), userName }), 201);
  });

  router.get('/Users/:id', linked, (req: Request, res: Response) => {
    ok(res, users.get(paramId(req, 'id')));
  });

  router.put('/Users/:id', linked, (req: Request, res: Response) => {
    const body = req.body as Partial<ScimUser> | undefined;
    if (!body || typeof body.userName !== 'string') {
      throw new ValidationError('userName is required', 'USERNAME_REQUIRED');
    }
    ok(res, users.replace(paramId(req, 'id'), body as Omit<ScimUser, 'id'>));
  });

  router.patch('/Users/:id', linked, (req: Request, res: Response) => {
    const body = req.body as { Operations?: unknown[] } | undefined;
    const Operations = Array.isArray(body?.Operations) ? body.Operations : [];
    ok(res, users.patch(paramId(req, 'id'), Operations as ScimPatchOperation[]));
  });

  router.delete('/Users/:id', linked, (req: Request, res: Response) => {
    users.delete(paramId(req, 'id'));
    res.status(204).end();
  });

  // --- Groups ----------------------------------------------------------------

  router.get('/Groups', linked, (req: Request, res: Response) => {
    const filter = typeof req.query.filter === 'string' ? req.query.filter : undefined;
    ok(res, scimListGroups(groups, { filter, startIndex: parseStartIndex(req), count: parseCount(req) }));
  });

  router.post('/Groups', linked, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const displayName = body?.displayName;
    if (typeof displayName !== 'string' || displayName.length === 0) {
      throw new ValidationError('displayName is required', 'DISPLAY_NAME_REQUIRED');
    }
    ok(res, groups.create({ ...(body as Omit<ScimGroup, 'id'>), displayName }), 201);
  });

  router.get('/Groups/:id', linked, (req: Request, res: Response) => {
    ok(res, groups.get(paramId(req, 'id')));
  });

  router.put('/Groups/:id', linked, (req: Request, res: Response) => {
    const body = req.body as Partial<ScimGroup> | undefined;
    if (!body || typeof body.displayName !== 'string') {
      throw new ValidationError('displayName is required', 'DISPLAY_NAME_REQUIRED');
    }
    ok(res, groups.replace(paramId(req, 'id'), body as Omit<ScimGroup, 'id'>));
  });

  router.patch('/Groups/:id', linked, (req: Request, res: Response) => {
    const body = req.body as { Operations?: unknown[] } | undefined;
    const Operations = Array.isArray(body?.Operations) ? body.Operations : [];
    ok(res, groups.patch(paramId(req, 'id'), Operations as ScimPatchOperation[]));
  });

  router.delete('/Groups/:id', linked, (req: Request, res: Response) => {
    groups.delete(paramId(req, 'id'));
    res.status(204).end();
  });

  // --- Service discovery ------------------------------------------------------

  router.get('/ServiceProviderConfig', linked, (_req: Request, res: Response) => {
    ok(res, serviceProviderConfig());
  });

  router.get('/Schemas', linked, (_req: Request, res: Response) => {
    ok(res, {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
      totalResults: 1,
      Resources: [userSchemaDocument()],
    });
  });

  router.get('/', (_req: Request, res: Response) => {
    ok(res, {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: `/Users`,
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'Group',
          name: 'Group',
          endpoint: `/Groups`,
          schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        },
      ],
    });
  });

  return router;
}