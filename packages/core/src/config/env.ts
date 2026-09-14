/**
 * PEZHWAN — Environment configuration.
 *
 * Typed configuration accessor with a single parse entry point. Values come
 * from process.env with defaults; `parseEnv` returns a config object that
 * downstream services read. No implicit side effects on import.
 */

export interface EnvConfig {
  nodeEnv: 'development' | 'test' | 'production';
  issuer: string;
  audience: string;
  mongoUri: string;
  redisUri?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  accessTokenTtl: number;
  refreshTokenTtl: number;
  mfaCodeTtlSeconds: number;
  sessionIdleTimeoutMinutes: number;
  trustDeviceTtlDays: number;
  corsOrigins: string[];
  disableSignups: boolean;
  webhookSecret?: string;
  crypto: CryptoConfig;
}

// ---------------------------------------------------------------------------
// Crypto agility (A.2) — every algorithm is a config value, never a code
// literal. See docs/architecture/architecture.md §3 ("config-driven algorithm
// selection") and docs/PROMPT.md Part A.2. The PQC/hybrid variants (ML-DSA-65,
// ML-KEM-768, hybrid-RS256-MLDSA65, ...) are backed by @noble/post-quantum and
// can be enabled via env alone; anything outside the supported set fails loud
// at startup (resolveSigningAlgorithm) rather than silently degrading.
// ---------------------------------------------------------------------------

export type JwtSigningAlgorithm =
  | 'RS256'
  | 'ES256'
  | 'EdDSA'
  | 'ML-DSA-65'
  | 'ML-DSA-87'
  | 'hybrid-RS256-MLDSA65'
  | 'hybrid-ES256-MLDSA65';

export type KeyEncapsulationAlgorithm =
  'RSA-OAEP' | 'ECDH' | 'ML-KEM-768' | 'ML-KEM-1024' | 'hybrid-X25519-MLKEM768';

export type TokenHashAlgorithm = 'sha256' | 'sha512' | 'sha3-256';

export type AuditHashAlgorithm = 'sha256' | 'sha3-256';

export interface CryptoConfig {
  /** Asymmetric JWT signing algorithm (used by JWKS, signing, and verification). */
  jwtSigningAlgorithm: JwtSigningAlgorithm;
  /** Key encapsulation for wrapping secrets carried by exchanged payloads. */
  keyEncapsulationAlgorithm: KeyEncapsulationAlgorithm;
  /** Hash used for opaque-token identifiers (refresh/verification tokens). */
  tokenHashAlgorithm: TokenHashAlgorithm;
  /** Hash used for the tamper-evident audit chain. */
  auditHashAlgorithm: AuditHashAlgorithm;
  /** Argon2id parameters for password hashing. */
  passwordHashParams: {
    algorithm: 'argon2id';
    memoryCost: number; // KiB
    timeCost: number;
    parallelism: number;
  };
}

/** Defaults matching the prompt (A.2) and the modified architecture §3. */
export const DEFAULT_CRYPTO_CONFIG: CryptoConfig = {
  jwtSigningAlgorithm: 'RS256',
  keyEncapsulationAlgorithm: 'RSA-OAEP',
  tokenHashAlgorithm: 'sha256',
  auditHashAlgorithm: 'sha256',
  passwordHashParams: { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3, parallelism: 1 },
};

const DEFAULTS: EnvConfig = {
  nodeEnv: 'development',
  issuer: 'http://localhost:4000',
  audience: 'pezhwan.clients',
  mongoUri: 'mongodb://127.0.0.1:27017/pezhwan',
  logLevel: 'info',
  accessTokenTtl: 900,
  refreshTokenTtl: 2_592_000,
  mfaCodeTtlSeconds: 300,
  sessionIdleTimeoutMinutes: 240,
  trustDeviceTtlDays: 30,
  corsOrigins: ['http://localhost:3000'],
  disableSignups: false,
  crypto: DEFAULT_CRYPTO_CONFIG,
};

export class Env {
  static parse(source: NodeJS.ProcessEnv = process.env): EnvConfig {
    const bool = (value: string | undefined, fallback: boolean): boolean =>
      value === undefined ? fallback : /^(1|true|yes|on)$/i.test(value);
    const num = (value: string | undefined, fallback: number): number => {
      const parsed = Number(value);
      return value === undefined || Number.isNaN(parsed) ? fallback : parsed;
    };
    return {
      nodeEnv:
        source.NODE_ENV === 'production'
          ? 'production'
          : source.NODE_ENV === 'test'
            ? 'test'
            : 'development',
      issuer: source.PEZHWAN_ISSUER ?? DEFAULTS.issuer,
      audience: source.PEZHWAN_AUDIENCE ?? DEFAULTS.audience,
      mongoUri: source.MONGODB_URI ?? DEFAULTS.mongoUri,
      redisUri: source.REDIS_URI,
      logLevel: (source.PEZHWAN_LOG_LEVEL ?? DEFAULTS.logLevel) as EnvConfig['logLevel'],
      accessTokenTtl: num(source.ACCESS_TOKEN_TTL, DEFAULTS.accessTokenTtl),
      refreshTokenTtl: num(source.REFRESH_TOKEN_TTL, DEFAULTS.refreshTokenTtl),
      mfaCodeTtlSeconds: num(source.MFA_CODE_TTL_SECONDS, DEFAULTS.mfaCodeTtlSeconds),
      sessionIdleTimeoutMinutes: num(
        source.SESSION_IDLE_TIMEOUT_MINUTES,
        DEFAULTS.sessionIdleTimeoutMinutes,
      ),
      trustDeviceTtlDays: num(source.TRUST_DEVICE_TTL_DAYS, DEFAULTS.trustDeviceTtlDays),
      corsOrigins: (source.PEZHWAN_CORS_ORIGINS ?? DEFAULTS.corsOrigins.join(','))
        .split(',')
        .filter(Boolean),
      disableSignups: bool(source.PEZHWAN_DISABLE_SIGNUPS, DEFAULTS.disableSignups),
      webhookSecret: source.PEZHWAN_WEBHOOK_SECRET,
      crypto: {
        jwtSigningAlgorithm: (source.PEZHWAN_JWT_SIGNING_ALGORITHM ??
          DEFAULT_CRYPTO_CONFIG.jwtSigningAlgorithm) as CryptoConfig['jwtSigningAlgorithm'],
        keyEncapsulationAlgorithm: (source.PEZHWAN_KEY_ENCAPSULATION_ALGORITHM ??
          DEFAULT_CRYPTO_CONFIG.keyEncapsulationAlgorithm) as CryptoConfig['keyEncapsulationAlgorithm'],
        tokenHashAlgorithm: (source.PEZHWAN_TOKEN_HASH_ALGORITHM ??
          DEFAULT_CRYPTO_CONFIG.tokenHashAlgorithm) as CryptoConfig['tokenHashAlgorithm'],
        auditHashAlgorithm: (source.PEZHWAN_AUDIT_HASH_ALGORITHM ??
          DEFAULT_CRYPTO_CONFIG.auditHashAlgorithm) as CryptoConfig['auditHashAlgorithm'],
        passwordHashParams: {
          algorithm: 'argon2id',
          memoryCost: num(
            source.PEZHWAN_ARGON2_MEMORY_COST,
            DEFAULT_CRYPTO_CONFIG.passwordHashParams.memoryCost,
          ),
          timeCost: num(
            source.PEZHWAN_ARGON2_TIME_COST,
            DEFAULT_CRYPTO_CONFIG.passwordHashParams.timeCost,
          ),
          parallelism: num(
            source.PEZHWAN_ARGON2_PARALLELISM,
            DEFAULT_CRYPTO_CONFIG.passwordHashParams.parallelism,
          ),
        },
      },
    };
  }
}
