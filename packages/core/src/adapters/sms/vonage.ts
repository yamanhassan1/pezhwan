/**
 * PEZHWAN — Vonage (Nexmo) SMS OTP provider (REST over HTTPS).
 *
 * Calls the Vonage SMS API directly with the platform `fetch`.
 * No vendor SDK is required. The API key + secret are supplied at
 * construction time (never embedded or logged).
 */

import type { DeliveryResult, HealthStatus, OtpProvider, OtpSendParams } from '../otp-provider.ts';
import { callHttp, parseJsonBody } from '../http.ts';

export interface VonageSmsProviderOptions {
  apiKey: string;
  apiSecret: string;
  from: string;
  /** Optional delivery receipt webhook URL. */
  deliveryReceiptUrl?: string;
  id?: string;
  timeoutMs?: number;
}

export class VonageSmsProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'sms' as const;

  private readonly apiUrl = 'https://rest.nexmo.com/sms/json';

  constructor(private readonly options: VonageSmsProviderOptions) {
    if (!options.apiKey || !options.apiSecret || !options.from) {
      throw new Error('VonageSmsProvider requires apiKey, apiSecret and from');
    }
    this.id = options.id ?? 'vonage-sms';
  }

  async sendSms(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();

    const body =
      `api_key=${encodeURIComponent(this.options.apiKey)}` +
      `&api_secret=${encodeURIComponent(this.options.apiSecret)}` +
      `&from=${encodeURIComponent(this.options.from)}` +
      `&to=${encodeURIComponent(params.to)}` +
      `&text=${encodeURIComponent(`Your PEZHWAN verification code is ${params.code}`)}` +
      `&type=text`;

    try {
      const res = await callHttp({
        url: this.apiUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        timeoutMs: this.options.timeoutMs,
      });

      if (res.statusCode >= 200 && res.statusCode < 300) {
        const { data } = parseJsonBody(res) as {
          data?: { messages?: Array<{ status: string; 'error-text'?: string }> };
        };
        const message = data?.messages?.[0];
        const status = message?.status;

        if (status === '0') {
          return {
            ok: true,
            accepted: true,
            providerId: this.id,
            latencyMs: Date.now() - started,
            statusCode: res.statusCode,
          };
        }

        return {
          ok: false,
          accepted: false,
          providerId: this.id,
          latencyMs: Date.now() - started,
          error: `Vonage rejected: ${message?.['error-text'] ?? 'unknown error'}`,
          statusCode: res.statusCode,
        };
      }

      const { text } = parseJsonBody(res);
      return {
        ok: false,
        accepted: false,
        providerId: this.id,
        latencyMs: Date.now() - started,
        error: `Vonage HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
        statusCode: res.statusCode,
      };
    } catch (err) {
      return {
        ok: false,
        accepted: false,
        providerId: this.id,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();

    try {
      // Vonage doesn't have a dedicated health endpoint. Use the
      // account balance endpoint as a lightweight credential probe.
      const body =
        `api_key=${encodeURIComponent(this.options.apiKey)}` +
        `&api_secret=${encodeURIComponent(this.options.apiSecret)}`;

      const res = await callHttp({
        url: 'https://rest.nexmo.com/account/get-balance',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        timeoutMs: this.options.timeoutMs,
      });

      const ok = res.statusCode >= 200 && res.statusCode < 300;
      return {
        ok,
        providerId: this.id,
        latencyMs: Date.now() - started,
        detail: `http ${res.statusCode}`,
      };
    } catch (err) {
      return {
        ok: false,
        providerId: this.id,
        detail: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      };
    }
  }
}
