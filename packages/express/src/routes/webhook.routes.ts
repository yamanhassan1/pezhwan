/**
 * PEZHWAN — webhook router.
 *
 * Outbound event-delivery surface backed by the core WebhookService:
 *   GET  /               — list registered endpoints for this tenant
 *   POST /               — register an endpoint (secret returned once)
 *   GET  /:id            — fetch one endpoint
 *   GET  /:id/deliveries — delivery ledger for one endpoint
 *   POST /:id/test       — fire a synthetic {event, payload} through the queue
 *
 * Secret handling: the signing secret is generated server-side. It is returned
 * exactly once (in the create response) and stored hashed/opaque after that.
 */

import { Router, type Request, type Response } from 'express';
import { ValidationError, NotFoundError } from '@pezhwan/shared';
import { WebhookDeliveryModel } from '@pezhwan/core';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from '../rateLimit.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

function paramId(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

export function createWebhookRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const scope = (req: Request) => req.ip ?? '';
  const linked = rateLimit(runtime, { type: 'api', scope });

  router.get('/', linked, async (req: Request, res: Response) => {
    const webhooks = await runtime.webhooks.list(runtime.config.tenantId);
    ok(
      res,
      webhooks.map((w) => ({
        id: String(w._id),
        url: w.url,
        events: w.events,
        active: w.active,
        maxRetries: w.maxRetries,
        createdAt: w.createdAt,
      })),
    );
  });

  router.post('/', linked, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { url?: unknown; events?: unknown };
    if (typeof body.url !== 'string' || body.url.length === 0) {
      throw new ValidationError('url is required', 'URL_REQUIRED');
    }
    const events = Array.isArray(body.events)
      ? body.events.filter((e): e is string => typeof e === 'string')
      : [];
    const webhook = await runtime.webhooks.register({
      url: body.url,
      events,
      tenantId: runtime.config.tenantId,
      applicationId: runtime.config.applicationId,
    });
    ok(
      res,
      {
        id: String(webhook._id),
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        maxRetries: webhook.maxRetries,
        // Shown once. HMAC signing key for x-pezhwan-signature verification.
        secret: webhook.secret,
      },
      201,
    );
  });

  router.get('/:id', linked, async (req: Request, res: Response) => {
    const webhook = await runtime.webhooks.list(runtime.config.tenantId);
    const match = webhook.find((w) => String(w._id) === paramId(req, 'id'));
    if (!match) {
      throw new NotFoundError('Webhook not found');
    }
    ok(res, {
      id: String(match._id),
      url: match.url,
      events: match.events,
      active: match.active,
      maxRetries: match.maxRetries,
      createdAt: match.createdAt,
    });
  });

  router.get('/:id/deliveries', linked, async (req: Request, res: Response) => {
    const deliveries = await WebhookDeliveryModel.find({ webhookId: paramId(req, 'id') })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    ok(res, deliveries);
  });

  router.post('/:id/test', linked, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { event?: unknown; payload?: unknown };
    const event = typeof body.event === 'string' && body.event ? body.event : 'webhook.test';
    await runtime.webhooks.dispatch(event, {
      payload: body.payload ?? {},
      webhookId: paramId(req, 'id'),
    });
    ok(res, { message: `Event "${event}" dispatched` });
  });

  return router;
}