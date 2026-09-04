/**
 * PEZHWAN — Nodemailer (SMTP) email OTP provider.
 *
 * Uses `nodemailer` — the standard Node SMTP library — which is loaded lazily
 * and is an OPTIONAL dependency: if it is not installed, `healthCheck()`
 * reports the transport as unavailable rather than crashing startup. This
 * keeps the core SDK dependency-free while still supporting real SMTP.
 */

import type { DeliveryResult, HealthStatus, OtpProvider, OtpSendParams } from '../otp-provider.ts';

export interface NodemailerSmtpProviderOptions {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
  /** Optional subject template; `{code}` is replaced with the OTP. */
  subjectTemplate?: string;
  id?: string;
  timeoutMs?: number;
}

type SmtpTransport = {
  sendMail: (opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) => Promise<{ rejected?: unknown[]; accepted?: unknown[] }>;
  close?: () => void;
};

let cachedTransport: { transport: SmtpTransport; dispose: () => void } | null = null;

export class NodemailerSmtpProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'email' as const;

  constructor(private readonly options: NodemailerSmtpProviderOptions) {
    this.id = options.id ?? 'nodemailer-smtp';
  }

  private async loadTransport(): Promise<{ transport: SmtpTransport; dispose: () => void }> {
    if (cachedTransport) {
      return cachedTransport;
    }
    let nodemailer: typeof import('nodemailer');
    try {
      nodemailer = (await import('nodemailer')).default;
    } catch {
      throw new Error('nodemailer is not installed; cannot use the SMTP provider');
    }
    const transport = nodemailer.createTransport({
      host: this.options.host,
      port: this.options.port,
      secure: this.options.secure ?? this.options.port === 465,
      auth:
        this.options.user && this.options.pass
          ? { user: this.options.user, pass: this.options.pass }
          : undefined,
      connectionTimeout: this.options.timeoutMs ?? 15_000,
      greetingTimeout: this.options.timeoutMs ?? 15_000,
      socketTimeout: this.options.timeoutMs ?? 15_000,
    }) as unknown as SmtpTransport;
    cachedTransport = {
      transport,
      dispose: () => {
        try {
          transport.close?.();
        } catch {
          /* noop */
        }
        cachedTransport = null;
      },
    };
    return cachedTransport;
  }

  async sendEmail(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();
    try {
      const { transport } = await this.loadTransport();
      const subject = (this.options.subjectTemplate ?? 'Your verification code: {code}').replace(
        /\{code\}/g,
        params.code,
      );
      await transport.sendMail({
        from: this.options.from,
        to: params.to,
        subject,
        text: `Your PEZHWAN verification code is ${params.code}`,
      });
      return {
        ok: true,
        accepted: true,
        providerId: this.id,
        latencyMs: Date.now() - started,
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
      await this.loadTransport();
      const { transport } = await this.loadTransport();
      // No generic verify API; a successful transport construction is enough.
      void transport;
      return { ok: true, providerId: this.id, latencyMs: Date.now() - started };
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

/** Release the singleton SMTP transport (call once on app shutdown). */
export function disposeNodemailerSmtp(): void {
  if (cachedTransport) {
    cachedTransport.dispose();
  }
}
