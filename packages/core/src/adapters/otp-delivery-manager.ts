/**
 * PEZHWAN — OTP delivery manager.
 *
 * Aggregates email + SMS OTP providers behind a single facade that:
 *
 *   - wraps every provider in retry + circuit-breaker,
 *   - exposes the legacy `{ sendEmail, sendSms }` callbacks consumed by
 *     `createPezhwan` (signature: `(target, code, purpose) => Promise<void>`),
 *   - exposes a `healthCheck()` used by the identity server's readiness probe.
 *
 * Design rules:
 *   - Delivery is FAIL-CLOSED for the auth flow: if every provider for a
 *     channel rejects the send, the corresponding method throws so the
 *     caller's OTP-request flow aborts and records a failure (the auth engine
 *     never grants an OTP it could not deliver).
 *   - Providers are ordered by priority; when more than one provider exists
 *     for a channel, they are tried in order until one accepts (failover).
 *   - No credentials are embedded here; every secret comes from provider
 *     options supplied by the caller.
 */

import type { DeliveryResult, HealthStatus, OtpProvider, OtpSendParams } from './otp-provider.ts';
import { withCircuitBreaker, withRetry, type CircuitState } from './otp-provider.ts';
import type { OtpPurpose } from '@pezhwan/shared';

export interface OtpDeliveryManagerOptions {
  /** Ordered email providers (first is primary; used as failover chain). */
  emailProviders?: OtpProvider[];
  /** Ordered SMS providers (first is primary; used as failover chain). */
  smsProviders?: OtpProvider[];
  /** Retry tuning for each wrapped provider. */
  retry?: {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterMs?: number;
  };
  /** Circuit-breaker tuning for each wrapped provider. */
  circuitBreaker?: {
    failureThreshold?: number;
    successThreshold?: number;
    cooldownMs?: number;
  };
}

export interface OtpChannelHealth {
  channel: 'email' | 'sms';
  available: boolean;
  providers: HealthStatus[];
}

export interface OtpDeliverySummary {
  email: OtpChannelHealth;
  sms: OtpChannelHealth;
  overall: boolean;
  circuitStates: Record<string, CircuitState>;
}

export class OtpDeliveryManager {
  private readonly emailProviders: Array<{ provider: OtpProvider; state: () => CircuitState }>;
  private readonly smsProviders: Array<{ provider: OtpProvider; state: () => CircuitState }>;

  constructor(private readonly options: OtpDeliveryManagerOptions = {}) {
    this.emailProviders = this.wrap(options.emailProviders ?? []);
    this.smsProviders = this.wrap(options.smsProviders ?? []);
  }

  private wrap(list: OtpProvider[]): Array<{ provider: OtpProvider; state: () => CircuitState }> {
    return list.map((p) => {
      const retried = withRetry(p, this.options.retry ?? {});
      const { provider, state } = withCircuitBreaker(retried, this.options.circuitBreaker ?? {});
      return { provider, state };
    });
  }

  /** True if a channel has at least one configured provider. */
  hasChannel(channel: 'email' | 'sms'): boolean {
    return channel === 'email' ? this.emailProviders.length > 0 : this.smsProviders.length > 0;
  }

  /**
   * Send an email OTP. Tries providers in priority order until one accepts.
   * Throws if every provider rejects (fail-closed for the auth flow).
   */
  async sendEmail(target: string, code: string, purpose: OtpPurpose): Promise<void> {
    await this.dispatch(this.emailProviders, 'sendEmail', {
      to: target,
      code,
      context: { purpose },
    });
  }

  /**
   * Send an SMS OTP. Tries providers in priority order until one accepts.
   * Throws if every provider rejects (fail-closed for the auth flow).
   */
  async sendSms(target: string, code: string, purpose: OtpPurpose): Promise<void> {
    await this.dispatch(this.smsProviders, 'sendSms', {
      to: target,
      code,
      context: { purpose },
    });
  }

  private async dispatch(
    chain: Array<{ provider: OtpProvider; state: () => CircuitState }>,
    method: 'sendEmail' | 'sendSms',
    params: OtpSendParams,
  ): Promise<void> {
    if (chain.length === 0) {
      throw new Error(`No ${method === 'sendEmail' ? 'email' : 'sms'} OTP provider is configured`);
    }
    const errors: DeliveryResult[] = [];
    for (const { provider } of chain) {
      const send = provider[method];
      if (!send) {
        errors.push({
          ok: false,
          providerId: provider.id,
          latencyMs: 0,
          error: 'provider does not support this channel',
        });
        continue;
      }
      const result = await send(params);
      if (result.ok) {
        return;
      }
      errors.push(result);
    }
    const detail = errors.map((e) => `${e.providerId}: ${e.error ?? 'rejected'}`).join('; ');
    throw new Error(`OTP delivery failed: ${detail}`);
  }

  /**
   * Probe every configured provider for liveness. Used by the readiness
   * endpoint so operators can see provider availability at a glance.
   */
  async healthCheck(): Promise<OtpDeliverySummary> {
    const email = await this.probe('email', this.emailProviders);
    const sms = await this.probe('sms', this.smsProviders);
    return {
      email,
      sms,
      overall: email.available || sms.available,
      circuitStates: Object.fromEntries(
        [...this.emailProviders, ...this.smsProviders].map(({ provider, state }) => [
          provider.id,
          state(),
        ]),
      ),
    };
  }

  private async probe(
    channel: 'email' | 'sms',
    chain: Array<{ provider: OtpProvider; state: () => CircuitState }>,
  ): Promise<OtpChannelHealth> {
    if (chain.length === 0) {
      return { channel, available: false, providers: [] };
    }
    const results: HealthStatus[] = [];
    for (const { provider } of chain) {
      try {
        results.push(await provider.healthCheck());
      } catch (err) {
        results.push({
          ok: false,
          providerId: provider.id,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      channel,
      available: results.some((r) => r.ok),
      providers: results,
    };
  }
}
