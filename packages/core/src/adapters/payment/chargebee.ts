/**
 * PEZHWAN — Chargebee payment adapter.
 *
 * Drives Chargebee subscriptions over its REST v2 API (form-encoded body,
 * basic auth with the API key). Checkout links come from the hosted pages API.
 */

import type { BillingProviderClient } from '../../services/ecosystem/billing.service.ts';

export interface ChargebeeOptions {
  site: string;
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

type CheckoutResult = { url: string; externalId: string };

export class ChargebeeAdapter implements BillingProviderClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ChargebeeOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl =
      options.baseUrl ?? `https://${options.site}.chargebee.com/api/v2`;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async createCheckout(plan: string, customerRef: string): Promise<CheckoutResult> {
    const body = new URLSearchParams({
      embed: 'false',
      'subscription[plan_id]': plan,
    });
    const response = await this.fetchImpl(`${this.baseUrl}/hosted_pages/checkout_new`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new Error(`Chargebee checkout failed: ${response.status}`);
    }
    const data = (await response.json()) as {
      hosted_page?: { url?: string; id?: string };
    };
    const url = data.hosted_page?.url;
    if (!url) throw new Error('Chargebee checkout did not return a hosted page URL');
    return { url, externalId: data.hosted_page?.id ?? plan };
  }

  async cancelSubscription(externalId: string): Promise<void> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/subscriptions/${encodeURIComponent(externalId)}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Chargebee cancel failed: ${response.status}`);
    }
  }
}