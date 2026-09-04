/**
 * PEZHWAN — Mailgun email OTP provider (REST over HTTPS).
 *
 * Calls the Mailgun Messages API directly with the platform `fetch`.
 * No vendor SDK is required. The API key is supplied at construction time
 * (never embedded or logged).
 */

import type { DeliveryResult, HealthStatus, OtpProvider, OtpSendParams } from '../otp-provider.ts';
import { callHttp, parseJsonBody } from '../http.ts';

export interface MailgunProviderOptions {
  apiKey: string;
  domain: string;
  from: string;
  fromName?: string;
  /** Optional subject template; `{code}` is replaced. */
  subjectTemplate?: string;
  /** EU region endpoint (default: US). */
  eu?: boolean;
  id?: string;
  timeoutMs?: number;
}

export class MailgunProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'email' as const;

  private readonly baseUrl: string;

  constructor(private readonly options: MailgunProviderOptions) {
    if (!options.apiKey || !options.domain) {
      throw new Error('MailgunProvider requires an API key and domain');
    }
    this.id = options.id ?? 'mailgun';
    this.baseUrl = options.eu
      ? `https://api.eu.mailgun.net/v3/${options.domain}`
      : `https://api.mailgun.net/v3/${options.domain}`;
  }

  async sendEmail(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();
    const subject = (this.options.subjectTemplate ?? 'Your verification code: {code}').replace(
      /\{code\}/g,
      params.code,
    );

    const from = this.options.fromName
      ? `${this.options.fromName} <${this.options.from}>`
      : this.options.from;

    const body =
      `from=${encodeURIComponent(from)}` +
      `&to=${encodeURIComponent(params.to)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&text=${encodeURIComponent(`Your PEZHWAN verification code is ${params.code}`)}`;

    const basic = Buffer.from(`api:${this.options.apiKey}`, 'utf8').toString('base64');

    try {
      const res = await callHttp({
        url: `${this.baseUrl}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
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
        error: `Mailgun rejected with ${res.statusCode}: ${text.slice(0, 300)}`,
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
    const basic = Buffer.from(`api:${this.options.apiKey}`, 'utf8').toString('base64');

    try {
      const res = await callHttp({
        url: `${this.baseUrl}/domains`,
        method: 'GET',
        headers: { Authorization: `Basic ${basic}` },
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
