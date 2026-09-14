/**
 * PEZHWAN — admin router.
 *
 *   GET  /status          — runtime status: issuer, uptime, metrics snapshot
 *   GET  /healthz         — liveness probe
 *   POST /metrics/flush   — (ADMIN) flush buffered metrics to the exporter
 *
 * All endpoints degrade to explicit error envelopes; none fabricate data.
 */

import { Router, type Request, type Response } from 'express';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from '../rateLimit.ts';
import { requireAuth, requireRole } from '../index.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function createAdminRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const scope = (req: Request) => req.ip ?? '';

  router.get(
    '/status',
    rateLimit(runtime, { type: 'api', scope }),
    (_req: Request, res: Response) => {
      ok(res, {
        issuer: runtime.config.issuer,
        uptimeSeconds: runtime.metrics.uptimeSeconds(),
        metrics: runtime.metrics.snapshot(),
      });
    },
  );

  router.get('/healthz', (_req: Request, res: Response) => {
    ok(res, { status: 'ok' });
  });

  router.post(
    '/metrics/flush',
    requireAuth(),
    requireRole('ADMIN'),
    rateLimit(runtime, { type: 'api', scope }),
    async (_req: Request, res: Response) => {
      await runtime.metrics.flush();
      ok(res, { message: 'Metrics flushed' });
    },
  );

  return router;
}
