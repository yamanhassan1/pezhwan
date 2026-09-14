# PEZHWAN Error Reference

Every PEZHWAN error is a `PezhwanError` carrying a stable `code`, an HTTP
`status`, a developer-facing `message`, and an optional `requestId`. Messages
never leak secrets, hashes, or internal state.

## Error envelope

All non-OAuth/non-SCIM endpoints return failures in a fixed envelope:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials",
    "requestId": "abc123..."
  }
}
```

- `error.code` — stable machine-readable string, safe to branch on in SDKs.
- `error.message` — short developer-facing description. On 5xx the server
  deliberately returns `"Internal server error"` instead of internals
  (`apps/identity-server/src/server.ts`).
- `error.requestId` — correlation id; echo it in support requests.
- OAuth endpoints return RFC 6749 `{ error, error_description }` instead.

## Error class hierarchy

Defined in `packages/shared/src/errors/` — a single class per status family,
flattened onto `ERROR_CODES` (`packages/shared/src/constants/errors.ts`).

| Class                     | HTTP | Default code                 | When                                            |
| ------------------------- | ---- | ---------------------------- | ----------------------------------------------- |
| `ValidationError`         | 400  | `VALIDATION_FAILED`          | Missing/invalid input or policy violation       |
| `AuthenticationError`     | 401  | `AUTHENTICATION_FAILED`      | Credentials missing, invalid, or expired        |
| `TokenError`              | 401  | `INVALID_TOKEN`              | Malformed/expired/unusable token                |
| `SessionError`            | 401  | `INVALID_SESSION`            | Missing, revoked, expired, or reused session    |
| `AuthorizationError`      | 403  | `AUTHORIZATION_FAILED`       | Authenticated but lacking required access       |
| `SecurityEventError`      | 403  | `SECURITY_EVENT`             | A security event needs attention (CSRF, origin) |
| `SecurityError`           | 403  | `SECURITY_ERROR`             | A security invariant was violated               |
| `ComplianceError`         | 403  | `COMPLIANCE_FAILED`          | Compliance requirement not met (GDPR/SOC2)      |
| `NotFoundError`           | 404  | `NOT_FOUND`                  | Resource not found (ownership-scoped)           |
| `RateLimitError`          | 429  | `RATE_LIMIT_EXCEEDED`        | A rate-limit budget was exceeded                |
| `RiskError`               | 429  | `RISK_EVENT`                 | Rejected by the real-time risk engine           |
| `ConfigurationError`      | 500  | `INVALID_CONFIGURATION`      | Server misconfigured at startup                 |
| `ProviderError`           | 502  | `PROVIDER_ERROR`             | A pluggable provider (email/SMS/OAuth) failed   |
| `SecurityDependencyError` | 503  | `FAILED_SECURITY_DEPENDENCY` | Mongo/Redis unavailable; fail closed            |

## Common error codes

Codes come from `packages/shared/src/errors/errors.ts` plus low-level service
throw sites. These are real codes found in the codebase:

| Code                                                                                                                                                                                                                         | HTTP | Raised at                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| `AUTHENTICATION_FAILED`                                                                                                                                                                                                      | 401  | `AuthenticationError` default                                    |
| `INVALID_CREDENTIALS`                                                                                                                                                                                                        | 401  | password login (`auth.engine.ts`)                                |
| `ACCOUNT_LOCKED`                                                                                                                                                                                                             | 401  | lockout after N failed attempts (`auth.engine.ts`)               |
| `PASSWORD_REQUIRED`                                                                                                                                                                                                          | 400  | login without a password (`routes.ts`)                           |
| `SESSION_CONTEXT_INVALID`                                                                                                                                                                                                    | 401  | refresh tenant/application mismatch (`auth.engine.ts`)           |
| `REFRESH_TOKEN_REQUIRED`                                                                                                                                                                                                     | 401  | missing refresh token (`routes.ts`)                              |
| `REFRESH_TOKEN_UNKNOWN`                                                                                                                                                                                                      | 401  | unrecognized refresh token (`session.service.ts`)                |
| `REFRESH_TOKEN_REUSE`                                                                                                                                                                                                        | 401  | replayed rotated token — family revoked (`session.service.ts`)   |
| `REFRESH_ROTATION_FAILED`                                                                                                                                                                                                    | 401  | rotation could not be committed (`session.service.ts`)           |
| `INVALID_SESSION`                                                                                                                                                                                                            | 401  | `SessionError` default                                           |
| `INVALID_TOKEN`                                                                                                                                                                                                              | 401  | `TokenError` default                                             |
| `TOKEN_EXPIRED`                                                                                                                                                                                                              | 401  | expired access/verification token (`token.service.ts`)           |
| `UNAUTHENTICATED`                                                                                                                                                                                                            | 401  | `requireAuth` / `requireRole` with no identity                   |
| `AUTHORIZATION_FAILED`                                                                                                                                                                                                       | 403  | `AuthorizationError` default                                     |
| `ROLE_REQUIRED`                                                                                                                                                                                                              | 403  | missing role (`requireRole`)                                     |
| `PERMISSION_REQUIRED`                                                                                                                                                                                                        | 403  | missing permission (`requirePermission`)                         |
| `CSRF_REJECTED`                                                                                                                                                                                                              | 403  | CSRF token mismatch (`security.ts`)                              |
| `ORIGIN_REJECTED`                                                                                                                                                                                                            | 403  | disallowed CORS origin (`security.ts`)                           |
| `VALIDATION_FAILED`                                                                                                                                                                                                          | 400  | `ValidationError` default                                        |
| `INVALID_SCOPE`                                                                                                                                                                                                              | 400  | OAuth scope not granted/allowed (`oauth.service.ts`)             |
| `PKCE_REQUIRED`                                                                                                                                                                                                              | 400  | public client without `code_challenge` (`oauth.service.ts`)      |
| `INVALID_PKCE_METHOD`                                                                                                                                                                                                        | 400  | unsupported `code_challenge_method` (`oauth.service.ts`)         |
| `INVALID_GRANT`                                                                                                                                                                                                              | 401  | PKCE/authorization-code verification failed (`oauth.service.ts`) |
| `RATE_LIMITED`                                                                                                                                                                                                               | 429  | HTTP middleware denial (`rateLimit.ts`)                          |
| `RATE_LIMIT_EXCEEDED`                                                                                                                                                                                                        | 429  | `RateLimitError` (core, carries `retryAfterSeconds`)             |
| `RISK_EVENT`                                                                                                                                                                                                                 | 429  | risk-engine rejection (`RiskError`)                              |
| `COMPLIANCE_FAILED`                                                                                                                                                                                                          | 403  | compliance gate failure (`ComplianceError`)                      |
| `URL_REQUIRED`, `NAME_REQUIRED`, `USERNAME_REQUIRED`, `DISPLAY_NAME_REQUIRED`, `DAYS_REQUIRED`, `PLAN_INVALID`, `SUBSCRIPTION_ID_REQUIRED`, `TEAM_NOT_FOUND`, `EMAIL_REQUIRED`, `SESSION_ID_REQUIRED`, `OTP_PARAMS_REQUIRED` | 400  | per-route validation throw sites (`routes/*.ts`)                 |
| `INTERNAL_ERROR`                                                                                                                                                                                                             | 500  | catch-all in the server error handler                            |

## Error handling per SDK

| SDK            | Behavior                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node / express | Throws the shared `PezhwanError` subclasses; the server error handler maps `err.status` + `err.code` into the envelope.                                                                                        |
| react          | `PezhwanApiError` carries `body.code`/`status` from the envelope; `useAuth` surfaces `{ code, message }` on `PezhwanError`, and treats refresh failure with code `SESSION_CONTEXT_INVALID` as a session reset. |
| python         | `PezhwanError` base; `PezhwanApiError(status, code)`, plus `PezhwanAuthError` (401), `PezhwanRateLimitError` (429, `retry_after_seconds`), `PezhwanValidationError` (400).                                     |
| go             | Single `*Error` with `Status`/`Code`/`Message`; helpers `IsRateLimit(err)` (429) and `WasAuth(err)` (401); `codeForStatus` default on empty codes.                                                             |
| java           | `PezhwanApiException(status, code, message)` with `isAuthFailure()` (401) and `isRateLimited()` (429); `PezhwanNetworkException` wraps I/O failures.                                                           |
| dotnet         | `PezhwanApiException(Status, Code)` with `IsAuthFailure` (401) and `IsRateLimited` (429); `PezhwanNetworkException` wraps transport failures.                                                                  |

## Best practices

- Branch on `error.code`, never on the human message.
- Treat 401 as session-expired and re-authenticate (or refresh once — if a
  refresh itself returns a `SESSION_CONTEXT_INVALID`/`REFRESH_TOKEN_REUSE` code,
  log out the client and re-prompt).
- On 429, honor `Retry-After` (see [`rate-limits.md`](./rate-limits.md)).
- Surface `error.requestId` in user-facing "contact support" dialogs.
