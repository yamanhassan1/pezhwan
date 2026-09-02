/**
 * PEZHWAN — Centralized environment configuration.
 *
 * ALL environment variables are loaded, validated, and typed here.
 * No other module should access process.env directly.
 *
 * Security invariants:
 *   - Development defaults exist ONLY for non-secret values.
 *   - Required production secrets have NO fallback — missing values cause an
 *     immediate, loud startup failure (fail-fast).
 *   - The config object is frozen after creation.
 *   - Secrets are never logged or serialized.
 */

import { z } from 'zod';

const booleanEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return value;
}, z.boolean());

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // ── Node ──────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // ── Server ────────────────────────────────────────────────────────────
  PEZHWAN_PORT: z.coerce.number().int().min(1).max(65535).default(4011),

  // Max accepted JSON request body (e.g. "100kb", "1mb"). Enforced by
  // express.json({ limit }) — an explicit cap defends against parser abuse.
  PEZHWAN_BODY_LIMIT: z
    .string()
    .regex(
      /^\d+(b|kb|mb|gb)?$/i,
      'PEZHWAN_BODY_LIMIT must be a byte size like "100kb" or "1mb"',
    )
    .default('100kb'),

  // ── Issuer (REQUIRED — no default) ────────────────────────────────────
  PEZHWAN_ISSUER: z
    .string()
    .url('PEZHWAN_ISSUER must be a valid URL')
    .min(1, 'PEZHWAN_ISSUER is required'),

  // ── Tenant / Application (REQUIRED — no default) ──────────────────────
  PEZHWAN_TENANT_ID: z
    .string()
    .min(1, 'PEZHWAN_TENANT_ID is required'),
  PEZHWAN_APPLICATION_ID: z
    .string()
    .min(1, 'PEZHWAN_APPLICATION_ID is required'),

  // ── Database ──────────────────────────────────────────────────────────
  PEZHWAN_MONGODB_URI: z
    .string()
    .url('PEZHWAN_MONGODB_URI must be a valid connection URI')
    .default('mongodb://localhost:27017/pezhwan'),
  PEZHWAN_MONGO_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  PEZHWAN_MONGO_TIMEOUT_MS: z.coerce.number().int().min(500).default(1500),

  // ── Redis (optional — degrades to in-memory) ─────────────────────────
  PEZHWAN_REDIS_URL: z
    .string()
    .url('PEZHWAN_REDIS_URL must be a valid URL')
    .optional(),

  // ── Tokens ────────────────────────────────────────────────────────────
  PEZHWAN_ACCESS_TOKEN_TTL: z.string().default('15m'),
  PEZHWAN_REFRESH_TOKEN_TTL: z.string().default('30d'),
  PEZHWAN_SESSION_TTL: z.string().default('30d'),
  PEZHWAN_JWT_ALGORITHM: z.enum(['RS256', 'RS384', 'RS512']).default('RS256'),
  PEZHWAN_JWKS_CACHE_TTL: z.coerce.number().int().min(0).default(300),

  // ── Signing keys ──────────────────────────────────────────────────────
  PEZHWAN_SIGNING_KEYS_PATH: z.string().default('./keys'),
  // Rotation cadence for the persisted signing keys (ms). 0 disables.
  // Capped at Node's setInterval maximum (2^31-1 ms, ~24.8d).
  PEZHWAN_SIGNING_KEY_ROTATION_MS: z.coerce.number().int().min(0).default(2_147_483_000),
  PEZHWAN_MFA_ENCRYPTION_KEY: z.string().optional(),

  // ── Cookie security ───────────────────────────────────────────────────
  PEZHWAN_COOKIE_DOMAIN: z.string().default(''),
  PEZHWAN_COOKIE_SECURE: booleanEnv.default(false),
  PEZHWAN_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // ── CORS ──────────────────────────────────────────────────────────────
  PEZHWAN_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:4011,http://127.0.0.1:4011,http://localhost:5173,http://127.0.0.1:5500'),

  // ── OTP ───────────────────────────────────────────────────────────────
  PEZHWAN_OTP_TTL: z.coerce.number().int().min(30000).default(300000),
  PEZHWAN_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  PEZHWAN_OTP_RESEND_COOLDOWN: z.coerce.number().int().min(5000).default(30000),
  PEZHWAN_OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),

  // ── Rate limiting ─────────────────────────────────────────────────────
  PEZHWAN_RATE_LIMIT_LOGIN: z.string().default('10/15m'),
  PEZHWAN_RATE_LIMIT_OTP: z.string().default('5/10m'),
  PEZHWAN_RATE_LIMIT_API: z.string().default('100/15m'),
  PEZHWAN_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  PEZHWAN_LOCKOUT_DURATION: z.coerce.number().int().min(60000).default(900000),

  // ── Observability ─────────────────────────────────────────────────────
  PEZHWAN_OTEL_ENDPOINT: z.string().optional(),
  PEZHWAN_REQUEST_LOGGING: booleanEnv.default(true),
  PEZHWAN_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Environment label ─────────────────────────────────────────────────
  PEZHWAN_ENV: z.enum(['development', 'test', 'production']).optional(),
});

// ---------------------------------------------------------------------------
// Parse & validate
// ---------------------------------------------------------------------------

export type EnvConfig = z.infer<typeof envSchema>;

/** Parse & validate env without exiting — returns object or throws. */
function validateEnv(input: NodeJS.ProcessEnv = process.env): EnvConfig {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  assertProductionSafety(parsed.data);
  return parsed.data;
}

function parseEnv(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');

    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║  PEZHWAN FATAL: Invalid environment configuration          ║');
    console.error('╚══════════════════════════════════════════════════════════════╝\n');
    console.error(issues);
    console.error('\nCopy .env.example to .env and fill in the required values.');
    console.error('Run: cp .env.example .env\n');
    process.exit(1);
  }

  assertProductionSafety(parsed.data);
  return parsed.data;
}

function assertProductionSafety(raw: EnvConfig): void {
  if (raw.NODE_ENV !== 'production') {
    return;
  }
  if (!raw.PEZHWAN_ISSUER.startsWith('https://')) {
    throw new Error('PEZHWAN_ISSUER must use HTTPS in production');
  }
  if (!raw.PEZHWAN_COOKIE_SECURE) {
    throw new Error('PEZHWAN_COOKIE_SECURE must be true in production');
  }
  if (raw.PEZHWAN_SIGNING_KEY_ROTATION_MS === 0) {
    throw new Error('PEZHWAN_SIGNING_KEY_ROTATION_MS cannot be 0 in production');
  }
  if (!raw.PEZHWAN_MFA_ENCRYPTION_KEY) {
    throw new Error('PEZHWAN_MFA_ENCRYPTION_KEY is required in production');
  }
  if (raw.PEZHWAN_ALLOWED_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
    throw new Error('PEZHWAN_ALLOWED_ORIGINS cannot contain "*" in production');
  }
}

// ---------------------------------------------------------------------------
// Typed config object — the single source of truth
// ---------------------------------------------------------------------------

function buildConfig(raw: EnvConfig) {
  const allowedOrigins = raw.PEZHWAN_ALLOWED_ORIGINS
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const accessTokenTtlMs = parseDuration(raw.PEZHWAN_ACCESS_TOKEN_TTL);
  const refreshTokenTtlMs = parseDuration(raw.PEZHWAN_REFRESH_TOKEN_TTL);
  const sessionTtlMs = parseDuration(raw.PEZHWAN_SESSION_TTL);

  return Object.freeze({
    env: raw.NODE_ENV,
    isProduction: raw.NODE_ENV === 'production',
    isDevelopment: raw.NODE_ENV === 'development',
    isTest: raw.NODE_ENV === 'test',

    server: Object.freeze({
      port: raw.PEZHWAN_PORT,
      bodyLimit: raw.PEZHWAN_BODY_LIMIT,
    }),

    issuer: raw.PEZHWAN_ISSUER,
    tenantId: raw.PEZHWAN_TENANT_ID,
    applicationId: raw.PEZHWAN_APPLICATION_ID,

    database: Object.freeze({
      mongodbUri: raw.PEZHWAN_MONGODB_URI,
      mongoPoolSize: raw.PEZHWAN_MONGO_POOL_SIZE,
      mongoTimeoutMs: raw.PEZHWAN_MONGO_TIMEOUT_MS,
    }),

    redis: Object.freeze({
      url: raw.PEZHWAN_REDIS_URL,
      enabled: Boolean(raw.PEZHWAN_REDIS_URL),
    }),

    tokens: Object.freeze({
      accessTokenTtlMs,
      refreshTokenTtlMs,
      sessionTtlMs,
      algorithm: raw.PEZHWAN_JWT_ALGORITHM,
      jwksCacheTtl: raw.PEZHWAN_JWKS_CACHE_TTL,
    }),

    signingKeys: Object.freeze({
      path: raw.PEZHWAN_SIGNING_KEYS_PATH,
      rotationIntervalMs: raw.PEZHWAN_SIGNING_KEY_ROTATION_MS,
    }),
    mfaEncryptionKey: raw.PEZHWAN_MFA_ENCRYPTION_KEY,

    cookie: Object.freeze({
      domain: raw.PEZHWAN_COOKIE_DOMAIN || undefined,
      secure: raw.PEZHWAN_COOKIE_SECURE,
      sameSite: raw.PEZHWAN_COOKIE_SAMESITE,
    }),

    cors: Object.freeze({
      allowedOrigins,
    }),

    otp: Object.freeze({
      ttlMs: raw.PEZHWAN_OTP_TTL,
      maxAttempts: raw.PEZHWAN_OTP_MAX_ATTEMPTS,
      resendCooldownMs: raw.PEZHWAN_OTP_RESEND_COOLDOWN,
      codeLength: raw.PEZHWAN_OTP_LENGTH,
    }),

    rateLimit: Object.freeze({
      login: raw.PEZHWAN_RATE_LIMIT_LOGIN,
      otp: raw.PEZHWAN_RATE_LIMIT_OTP,
      api: raw.PEZHWAN_RATE_LIMIT_API,
      lockoutMaxAttempts: raw.PEZHWAN_LOCKOUT_MAX_ATTEMPTS,
      lockoutDurationMs: raw.PEZHWAN_LOCKOUT_DURATION,
      // Parsed budgets actually enforced by the runtime + express routers.
      rules: Object.freeze({
        login: parseBudget(raw.PEZHWAN_RATE_LIMIT_LOGIN),
        otp: parseBudget(raw.PEZHWAN_RATE_LIMIT_OTP),
        api: parseBudget(raw.PEZHWAN_RATE_LIMIT_API),
      }),
    }),

    observability: Object.freeze({
      otelEndpoint: raw.PEZHWAN_OTEL_ENDPOINT,
      requestLogging: raw.PEZHWAN_REQUEST_LOGGING,
      logLevel: raw.PEZHWAN_LOG_LEVEL,
    }),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a human-friendly duration string like "15m", "30d", "500ms" into ms. */
function parseDuration(value: string): number {
  const trimmed = value.trim().toLowerCase();

  const msMatch = /^(\d+)ms$/.exec(trimmed);
  if (msMatch) return Number(msMatch[1]);

  const sMatch = /^(\d+)s$/.exec(trimmed);
  if (sMatch) return Number(sMatch[1]) * 1_000;

  const mMatch = /^(\d+)m$/.exec(trimmed);
  if (mMatch) return Number(mMatch[1]) * 60_000;

  const hMatch = /^(\d+)h$/.exec(trimmed);
  if (hMatch) return Number(hMatch[1]) * 3_600_000;

  const dMatch = /^(\d+)d$/.exec(trimmed);
  if (dMatch) return Number(dMatch[1]) * 86_400_000;

  // Pure number → treat as milliseconds
  const num = Number(trimmed);
  if (Number.isFinite(num) && num >= 0) return num;

  throw new Error(`Invalid duration format: "${value}". Use e.g. "15m", "30d", "500ms".`);
}

/**
 * Parse a rate-limit budget like "10/15m" (N requests per window) into
 * { limit, windowMs }. Fail fast on malformed values.
 */
function parseBudget(value: string): { limit: number; windowMs: number } {
  const m = /^(\d+)\/(\d+)(s|m|h|d)?$/i.exec(value.trim());
  if (!m) {
    throw new Error(`Invalid rate-limit budget: "${value}". Use e.g. "10/15m".`);
  }
  const limit = Number(m[1]);
  const window = Number(m[2]);
  const unit = (m[3] ?? 's').toLowerCase();
  const windowMs =
    window *
    (unit === 's'
      ? 1_000
      : unit === 'm'
        ? 60_000
        : unit === 'h'
          ? 3_600_000
          : 86_400_000);
  if (limit < 1 || windowMs < 1_000) {
    throw new Error(`Invalid rate-limit budget: "${value}".`);
  }
  return { limit, windowMs };
}

// ---------------------------------------------------------------------------
// Singleton — parse once at import time
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Singleton — parsed lazily on first access so tests can import the module
// (and its pure helpers) without triggering process.exit.
// ---------------------------------------------------------------------------

let cachedConfig: ReturnType<typeof buildConfig> | undefined;

function getConfig(): ReturnType<typeof buildConfig> {
  if (!cachedConfig) {
    cachedConfig = buildConfig(parseEnv());
  }
  return cachedConfig;
}

export const config: ReturnType<typeof buildConfig> = new Proxy(
  {} as ReturnType<typeof buildConfig>,
  {
    get(_t, prop) {
      return (getConfig() as Record<PropertyKey, unknown>)[prop];
    },
  },
);

// Exported for unit testing — validate a custom env object without exiting.
export { envSchema, validateEnv, buildConfig };
