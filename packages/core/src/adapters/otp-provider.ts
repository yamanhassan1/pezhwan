/**
 * PEZHWAN — OTP delivery provider abstraction.
 *
 * Production OTP delivery (email/SMS) is behind a single provider contract so
 * the core auth flow never depends on a specific vendor. This module defines:
 *
 *   - OtpProvider            the contract every transport implements
 *   - withRetry()            exponential-backoff retry wrapper
 *   - withCircuitBreaker()   fail-fast circuit breaker wrapper
 *
 * The concrete transports (Nodemailer/SMTP, SendGrid, AWS SES, Twilio, AWS SNS
 * and the dev/test mocks) live in `adapters/email/*` and `adapters/sms/*`.
 * `OtpDeliveryManager` (adapters/otp-delivery-manager.ts) aggregates them and
 * bridges back to the legacy `{ sendEmail, sendSms }` callbacks consumed by
 * `createPezhwan`.
 *
 * Design rules:
 *   - No credentials are ever embedded here; every secret comes from the
 *     caller via provider options (typically sourced from a secret provider).
 *   - Delivery never throws for a rejected send: it returns a DeliveryResult
 *     so callers can decide on retry/policy. Only truly unexpected errors
 *     bubble (and are caught by the retry/breaker wrappers).
 */

/**
 * Channel a provider can deliver on. Kept distinct from the shared
 * `OtpChannel` ('email' | 'phone') because providers model an SMS/`both`
 * vocabulary; named uniquely to avoid a public `@pezhwan/core` collision.
 */
export type ProviderChannel = 'email' | 'sms' | 'both';

/** Optional per-delivery metadata (tenant/application/user correlation). */
export interface DeliveryContext {
  tenantId?: string;
  applicationId?: string;
  userId?: string;
  /** OTP purpose when known, e.g. 'login' | 'signup' | 'password_reset'. */
  purpose?: string;
}

/** Outcome of a single delivery attempt (never throws for a send rejection). */
export interface DeliveryResult {
  ok: boolean;
  /** Provider accepted/enqueued the message (vs. provably rejected it). */
  accepted?: boolean;
  providerId: string;
  latencyMs: number;
  error?: string;
  statusCode?: number;
}

/** Provider liveness / readiness probe outcome. */
export interface HealthStatus {
  ok: boolean;
  providerId: string;
  detail?: string;
  latencyMs?: number;
}

/** Parameters for sending an OTP (kept minimal and vendor-agnostic). */
export interface OtpSendParams {
  to: string;
  code: string;
  context?: DeliveryContext;
}

export interface OtpProvider {
  readonly id: string;
  readonly channel: ProviderChannel;
  sendEmail?(params: OtpSendParams): Promise<DeliveryResult>;
  sendSms?(params: OtpSendParams): Promise<DeliveryResult>;
  healthCheck(): Promise<HealthStatus>;
}

// ---------------------------------------------------------------------------
// Retry (exponential backoff with optional jitter)
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Total attempts, including the first. Default 3. */
  attempts?: number;
  /** Base delay before the first retry. Default 250ms. */
  baseDelayMs?: number;
  /** Upper bound for any single backoff delay. Default 4000ms. */
  maxDelayMs?: number;
  /** Random jitter (+/- this many ms) on each delay. Default 0. */
  jitterMs?: number;
  /** Decide whether a failed DeliveryResult should be retried. Default: retry
   *  transient provider/transport-ish rejections (5xx/429/network), not 4xx. */
  isRetryable?: (result: DeliveryResult) => boolean;
  /** Signal for cancellation / aborting the whole retry loop. */
  shouldAbort?: () => boolean;
}

function defaultRetryable(result: DeliveryResult): boolean {
  if (result.ok) return false;
  const code = result.statusCode ?? 0;
  // 4xx other than 429 are client errors — retrying won't help. 429 (rate
  // limit), 5xx and unknown/network failures are worth a retry.
  if (code >= 400 && code < 500 && code !== 429) return false;
  return true;
}

/**
 * Wrap a provider so that a rejected/errored delivery is retried with
 * exponential backoff and jitter. Does not retry after 4xx client errors
 * (except 429). The wrapper is transparent: it exposes the same contract.
 */
export function withRetry(provider: OtpProvider, options: RetryOptions = {}): OtpProvider {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const jitterMs = options.jitterMs ?? 0;
  const isRetryable = options.isRetryable ?? defaultRetryable;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function run<T extends OtpSendParams>(
    send: (p: T) => Promise<DeliveryResult>,
    params: T,
  ): Promise<DeliveryResult> {
    let last: DeliveryResult | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (options.shouldAbort?.()) {
        return {
          ok: false,
          providerId: provider.id,
          latencyMs: 0,
          error: 'Retry aborted',
        };
      }
      const started = Date.now();
      try {
        const res = await send(params);
        res.latencyMs = Date.now() - started;
        if (res.ok || attempt >= attempts || !isRetryable(res)) {
          return res;
        }
        last = res;
      } catch (err) {
        const res: DeliveryResult = {
          ok: false,
          providerId: provider.id,
          latencyMs: Date.now() - started,
        };
        if (attempt >= attempts || (err instanceof Error && err.name === 'AbortError')) {
          res.error = err instanceof Error ? err.message : String(err);
          return res;
        }
        res.error = err instanceof Error ? err.message : String(err);
        last = res;
      }
      if (attempt < attempts) {
        await sleep(backoff(attempt, baseDelayMs, maxDelayMs, jitterMs));
      }
    }
    return (
      last ?? {
        ok: false,
        providerId: provider.id,
        latencyMs: 0,
        error: 'Delivery failed after retries',
      }
    );
  }

  return {
    id: provider.id,
    channel: provider.channel,
    sendEmail: provider.sendEmail
      ? (p: OtpSendParams) => run(provider.sendEmail!.bind(provider), p)
      : undefined,
    sendSms: provider.sendSms
      ? (p: OtpSendParams) => run(provider.sendSms!.bind(provider), p)
      : undefined,
    healthCheck: provider.healthCheck.bind(provider),
  };
}

function backoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterMs: number,
): number {
  const exp = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  if (jitterMs > 0) {
    const j = (Math.random() * 2 - 1) * jitterMs;
    return Math.max(0, Math.round(exp + j));
  }
  return Math.round(exp);
}

// ---------------------------------------------------------------------------
// Circuit breaker (fail fast; open → half-open → closed)
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before the breaker opens. Default 5. */
  failureThreshold?: number;
  /** Consecutive successes in half-open needed to close again. Default 2. */
  successThreshold?: number;
  /** Time (ms) the breaker stays open before probing (half-open). Default 30s. */
  cooldownMs?: number;
  onStateChange?: (state: CircuitState, from: CircuitState) => void;
}

/**
 * Wrap a provider in a circuit breaker. Once `failureThreshold` consecutive
 * deliveries fail the breaker trips OPEN and short-circuits (returns an
 * immediate failure) to avoid hammering a dead transport. After `cooldownMs`
 * it half-opens and lets one probe through; a run of `successThreshold`
 * successes closes it. Toggling is purely about delivery availability — the
 * auth flow itself always prefers fail-closed decisions elsewhere.
 */
export function withCircuitBreaker(
  provider: OtpProvider,
  options: CircuitBreakerOptions = {},
): { provider: OtpProvider; state(): CircuitState } {
  const failureThreshold = options.failureThreshold ?? 5;
  const successThreshold = options.successThreshold ?? 2;
  const cooldownMs = options.cooldownMs ?? 30_000;

  let state: CircuitState = 'closed';
  let consecutiveFailures = 0;
  let consecutiveSuccesses = 0;
  let openedAt = 0;

  function setState(next: CircuitState): void {
    if (next === state) return;
    const from = state;
    state = next;
    options.onStateChange?.(next, from);
  }

  function recordFailure(): void {
    consecutiveFailures += 1;
    consecutiveSuccesses = 0;
    if (state === 'closed' && consecutiveFailures >= failureThreshold) {
      openedAt = Date.now();
      setState('open');
    }
    if (state === 'half_open' && consecutiveFailures >= 1) {
      openedAt = Date.now();
      setState('open');
    }
  }

  function recordSuccess(): void {
    consecutiveSuccesses += 1;
    if (state === 'half_open' && consecutiveSuccesses >= successThreshold) {
      consecutiveFailures = 0;
      setState('closed');
    }
    if (state === 'open') {
      // Shouldn't normally happen, but guard anyway.
      setState('half_open');
    }
  }

  function isOpen(): boolean {
    if (state === 'closed') return false;
    if (state === 'half_open') return false;
    if (Date.now() - openedAt >= cooldownMs) {
      consecutiveFailures = 0;
      setState('half_open');
      return false;
    }
    return true;
  }

  async function guard<T extends OtpSendParams>(
    send: (p: T) => Promise<DeliveryResult>,
    params: T,
  ): Promise<DeliveryResult> {
    const started = Date.now();
    if (isOpen()) {
      return {
        ok: false,
        accepted: false,
        providerId: provider.id,
        latencyMs: Date.now() - started,
        error: 'Circuit open — delivery short-circuited',
        statusCode: 503,
      };
    }
    try {
      const res = await send(params);
      res.latencyMs = Date.now() - started;
      if (res.ok) {
        recordSuccess();
      } else {
        recordFailure();
      }
      return res;
    } catch (err) {
      recordFailure();
      return {
        ok: false,
        providerId: provider.id,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    provider: {
      id: provider.id,
      channel: provider.channel,
      sendEmail: provider.sendEmail
        ? (p: OtpSendParams) => guard(provider.sendEmail!.bind(provider), p)
        : undefined,
      sendSms: provider.sendSms
        ? (p: OtpSendParams) => guard(provider.sendSms!.bind(provider), p)
        : undefined,
      healthCheck: provider.healthCheck.bind(provider),
    },
    state: () => state,
  };
}
