/**
 * PEZHWAN — team router.
 *
 * Organisation / team membership backed by the core organization and team
 * services:
 *   GET  /            — teams for the current tenant
 *   POST /            — create a team under an organization
 *   GET  /:id/members — list members of a team
 *   POST /:id/members — add/remove a member
 */

import { Router, type Request, type Response } from 'express';
import { ValidationError } from '@pezhwan/shared';
import { TeamModel } from '@pezhwan/core';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from '../rateLimit.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

function paramId(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

function docId(doc: unknown): string {
  return String((doc as { _id: { toString(): string } })._id);
}

export function createTeamRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const scope = (req: Request) => req.ip ?? '';
  const linked = rateLimit(runtime, { type: 'api', scope });

  router.get('/', linked, async (_req: Request, res: Response) => {
    const organizations = await runtime.organizations.listByTenant(runtime.config.tenantId);
    const teams = await Promise.all(
      organizations.map((org) => runtime.teams.listByOrganization(docId(org))),
    );
    ok(res, teams.flat());
  });

  router.post('/', linked, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { name?: unknown; organizationId?: unknown };
    if (typeof body.name !== 'string' || body.name.length === 0) {
      throw new ValidationError('name is required', 'NAME_REQUIRED');
    }
    if (typeof body.organizationId !== 'string' || body.organizationId.length === 0) {
      throw new ValidationError('organizationId is required', 'ORGANIZATION_ID_REQUIRED');
    }
    const team = await runtime.teams.create({
      name: body.name,
      organizationId: body.organizationId,
      tenantId: runtime.config.tenantId,
    });
    ok(res, team, 201);
  });

  router.get('/:id/members', linked, async (req: Request, res: Response) => {
    const team = await TeamModel.findById(paramId(req, 'id')).lean();
    if (!team) {
      throw new ValidationError('Team not found', 'TEAM_NOT_FOUND');
    }
    ok(res, { memberIds: team.memberIds });
  });

  router.post('/:id/members', linked, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { userId?: unknown; action?: unknown };
    if (typeof body.userId !== 'string' || body.userId.length === 0) {
      throw new ValidationError('userId is required', 'USER_ID_REQUIRED');
    }
    const teamId = paramId(req, 'id');
    const team = await TeamModel.findById(teamId).lean();
    if (!team) {
      throw new ValidationError('Team not found', 'TEAM_NOT_FOUND');
    }
    const action = body.action === 'remove' ? 'remove' : 'add';
    const updated =
      action === 'add'
        ? await runtime.teams.addMember(teamId, body.userId)
        : await runtime.teams.removeMember(teamId, body.userId);
    ok(res, updated);
  });

  return router;
}