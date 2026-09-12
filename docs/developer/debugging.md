# Debugging

Tools and techniques for diagnosing what is happening inside a running Pezhwan
process, plus a reference to the most common failure codes you will hit.

## Structured logging

Services log through `PezhwanLogger` (`packages/core/src/services/logger.service.ts`).
Logs are structured JSON with a severity level, a message, and metadata; the
root `config` namespaces include a `requestId` for correlation and `details`
for context.

- Set the verbosity with `PEZHWAN_LOG_LEVEL` (`debug | info | warn | error`,
  default `info`). `debug` is the first place to look when a flow "works" but
  behaves unexpectedly — it includes engine-level detail without secrets.
- The logger **redacts secrets**: passwords, hashes, tokens, OTP codes, client
  secrets, and API keys are replaced with `[REDACTED]` before anything is
  written. If you think a secret leaked into a log line, treat it as a real
  leak and rotate it; do not "fix the log" while leaving the value in place.
- Toggle per-request request logging with `PEZHWAN_REQUEST_LOGGING` (default
  `true`).

## requestId / correlationId

`requestContext(runtime)` (from `@pezhwan/express`) assigns every request a
`requestId` (and a `correlationId` carved out of it), propagates them to child
loggers, adds an `X-Response-Time` header, and attaches the id to the error
response so an HTTP failure maps 1:1 to its server log lines. `PezhwanError`
instances carry `requestId` and `details` for the same reason.

Workflow: catch a failure → copy the `requestId` from the response body →
`grep <requestId> logs/server.log` → replay the whole request at
`PEZHWAN_LOG_LEVEL=debug`.

## VS Code launch configurations

`.vscode/launch.json` holds the IDE debug profiles (Node + TypeScript). Add or
extend a configuration targeting `apps/identity-server/src/server.ts` with
`runtimeArgs: ["--watch"]` to debug the running server, or a `node --test`
configuration per suite from `testing.md`. `.vscode/settings.json` and
`.vscode/extensions.json` pair it with the recommended extensions.

The server itself runs on Node's `--watch` (`npm run dev -w @pezhwan/identity-server`),
so debuggers attach to a live process; packages are debugged via `tsc -w`
re-emitting `dist/` as described in [`local-development.md`](./local-development.md).

## Common error codes

All errors derive from `PezhwanError`
(`packages/shared/src/errors.ts`) and carry `code`, `status`, `requestId`.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `AUTHENTICATION_FAILED` | 401 | Credentials missing/invalid; the base `AuthenticationError`. |
| `INVALID_CREDENTIALS` / `ACCOUNT_DISABLED` / `ACCOUNT_LOCKED` | 401 | Login-specific failures from `AuthEngine`. |
| `AUTH_REQUIRED` | 401 | Bearer token missing on a gated route. |
| `INVALID_TOKEN` / `TOKEN_EXPIRED` / `INVALID_JWT` / `UNKNOWN_KEY` | 401 | Access-token verification failures. |
| `INVALID_SESSION` / `SESSION_REVOKED` / `REFRESH_TOKEN_UNKNOWN` | 401 | Session/refresh-token failures. |
| `SESSION_CONTEXT_INVALID` | 401 | Tenant/application on the token differs from the runtime context. |
| `VALIDATION_FAILED` / `VALIDATION_ERROR` / `DUPLICATE` | 400/409 | Input validation and unique-constraint violations. |
| `AUTHORIZATION_FAILED` / `TENANT_NOT_FOUND` / `TENANT_DISABLED` | 403 | Authorization rejected. |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate-limit budget exhausted; `retryAfterSeconds` is set. |
| `FAILED_SECURITY_DEPENDENCY` | 503 | Account state could not be verified → fail-closed, no identity attached. |
| `CSRF_REJECTED` / `ORIGIN_REJECTED` | 403 | CSRF header/cookie mismatch or disallowed CORS origin. |
| `MFA_NOT_CONFIGURED`, `INVALID_TOTP`, `MFA_ALREADY_ENABLED`, ... | 400/401 | MFA lifecycle failures from `MfaService`. |
| `INVALID_SCOPE` / `PKCE_REQUIRED` / `INVALID_GRANT` / `INVALID_CLIENT` | 400/401 | OAuth 2.1 wire-protocol failures. |

Grep the `src` tree for a code to find the exact throw site.

## MongoDB / Redis connection troubleshooting

- **Server refuses to start.** A Zod validation failure prints the offending
  `PEZHWAN_*` keys (see `.env.example`). Fix `.env`, not the code.
- **`/health/ready` returns 503.** Mongo is not `readyState === 1`. Check
  `mongod` is running on `PEZHWAN_MONGODB_URI`, and that the replica-set name
  matches (`mongo1,mongo2,mongo3/pezhwan?replicaSet=pezhwan-rs`). For a single
  `mongod`, leave out the replica-set query.
- **Redis is optional.** The server logs
  `redis unavailable — operating degraded` and falls back to in-memory caches
  plus Mongo (source of truth). Auth stays correct; distributed counters
  (rate limits across instances) become per-process.
- **Transaction errors (`Transaction numbers are only allowed on a replica set`).**
  Refresh rotation uses multi-document transactions. Use the Docker replica set
  (`docker-compose.yml`) or `tests/integration/helpers/mongo.ts`
  (`startMongoReplSet`). A standalone `mongod` fails these paths.
- **Stale keys.** `PEZHWAN_SIGNING_KEYS_PATH` (default `./keys`) persists the
  keystore. A fresh directory auto-generates keys; if old tokens suddenly fail
  verification with `UNKNOWN_KEY`, the server is reading a different
  directory or the keys were deleted — restore them so `kid` continuity is kept.

## Refresh-token timing and race issues

Refresh tokens are single-use and rotated atomically (`SessionService`):
the active parent is claimed and a child created in one transaction. Common
duplication failures:

- **Two clients refresh with the same token concurrently.** Only one wins; the
  other sees `REFRESH_TOKEN_UNKNOWN`/reuse detection and the whole family can
  be revoked. Clients must serialise refresh calls and treat a revoked family
  as "log in again".
- **`TOKEN_EXPIRED` right after login.** The access token is short-lived
  (default `15m`). Schedule a refresh before expiry rather than after; the
  refresh endpoint rejects expired access tokens but accepts a valid refresh
  token.
- **Clock skew between instances** surfaces in `tests/failure/clock-skew.test.ts`
  as 401s; use NTP-synced clocks in multi-instance deployments.