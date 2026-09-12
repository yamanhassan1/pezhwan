/**
 * PEZHWAN — node SDK error re-exports.
 *
 * Convenience deep-import barrel so consumers can do
 * `import { TokenError } from '@pezhwan/node/errors'` from source or keep
 * importing from the package entry point.
 */

export {
  PezhwanError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
  TokenError,
  SessionError,
  ConfigurationError,
  ProviderError,
  SecurityDependencyError,
  NotFoundError,
  SecurityEventError,
  ComplianceError,
  RiskError,
  SecurityError,
} from '@pezhwan/shared';
