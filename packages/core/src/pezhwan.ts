/**
 * PEZHWAN — core builder.
 *
 * The single entry-point that constructs and wires the entire auth stack:
 * keystore, tokens, sessions, OTP, authorization, account state, audit, and
 * the auth engine. Framework adapters (@pezhwan/express, etc.) wrap this.
 */

import {
  KeyStore,
  type KeyStore as CryptoKeyStore,
} from '@pezhwan/crypto';
import type { JwtAlgorithm } from '@pezhwan/shared';
import {
  createRedisCache,
  type RedisCache,
  type RedisLike,
} from './services/redisCache.ts';
import { TokenService } from './services/token.service.ts';
import { SessionService } from './services/session.service.ts';
import { AccountStateService } from './services/accountState.service.ts';
import { AuthorizationService } from './services/authorization.service.ts';
import { AuditService } from './services/audit.service.ts';
import { OtpService, type OtpDeliveryAdapters } from './services/otp.service.ts';
import { MfaService } from './services/mfa.service.ts';
import { OAuthService } from './services/oauth.service.ts';
import { VerificationTokenService } from './services/verificationToken.service.ts';
import { ApiKeyService } from './services/apiKey.service.ts';
import { RateLimitService } from './services/rateLimit.service.ts';
import type { RateLimitRule, RateLimitType } from './services/rateLimit.service.ts';
import { PezhwanLogger, newRequestId } from './services/logger.service.ts';
import { MetricsRegistry } from './services/metrics.service.ts';
import { KeyStoreService, MemoryKeyStoreAdapter, FileKeyStoreAdapter } from './services/keyStore.service.ts';
import {
  AuthEngine,
  type AuthEngineOptions,
  type AuthEngineDeps,
  type LookupUserFn,
  type OtpDeliveryCallbacks,
} from './auth/auth.engine.ts';
import type { PasswordPolicy } from './services/password.service.ts';

export { KeyStore, MemoryKeyStoreAdapter };
export { FileKeyStoreAdapter } from './services/keyStore.service.ts';
export { KeyStoreService } from './services/keyStore.service.ts';

export interface PezhwanConfig {
  /**
   * Durable source of truth connection. The SDK creates models from the
   * provided mongoose connection (for HA, pass the same connection object).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mongoose?: any;

  tenantId: string;
  applicationId: string;

  // Token
  issuer: string;
  audience: string;
  accessTokenTtlMs?: number;
  jwtAlgorithm?: JwtAlgorithm;

  // Redis (optional — in-memory fallback)
  redis?: RedisLike | null;

  // Password policy (optional)
  passwordPolicy?: PasswordPolicy;
  /** 32-byte key used to encrypt TOTP secrets at rest. */
  mfaEncryptionKey?: string | Buffer;

  // OTP
  otp?: {
    codeLength?: number;
    ttlMs?: number;
    maxAttempts?: number;
    resendCooldownMs?: number;
    attemptsWindowMs?: number;
  };
  otpDelivery: OtpDeliveryCallbacks;

  // Custom user lookup (optional; defaults to the core UserModel)
  lookupUser?: LookupUserFn;
  maxActiveSessions?: number;

  /**
   * Optional per-budget rate-limit rules (login/register/otp/refresh/api/mfa).
   * Unspecified budgets keep the documented defaults. The express routers draw
   * from these via runtime.rateLimiter.
   */
  rateLimits?: Partial<Record<RateLimitType, RateLimitRule>>;

  debug?: boolean;
}

export interface PezhwanRuntime {
  config: PezhwanConfig;
  store: CryptoKeyStore;
  cache: RedisCache;
  tokens: TokenService;
  sessions: SessionService;
  accountState: AccountStateService;
  authorization: AuthorizationService;
  audit: AuditService;
  rateLimiter: RateLimitService;
  auth: AuthEngine;
  mfa: MfaService;
  oauth: OAuthService;
  verificationTokens: VerificationTokenService;
  apiKeys: ApiKeyService;
  logger: PezhwanLogger;
  metrics: MetricsRegistry;
  /** Trace/request correlation context for the current execution. */
  trace: { requestId: string };
}

/**
 * Build (and validate) the Pezhwan runtime.
 *
 * @throws ConfigurationError when required settings are missing.
 */
export function createPezhwan(
  config: PezhwanConfig,
): PezhwanRuntime {
  if (!config.issuer || !config.audience) {
    throw new Error('Pezhwan requires issuer and audience');
  }
  if (!config.tenantId || !config.applicationId) {
    throw new Error('Pezhwan requires tenantId and applicationId');
  }
  if (!config.otpDelivery) {
    throw new Error('Pezhwan requires otpDelivery callbacks');
  }

  // Keystore (RS256). In-memory + optional persistence adapter via service.
  const cryptoStore = new KeyStore(config.jwtAlgorithm ?? 'RS256');
  const keyStoreService = new KeyStoreService(
    cryptoStore,
    new MemoryKeyStoreAdapter(),
  );
  // Seed at least one signing key so startup is immediately usable (JWKS + sign).
  keyStoreService.ensureKey();

  // Redis (optional; in-memory fallback).
  const cache = createRedisCache(config.redis ?? null, 'pezhwan');
  const redisCache = cache;

  const tokens = new TokenService({
    issuer: config.issuer,
    audience: config.audience,
    accessTokenTtlMs: config.accessTokenTtlMs ?? 15 * 60_000,
    refreshTokenTtlMs: 30 * 24 * 60 * 60_000,
    algorithm: config.jwtAlgorithm ?? 'RS256',
    store: cryptoStore,
    cache,
  });

  const sessions = new SessionService({
    tokens,
    cache,
    refreshTokenTtlMs: 30 * 24 * 60 * 60_000,
    maxActiveSessions: config.maxActiveSessions ?? 5,
  });

  const accountState = new AccountStateService(cache);
  const audit = new AuditService();
  const authorization = new AuthorizationService(audit, accountState);

  const mfa = new MfaService(
    config.tenantId,
    config.applicationId,
    audit,
    config.mfaEncryptionKey,
  );
  const verificationTokens = new VerificationTokenService(
    config.tenantId,
    config.applicationId,
    audit,
  );

  const otpOptions = {
    tenantId: config.tenantId,
    applicationId: config.applicationId,
    cache,
    delivery: config.otpDelivery as unknown as OtpDeliveryAdapters,
    codeLength: config.otp?.codeLength,
    ttlMs: config.otp?.ttlMs ?? 5 * 60_000,
    maxAttempts: config.otp?.maxAttempts ?? 5,
    resendCooldownMs: config.otp?.resendCooldownMs ?? 30_000,
    attemptsWindowMs: config.otp?.attemptsWindowMs ?? 15 * 60_000,
  };
  const otp = new OtpService(otpOptions);

  const engineOptions: AuthEngineOptions = {
    tenantId: config.tenantId,
    applicationId: config.applicationId,
    issuer: config.issuer,
    audience: config.audience,
    accessTokenTtlMs: config.accessTokenTtlMs ?? 15 * 60_000,
    passwordPolicy: config.passwordPolicy,
    otp: {
      codeLength: config.otp?.codeLength,
      ttlMs: config.otp?.ttlMs ?? 5 * 60_000,
      maxAttempts: config.otp?.maxAttempts ?? 5,
      resendCooldownMs: config.otp?.resendCooldownMs ?? 30_000,
      attemptsWindowMs: config.otp?.attemptsWindowMs ?? 15 * 60_000,
      delivery: config.otpDelivery,
    },
  };
  const engineDeps: AuthEngineDeps = {
    tokens,
    sessions,
    cache,
    otp,
    accountState,
    authorization,
    audit,
    mfa,
    verificationTokens,
    lookupUser: config.lookupUser,
  };
  const auth = new AuthEngine(engineDeps, engineOptions);

  const rateLimiter = new RateLimitService(cache, config.rateLimits);

  const oauth = new OAuthService({
    tokens,
    sessions,
    audit,
    issuer: config.issuer,
  });
  const apiKeys = new ApiKeyService();

  const logger = new PezhwanLogger({
    serviceName: 'pezhwan',
    env: config.debug ? 'debug' : 'production',
    level: config.debug ? 'debug' : 'info',
  });
  const metrics = new MetricsRegistry();

  const runtime: PezhwanRuntime = {
    config,
    store: cryptoStore,
    cache: redisCache,
    tokens,
    sessions,
    accountState,
    authorization,
    audit,
    rateLimiter,
    auth,
    mfa,
    oauth,
    verificationTokens,
    apiKeys,
    logger,
    metrics,
    trace: { requestId: newRequestId() },
  };

  void keyStoreService;
  return runtime;
}

export interface KeyPersistenceOptions {
  /** Directory where signing-key PEM files live (created if missing). */
  directory: string;
  /** How often (ms) to generate a fresh signing key. 0/omit = no rotation. */
  rotationIntervalMs?: number;
}

export interface KeyPersistenceHandle {
  /** Stop the rotation timer (call on shutdown). */
  dispose(): void;
}

/**
 * Adopt durable signing-key persistence for a runtime.
 *
 * The reference server creates the runtime synchronously (which seeds a
 * throwaway in-memory key so it is immediately usable, in line with the
 * memory-adapter default). This async step replaces that throwaway key with
 * the persisted set from `directory` BEFORE serving traffic:
 *   - first boot:  generates a key and persists it → keys survive restarts;
 *   - later boots: restores the persisted keys → tokens verify across restarts
 *     and HA instances share key material;
 *   - a key file that exists but is corrupt/unreadable fails loud (fail closed)
 *     rather than silently rotating key material.
 *
 * Returns a handle that stops the optional scheduled rotation. Call it once,
 * at startup, before the server exposes any token-verifying endpoint.
 *
 * @throws when the persistence directory cannot be read or a key file is corrupt.
 */
export async function initKeyPersistence(
  runtime: PezhwanRuntime,
  options: KeyPersistenceOptions,
): Promise<KeyPersistenceHandle> {
  const algorithm = runtime.config.jwtAlgorithm ?? 'RS256';
  const adapter = new FileKeyStoreAdapter(options.directory, algorithm);

  // The runtime's KeyStore instance is shared by reference across TokenService
  // and the JWKS endpoint, so we must load the persisted set into THAT store.
  // Dropping the throwaway start-up key first makes the disk authoritative.
  runtime.store.clear();
  const service = new KeyStoreService(runtime.store, adapter);
  await service.init();
  if (runtime.store.all.length === 0) {
    // KeyStoreService.init generates + persists when the store is empty.
    await service.init();
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  // Node's setInterval saturates at 2^31-1 ms (~24.8 days); a larger value is
  // silently clamped to 1 ms and would storm rotations. Clamp explicitly.
  const interval = options.rotationIntervalMs ?? 0;
  const MAX_INTERVAL_MS = 2_147_483_000;
  const safeInterval = interval > MAX_INTERVAL_MS ? MAX_INTERVAL_MS : interval;
  if (interval > MAX_INTERVAL_MS) {
    console.warn(
      `[pezhwan] signing-key rotation interval ${interval}ms exceeds Node's ` +
        `${MAX_INTERVAL_MS}ms maximum; clamping to ${MAX_INTERVAL_MS}ms. ` +
        `Set PEZHWAN_SIGNING_KEY_ROTATION_MS <= ${MAX_INTERVAL_MS}.`,
    );
  }
  if (safeInterval > 0) {
    timer = setInterval(() => {
      service.rotate().catch((err) => {
        console.error(
          `[pezhwan] signing-key rotation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, safeInterval);
    if (timer.unref) {
      timer.unref();
    }
  }

  return {
    dispose(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}