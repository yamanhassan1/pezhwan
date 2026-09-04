/**
 * PEZHWAN — console / in-memory email OTP provider (development & tests).
 *
 * In non-production environments (or for tests) the reference identity server
 * logs the OTP to the console and/or records it in memory. This is never used
 * for real delivery — production deployments must provide a real transport.
 */

import type { HealthStatus, OtpProvider, OtpSendParams, DeliveryResult } from '../otp-provider.ts';

export interface ConsoleEmailProviderOptions {
  /** When true, also keep a copy of every sent code (for tests/demo). */
  capture?: boolean;
  id?: string;
}

export class ConsoleEmailProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'email' as const;
  readonly sent: Array<{ to: string; code: string; context?: OtpSendParams['context'] }> = [];

  constructor(private readonly options: ConsoleEmailProviderOptions = {}) {
    this.id = options.id ?? 'console-email';
  }

  async sendEmail(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();
    console.log(`[pezhwan:otp:email] ${params.to} => code ${params.code}`);
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
    return { ok: true, providerId: this.id, detail: 'console' };
  }
}
