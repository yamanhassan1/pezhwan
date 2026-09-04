/**
 * PEZHWAN — Twilio SMS OTP provider (REST over HTTPS).
 *
 * Calls the Twilio Messages API directly with the platform `fetch`. The
 * account SID + auth token are used for HTTP Basic auth and are supplied via
 * provider options (never embedded or logged).
 */

import type { DeliveryResult, HealthStatus, OtpProvider, OtpSendParams } from '../otp-provider.ts';
import { callHttp, parseJsonBody } from '../http.ts';

export interface TwilioSmsProviderOptions {
  accountSid: string;
  authToken: string;
  from: string;
  id?: string;
  timeoutMs?: number;
}

export class TwilioSmsProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'sms' as const;

  constructor(private readonly options: TwilioSmsProviderOptions) {
    if (!options.accountSid || !options.authToken || !options.from) {
      throw new Error('TwilioSmsProvider requires accountSid, authToken and from');
    }
    this.id = options.id ?? 'twilio-sms';
  }

  async sendSms(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.options.accountSid}/Messages.json`;
    const body =
      `To=${encodeURIComponent(params.to)}` +
      `&From=${encodeURIComponent(this.options.from)}` +
      `&Body=${encodeURIComponent(`Your PEZHWAN verification code is ${params.code}`)}`;
    const basic = Buffer.from(
      `${this.options.accountSid}:${this.options.authToken}`,
      'utf8',
    ).toString('base64');
    try {
      const res = await callHttp({
        url,
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
        error: `Twilio rejected with ${res.statusCode}: ${text.slice(0, 300)}`,
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
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.options.accountSid}.json`;
    const basic = Buffer.from(
      `${this.options.accountSid}:${this.options.authToken}`,
      'utf8',
    ).toString('base64');
    try {
      const res = await callHttp({
        url,
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
