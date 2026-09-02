/**
 * PEZHWAN — shared error classes.
 *
 * Every Pezhwan error carries a stable `code`, an HTTP `status`, a
 * developer-facing `message`, and an optional `requestId` for correlation.
 * Messages must never leak secrets, hashes, or internal state.
 */

/** Base class for all Pezhwan errors. */
export class PezhwanError extends Error {
  /** Stable, machine-readable error code. */
  readonly code: string;
  /** HTTP status code (0 when not applicable to HTTP). */
  readonly status: number;
  /** Correlation id for request tracing. */
  readonly requestId?: string;
  /** Structured metadata for logging/telemetry. */
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 500,
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.requestId = options?.requestId;
    this.details = options?.details;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** Authentication failed — credentials missing, invalid, or expired. */
export class AuthenticationError extends PezhwanError {
  constructor(
    message = 'Authentication failed',
    code = 'AUTHENTICATION_FAILED',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 401, options);
  }
}

/** Authorization failed — authenticated but lacking the required access. */
export class AuthorizationError extends PezhwanError {
  constructor(
    message = 'Access denied',
    code = 'AUTHORIZATION_FAILED',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 403, options);
  }
}

/** Input validation failed. */
export class ValidationError extends PezhwanError {
  constructor(
    message = 'Validation failed',
    code = 'VALIDATION_FAILED',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 400, options);
  }
}

/** A rate limit was exceeded. */
export class RateLimitError extends PezhwanError {
  /** Seconds to wait before retrying. */
  readonly retryAfterSeconds: number;

  constructor(
    message = 'Rate limit exceeded',
    retryAfterSeconds = 60,
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super('RATE_LIMIT_EXCEEDED', message, 429, options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A token is malformed, expired, or otherwise unusable. */
export class TokenError extends PezhwanError {
  constructor(
    message = 'Invalid token',
    code = 'INVALID_TOKEN',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 401, options);
  }
}

/** A session is missing, revoked, expired, or reused. */
export class SessionError extends PezhwanError {
  constructor(
    message = 'Invalid session',
    code = 'INVALID_SESSION',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 401, options);
  }
}

/** Pezhwan was configured incorrectly at startup. */
export class ConfigurationError extends PezhwanError {
  constructor(
    message = 'Invalid configuration',
    code = 'INVALID_CONFIGURATION',
    options?: { details?: Record<string, unknown> },
  ) {
    super(code, message, 500, options);
  }
}

/** A pluggable provider (email, SMS, OAuth) failed. */
export class ProviderError extends PezhwanError {
  constructor(
    message = 'Provider error',
    code = 'PROVIDER_ERROR',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 502, options);
  }
}

/** A security-critical dependency (Mongo/Redis) was unavailable; fail closed. */
export class SecurityDependencyError extends PezhwanError {
  constructor(
    message = 'Security dependency unavailable',
    code = 'FAILED_SECURITY_DEPENDENCY',
    options?: { requestId?: string },
  ) {
    super(code, message, 503, options);
  }
}

/** A resource was not found (ownership/service lookups). */
export class NotFoundError extends PezhwanError {
  constructor(
    message = 'Not found',
    code = 'NOT_FOUND',
    options?: { requestId?: string },
  ) {
    super(code, message, 404, options);
  }
}

/** A security event occurred that requires immediate attention. */
export class SecurityEventError extends PezhwanError {
  constructor(
    message = 'Security event',
    code = 'SECURITY_EVENT',
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(code, message, 403, options);
  }
}
