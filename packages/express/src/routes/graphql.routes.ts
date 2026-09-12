/**
 * PEZHWAN — GraphQL router.
 *
 * Read-service GraphQL endpoint over the verified identity:
 *   POST /   — execute a GraphQL query ({ query, variables?, operationName? })
 *   GET  /schema — current SDL
 *
 * The schema is intentionally small: it resolves against the runtime's own
 * session store and the caller's verified identity (req.pezhwan). Federation
 * (@apollo/subgraph) is out of scope for the reference server; this is the
 * self-service API for the current identity.
 */

import { Router, type Request, type Response } from 'express';
import { buildSchema, graphql, printSchema } from 'graphql';
import { SessionModel } from '@pezhwan/core';
import type { PezhwanRuntime } from '@pezhwan/core';
import type { PezhwanRequest } from '../index.ts';
import { rateLimit } from '../rateLimit.ts';

const TYPE_DEFS = /* GraphQL */ `
  type Viewer {
    userId: ID!
    tenantId: String!
    applicationId: String!
    roles: [String!]!
    permissions: [String!]!
    authMethod: String
  }

  type SessionInfo {
    id: ID!
    familyId: String!
    status: String!
    createdAt: String!
    expiresAt: String
  }

  type Query {
    "The verified identity attached by the auth middleware."
    viewer: Viewer!
    "Active sessions for the current identity."
    activeSessions(limit: Int = 20): [SessionInfo!]!
  }
`;

export function createGraphqlRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const scope = (req: Request) => req.ip ?? '';
  const schema = buildSchema(TYPE_DEFS);

  const root = {
    viewer: (_source: unknown, _args: unknown, context: { req: PezhwanRequest }) => {
      const identity = context.req.pezhwan;
      if (!identity) {
        throw new Error('UNAUTHENTICATED');
      }
      return {
        userId: identity.userId,
        tenantId: identity.tenantId,
        applicationId: identity.applicationId,
        roles: identity.roles,
        permissions: identity.permissions,
        authMethod: identity.authMethod,
      };
    },
    activeSessions: async (
      _source: unknown,
      args: { limit: number },
      context: { req: PezhwanRequest },
    ) => {
      const identity = context.req.pezhwan;
      if (!identity) {
        throw new Error('UNAUTHENTICATED');
      }
      const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
      const sessions = await SessionModel.find({
        userId: identity.userId,
        tenantId: identity.tenantId,
        status: { $in: ['active', 'rotating'] },
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      return sessions.map((s) => ({
        id: String(s._id),
        familyId: String(s.familyId),
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
      }));
    },
  };

  router.post('/', rateLimit(runtime, { type: 'api', scope }), async (req: PezhwanRequest, res: Response) => {
    const body = (req.body ?? {}) as { query?: unknown; variables?: unknown; operationName?: unknown };
    if (typeof body.query !== 'string' || body.query.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'GRAPHQL_QUERY_REQUIRED', message: 'query is required' },
      });
      return;
    }
    const result = await graphql({
      schema,
      source: body.query,
      rootValue: root,
      contextValue: { req },
      variableValues: (body.variables ?? {}) as Record<string, unknown>,
      operationName: typeof body.operationName === 'string' ? body.operationName : undefined,
    });
    res.status(200).json({ success: true, data: result });
  });

  router.get('/schema', (_req: Request, res: Response) => {
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.send(printSchema(schema));
  });

  return router;
}