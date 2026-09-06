/**
 * PEZHWAN — Paddle payment adapter.
 *
 * Drives Paddle Checkout + subscription operations over its realtime API.
 * Chargebee/paddle keys come from Paddle's version 1 API (Billing endpoint).
 */

import type { BillingProviderClient } from '../../services/ecosystem/billing.service.ts';

export interface PaddleOptions {
  vendorId: string;
  authCode: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface PaddleCheckoutResponse {
  response?: { url: string };
  error?: { message?: string };
}

export class PaddleAdapter implements BillingProviderClient {
  private readonly vendorId: string;
  private readonly authCode: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PaddleOptions) {
    this.vendorId = options.vendorId;
    this.authCode = options.authCode;
    this.baseUrl = options.baseUrl ?? 'https://vendors.paddle.com/api/2.0';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async createCheckout(plan: string, customerRef: string): Promise<{ url: string; externalId: string }> {
    const body = new URLSearchParams({
      vendor_id: this.vendorId,
      vendor_auth_code: this.authCode,
      product_id: plan,
      custom_message: `client_ref:${customerRef}`,
      success_url: 'https://console.pezhwan.local/billing/success',
    });
    const response = await this.fetchImpl(`${this.baseUrl}/product/generate_pay_link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new Error(`Paddle checkout failed: ${response.status}`);
    }
    const data = (await response.json()) as PaddleCheckoutResponse;
    if (!data.response?.url) {
      throw new Error(`Paddle checkout error: ${data.error?.message ?? 'unknown'}`);
    }
    return { url: data.response.url, externalId: plan };
  }

  async cancelSubscription(externalId: string): Promise<void> {
    const body = new URLSearchParams({
      vendor_id: this.vendorId,
      vendor_auth_code: this.authCode,
      subscription_id: externalId,
    });
    await this.fetchImpl(`${this.baseUrl}/subscription/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }
}