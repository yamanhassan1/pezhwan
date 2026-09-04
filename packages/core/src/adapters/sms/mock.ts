/**
 * PEZHWAN — in-memory SMS OTP provider (development & tests).
 *
 * Mirrors the console email provider but for the SMS channel. Like all mocks
 * it is never used for real delivery in production.
 */

import type { HealthStatus, OtpProvider, OtpSendParams, DeliveryResult } from '../otp-provider.ts';

export interface MockSmsProviderOptions {
  /** When true, EVERY send fails with the given statusCode (fault injection). */
  failAll?: boolean;
  failStatusCode?: number;
  capture?: boolean;
  id?: string;
}

export class MockSmsProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'sms' as const;
  readonly sent: Array<{ to: string; code: string; context?: OtpSendParams['context'] }> = [];

  constructor(private readonly options: MockSmsProviderOptions = {}) {
    this.id = options.id ?? 'mock-sms';
  }

  async sendSms(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();
    if (this.options.failAll) {
      return {
        ok: false,
        accepted: false,
        providerId: this.id,
        latencyMs: Date.now() - started,
        error: 'Mock SMS provider configured to fail',
        statusCode: this.options.failStatusCode ?? 500,
      };
    }
    if (this.options.capture) {
      this.sent.push({ to: params.to, code: params.code, context: params.context });
    }
    return {
      ok: true,
      accepted: true,
      providerId: this.id,
      latencyMs: Date.now() - started,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.options.failAll
      ? { ok: false, providerId: this.id, detail: 'mock failing' }
      : { ok: true, providerId: this.id, detail: 'mock' };
  }
}
