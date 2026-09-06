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
}

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
      sessionIdleTimeoutMinutes: num(source.SESSION_IDLE_TIMEOUT_MINUTES, DEFAULTS.sessionIdleTimeoutMinutes),
      trustDeviceTtlDays: num(source.TRUST_DEVICE_TTL_DAYS, DEFAULTS.trustDeviceTtlDays),
      corsOrigins: (source.PEZHWAN_CORS_ORIGINS ?? DEFAULTS.corsOrigins.join(',')).split(',').filter(Boolean),
      disableSignups: bool(source.PEZHWAN_DISABLE_SIGNUPS, DEFAULTS.disableSignups),
      webhookSecret: source.PEZHWAN_WEBHOOK_SECRET,
    };
  }
}