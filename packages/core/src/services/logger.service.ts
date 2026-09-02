/**
 * PEZHWAN — structured logger.
 *
 * Zero-dependency JSON logs with requestId/correlationId propagation for
 * observability. Levels: debug < info < warn < error. Never logs secrets —
 * callers pass structured fields and a redact list of keys that are masked at
 * emit time (nested objects included).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_REDACT_KEYS = new Set([
  // Authentication credentials
  'password',
  'passwordhash',
  'accesstoken',
  'refreshtoken',
  'sessionid',
  'sessiontoken',
  'bearertoken',
  // Secrets & keys
  'clientsecret',
  'clientsecrethash',
  'secret',
  'mfarecoverycode',
  'mfaSecret',
  'privatekey',
  'signingkey',
  'apikey',
  'api_key',
  'token',
  'tokenhash',
  // OTP & codes
  'otp',
  'code',
  'totp',
  'codehash',
  'codeverifier',
  'codechallenge',
  // Auth headers & cookies
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  // Database & connection strings
  'connectionstring',
  'mongodburi',
  'redisurl',
  'databaseurl',
  // Cloud / third-party
  'awssecretaccesskey',
  'firebaseserviceaccount',
  'oauthclientsecret',
]);

type LogFields = Record<string, unknown>;

export interface LoggerOptions {
  level?: LogLevel;
  serviceName?: string;
  env?: string;
  /** Extra keys to redact beyond the defaults. */
  redact?: string[];
  /** Sink override (defaults to console). */
  sink?: (line: Record<string, unknown>) => void;
  /** Async exporter for OpenTelemetry / log shippers. */
  exporter?: (line: Record<string, unknown>) => Promise<void> | void;
}

function redactFields(
  value: unknown,
  keys: Set<string>,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }
    seen.add(value as object);
    if (Array.isArray(value)) {
      return value.map((item) => redactFields(item, keys, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lower = key.toLowerCase();
      out[key] = keys.has(lower) ? '[REDACTED]' : redactFields(val, keys, seen);
    }
    return out;
  }
  return value;
}

export class PezhwanLogger {
  private readonly level: LogLevel;
  private readonly redactKeys: Set<string>;
  private readonly context: LogFields;

  constructor(options: LoggerOptions = {}, context: LogFields = {}) {
    this.level = options.level ?? 'info';
    this.redactKeys = new Set(
      [...DEFAULT_REDACT_KEYS, ...(options.redact ?? [])].map((k) => k.toLowerCase()),
    );
    this.context = context;
    this.options = options;
  }

  private readonly options: LoggerOptions;

  private emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) {
      return;
    }
    const merged = { ...this.context, ...(fields ?? {}) };
    const line: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      service: this.options.serviceName ?? 'pezhwan',
      message,
      ...(this.options.env ? { env: this.options.env } : {}),
      ...(redactFields(merged, this.redactKeys, new WeakSet()) as Record<string, unknown>),
    };
    try {
      if (this.options.sink) {
        this.options.sink(line);
      } else {
        const json = JSON.stringify(line);
        if (level === 'error') {
          // eslint-disable-next-line no-console
          console.error(json);
        } else if (level === 'warn') {
          // eslint-disable-next-line no-console
          console.warn(json);
        } else {
          // eslint-disable-next-line no-console
          console.log(json);
        }
      }
      void this.options.exporter?.(line);
    } catch {
      // Logging must never crash the process.
    }
  }

  debug(message: string, fields?: LogFields): void {
    this.emit('debug', message, fields);
  }
  info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.emit('error', message, fields);
  }

  /** A child logger that always includes the given context fields. */
  child(fields: LogFields): PezhwanLogger {
    return new PezhwanLogger(this.options, { ...this.context, ...fields });
  }
}

/**
 * Generate an RFC 4122 v4 random UUID — a request/correlation id.
 */
export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}