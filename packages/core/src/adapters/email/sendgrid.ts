/**
 * PEZHWAN — SendGrid email OTP provider (REST over HTTPS).
 *
 * Calls the SendGrid v3 Mail Send API directly with the platform `fetch`, so
 * no vendor SDK is required. The API key is supplied at construction time
 * (never embedded or logged).
 */

import type { DeliveryResult, HealthStatus, OtpProvider, OtpSendParams } from '../otp-provider.ts';
import { callHttp, parseJsonBody } from '../http.ts';

export interface SendGridProviderOptions {
  apiKey: string;
  from: string;
  fromName?: string;
  /** Optional subject template; `{code}` is replaced. */
  subjectTemplate?: string;
  id?: string;
  timeoutMs?: number;
}

export class SendGridProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'email' as const;

  constructor(private readonly options: SendGridProviderOptions) {
    if (!options.apiKey) {
      throw new Error('SendGridProvider requires an API key');
    }
    this.id = options.id ?? 'sendgrid';
  }

  async sendEmail(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();
    const subject = (this.options.subjectTemplate ?? 'Your verification code: {code}').replace(
      /\{code\}/g,
      params.code,
    );
    const url = 'https://api.sendgrid.com/v3/mail/send';
    const body = JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: this.options.from, name: this.options.fromName },
      subject,
      content: [{ type: 'text/plain', value: `Your PEZHWAN verification code is ${params.code}` }],
    });
    try {
      const res = await callHttp({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body,
        timeoutMs: this.options.timeoutMs,
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return {
          ok: true,
          accepted: true,
          providerId: this.id,
          latencyMs: Date.now() - started,
          statusCode: res.statusCode,
        };
      }
      const { text } = parseJsonBody(res);
      return {
        ok: false,
        accepted: false,
        providerId: this.id,
        latencyMs: Date.now() - started,
        error: `SendGrid rejected with ${res.statusCode}: ${text.slice(0, 300)}`,
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
    // A lightweight authenticated GET to the send API's "email" template list
    // confirms the key is valid and the API is reachable.
    try {
      const res = await callHttp({
        url: 'https://api.sendgrid.com/v3/templates',
        method: 'GET',
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
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
