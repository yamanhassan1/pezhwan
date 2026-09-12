/**
 * PEZHWAN — subscription router.
 *
 * Plans, subscription lifecycle and entitlements backed by the core billing,
 * subscription and usage services:
 *   GET  /            — current subscription + usage entitlements for the tenant
 *   GET  /plans       — plan catalog
 *   POST /subscribe   — start a plan (returns checkout url when a provider exists)
 *   POST /cancel      — cancel a subscription
 *   GET  /entitlements — usage-driven quota summary
 */

import { Router, type Request, type Response } from 'express';
import { ValidationError } from '@pezhwan/shared';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from '../rateLimit.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

const PLANS = [
  { id: 'starter', name: 'Starter', priceMonthly: 0, quota: { users: 100, api_keys: 5, webhooks: 2 } },
  { id: 'growth', name: 'Growth', priceMonthly: 99, quota: { users: 1_000, api_keys: 20, webhooks: 10 } },
  { id: 'enterprise', name: 'Enterprise', priceMonthly: 499, quota: { users: 10_000, api_keys: 100, webhooks: 50 } },
] as const;

export function createSubscriptionRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const scope = (req: Request) => req.ip ?? '';
  const linked = rateLimit(runtime, { type: 'api', scope });

  router.get('/plans', linked, (_req: Request, res: Response) => {
    ok(res, PLANS);
  });

  router.post('/subscribe', linked, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { plan?: unknown };
    if (typeof body.plan !== 'string' || !PLANS.some((p) => p.id === body.plan)) {
      throw new ValidationError('plan must be one of ' + PLANS.map((p) => p.id).join(', '), 'PLAN_INVALID');
    }
    const result = await runtime.billing.checkout({
      tenantId: runtime.config.tenantId,
      applicationId: runtime.config.applicationId,
      plan: body.plan,
    });
    ok(res, result, 201);
  });

  router.post('/cancel', linked, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { subscriptionId?: unknown };
    if (typeof body.subscriptionId !== 'string' || body.subscriptionId.length === 0) {
      throw new ValidationError('subscriptionId is required', 'SUBSCRIPTION_ID_REQUIRED');
    }
    await runtime.subscriptions.cancel(body.subscriptionId);
    ok(res, { message: 'Subscription cancelled' });
  });

  router.get('/entitlements', linked, async (req: Request, res: Response) => {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : runtime.config.tenantId;
    const [subscription, usage] = await Promise.all([
      runtime.subscriptions.getByTenant(tenantId),
      runtime.usage.summarize(tenantId),
    ]);
    ok(res, {
      tenantId,
      subscription,
      usage,
    });
  });

  router.get('/', linked, async (req: Request, res: Response) => {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : runtime.config.tenantId;
    const subscription = await runtime.subscriptions.getByTenant(tenantId);
    ok(res, { subscription });
  });

  return router;
}