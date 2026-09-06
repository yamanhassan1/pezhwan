/**
 * PEZHWAN — Webhook service.
 *
 * Dispatches webhook deliveries to registered endpoints with HMAC signatures
 * and retry/backoff, recording each attempt in the delivery ledger.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { WebhookModel, type WebhookDoc } from '../../models/webhook.model.ts';
import { WebhookDeliveryModel } from '../../models/webhook-delivery.model.ts';

export interface WebhookDispatch {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface WebhookServiceOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

export class WebhookService {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(options: WebhookServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? 5;
  }

  /** Creates an HMAC-SHA256 signature for a delivery. */
  static sign(secret: string, payload: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  static randomSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  async register(input: {
    url: string;
    events: string[];
    tenantId?: string;
    applicationId?: string;
  }): Promise<WebhookDoc> {
    return WebhookModel.create({
      url: input.url,
      events: input.events,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      secret: WebhookService.randomSecret(),
      active: true,
      maxRetries: this.maxRetries,
    });
  }

  async list(tenantId?: string): Promise<WebhookDoc[]> {
    if (tenantId) return WebhookModel.find({ tenantId });
    return WebhookModel.find();
  }

  /** Dispatches a single event to every matching registered endpoint. */
  async dispatch(event: string, payload: Record<string, unknown>): Promise<void> {
    const webhooks = await WebhookModel.find({ events: event, active: true });
    for (const webhook of webhooks) {
      void this.deliver(webhook, event, payload);
    }
  }

  async deliver(webhook: WebhookDoc, event: string, payload: Record<string, unknown>): Promise<void> {
    let attempts = 0;
    let nextAttemptAt = new Date();
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    for (;;) {
      attempts += 1;
      const signature = webhook.secret ? WebhookService.sign(webhook.secret, body) : undefined;
      try {
        const response = await this.fetchImpl(webhook.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(signature ? { 'x-pezhwan-signature': signature } : {}),
            'x-pezhwan-event': event,
          },
          body,
        });
        const ok = response.ok || response.status === 404;
        const delivery = {
          webhookId: webhook._id as unknown as string,
          event,
          payload,
          status: ok ? ('delivered' as const) : ('failed' as const),
          attempts,
          lastStatusCode: response.status,
        };
        const doc = await WebhookDeliveryModel.create(delivery);
        if (ok) return;
        if (attempts >= (webhook.maxRetries ?? this.maxRetries)) {
          await WebhookDeliveryModel.updateOne({ _id: doc._id }, { $set: { status: 'failed' } });
          return;
        }
        nextAttemptAt = new Date(Date.now() + 1_000 * Math.pow(2, attempts));
        await WebhookDeliveryModel.updateOne(
          { _id: doc._id },
          { $set: { status: 'retrying', nextAttemptAt } },
        );
      } catch (cause) {
        const delivery = await WebhookDeliveryModel.create({
          webhookId: webhook._id as unknown as string,
          event,
          payload,
          status: 'failed',
          attempts,
          lastError: cause instanceof Error ? cause.message : String(cause),
        });
        if (attempts >= (webhook.maxRetries ?? this.maxRetries)) return;
        nextAttemptAt = new Date(Date.now() + 1_000 * Math.pow(2, attempts));
        await WebhookDeliveryModel.updateOne(
          { _id: delivery._id },
          { $set: { status: 'retrying', nextAttemptAt } },
        );
      }
      const wait = Math.max(0, nextAttemptAt.getTime() - Date.now());
      await sleep(wait);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}