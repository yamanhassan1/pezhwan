/**
 * PEZHWAN — compliance router.
 *
 *   GET  /status    — audit subsystem availability
 *   POST /retention — (ADMIN) set audit log retention in days
 *
 * The audit service streams (`log`/sink); it has no query endpoint — records
 * are delivered via the configured sink, which /status reports truthfully.
 */

import { Router, type Request, type Response } from 'express';
import { ValidationError } from '@pezhwan/shared';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from '../rateLimit.ts';
import { requireAuth, requireRole } from '../index.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function createComplianceRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const scope = (req: Request) => req.ip ?? '';

  router.get(
    '/status',
    rateLimit(runtime, { type: 'api', scope }),
    (_req: Request, res: Response) => {
      ok(res, {
        audit: 'streaming',
        message: 'Audit records are delivered through the configured sink',
      });
    },
  );

  router.post(
    '/retention',
    requireAuth(),
    requireRole('ADMIN'),
    rateLimit(runtime, { type: 'api', scope }),
    (req: Request, res: Response) => {
      const { days } = (req.body ?? {}) as { days?: number };
      if (typeof days !== 'number' || !Number.isFinite(days) || days < 1) {
        throw new ValidationError('days must be a positive number', 'DAYS_REQUIRED');
      }
      runtime.audit.setRetentionDays(Math.floor(days));
      ok(res, { retentionDays: Math.floor(days) });
    },
  );

  return router;
}