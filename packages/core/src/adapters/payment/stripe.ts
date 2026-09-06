/**
 * PEZHWAN — Stripe payment adapter.
 *
 * Drives Stripe Checkout + Billing via the REST API using the project's
 * `fetch` (no SDK dependency). Webhook signature verification is HMAC-SHA256.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BillingProviderClient } from '../../services/ecosystem/billing.service.ts';

export interface StripeOptions {
  secretKey: string;
  webhookSecret?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface StripeCheckoutSession {
  url: string;
  id: string;
}

export class StripeAdapter implements BillingProviderClient {
  private readonly key: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly webhookSecret?: string;

  constructor(options: StripeOptions) {
    this.key = options.secretKey;
    this.baseUrl = options.baseUrl ?? 'https://api.stripe.com/v1';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.webhookSecret = options.webhookSecret;
  }

  async createCheckout(plan: string, customerRef: string): Promise<{ url: string; externalId: string }> {
    const body = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': plan,
      'client_reference_id': customerRef,
      'success_url': 'https://console.pezhwan.local/billing/success',
      'cancel_url': 'https://console.pezhwan.local/billing/cancel',
    });
    const response = await this.fetchImpl(`${this.baseUrl}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new Error(`Stripe checkout failed: ${response.status}`);
    }
    const session = (await response.json()) as StripeCheckoutSession;
    return { url: session.url, externalId: session.id };
  }

  async cancelSubscription(externalId: string): Promise<void> {
    await this.fetchImpl(`${this.baseUrl}/subscriptions/${externalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.key}` },
    });
  }

  /** Verifies a Stripe webhook signature (hex-encoded SHA-256 HMAC). */
  verifyWebhookSignature(payload: string, signature: string, receivedAt: number): boolean {
    if (!this.webhookSecret) return false;
    const mac = createHmac('sha256', this.webhookSecret).update(`${receivedAt}.${payload}`).digest();
    const supplied = signature.split(',')[1] ?? '';
    const suppliedBuffer = Buffer.from(supplied, 'hex');
    return mac.length === suppliedBuffer.length && timingSafeEqual(mac, suppliedBuffer);
  }
}