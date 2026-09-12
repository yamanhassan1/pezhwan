# Best Practices

Practical guidance for building applications on Pezhwan — and for extending the
SDK itself. Where a rule stems from the repository's invariants, it is marked
with the source.

## Security

- **Fail closed.** If an account's state cannot be verified (Mongo/Redis
  dependency failure), the runtime attaches **no identity** — requests surface
  `FAILED_SECURITY_DEPENDENCY`/`AUTH_REQUIRED`, never a silent allow. Do not
  add `catch → allow` fallbacks around authentication primitives.
- **Never log secrets.** Passwords, hashes, OTP codes, tokens, client secrets,
  and API keys are redacted (`[REDACTED]`) by `PezhwanLogger` before emission.
  Never bypass the logger with `console.log` of a credential, and never copy a
  confidence value (e.g. a token) into an exception message or audit metadata.
- **Require MFA/OTP on sensitive surfaces.** Pezhwan's MFA gateway pauses login
  until a TOTP/backup code passes (`mfaRequired: true`). Recommended for any
  admin, billing, or privileged-role surface; enforce per-route with
  `requireRole`/`requirePermission` plus MFA step-up (`/v1/mfa/verify`).
- **PKCE is required for public clients.** OAuth 2.1 mandates
  `code_challenge_method=S256`; a public client without PKCE is refused
  (`PKCE_REQUIRED`). Do not weaken this for convenience.
- **Treat the browser as untrusted.** Frontend guards (`ProtectedRoute`,
  `useAuthorization().can`) are UX conveniences only — every policy decision is
  re-enforced server-side by the express middleware. Never trust `req.body`
  roles, permissions, or `tenantId` for authorization.
- **Keep secrets out of the client.** Access tokens in memory only (or,
  preferably, httpOnly same-site cookies); refresh tokens never reach
  JavaScript. `demos/browser-sdk/index.html` is explicitly a development
  example, not a production token-handling template.
- **CORS & CSRF stay strict.** Use exact-origin `PEZHWAN_ALLOWED_ORIGINS`; the
  server never emits `Access-Control-Allow-Origin: *` with credentials. Keep
  the double-submit CSRF cookie flow for state-changing calls.

## Multi-tenancy

- Every query, session, role, permission, and OAuth client is scoped by
  `tenantId` (+ `applicationId`). Pass the tenant explicitly through service
  calls; never derive it from client input.
- A user belongs to one tenant (unique `(tenantId, email)` / `(tenantId, phone)`
  partial indexes). Cross-tenant identity federation is expressed with
  `LinkedIdentity`, not by sharing rows.
- Tenant/application boundary violations surface as `SESSION_CONTEXT_INVALID`
  (on token/context mismatch) and `INVALID_SCOPE` (on out-of-scope OAuth
  requests) — treat them as bugs in your integration, not noise.
- For tenant onboarding, use the admin API (`/v1/admin/tenants`,
  `/v1/admin/users`, `/v1/admin/roles`) or the `ensureBootstrap`/seed path
  rather than hand-writing documents.

## Session hygiene

- Access tokens are short-lived (default `15m`) and carry an encapsulated
  `IdentityContext`. Read auth state from the verified token, never from a
  session store, on the hot path.
- Refresh tokens are single-use and rotate atomically. Clients must **serialise
  refresh calls** and treat a `REFRESH_TOKEN_UNKNOWN`/reuse-detected family as
  "log in again" — two concurrent refreshes is a genuine replay signal.
- Revoke deliberately: `DELETE`/revoke per session id, revoke-all on logout,
  and invalidate outstanding tokens by bumping `tokenVersion` on password
  change/reset (account state is checked on every authenticated request).
- Respect the per-user+application active-session cap (LRU eviction by
  `lastActiveAt`) rather than raising it indefinitely.

## Error handling

- Throw/surface the typed error families (`PezhwanError` + subclasses) with
  stable `code`s, HTTP `status`, `requestId`, and optional `details`. Never
  leak stack traces or internal state in responses.
- Map low-level errors to envelope codes at the boundary; the error handler in
  `server.ts` turns `status >= 500` messages into `Internal server error`.
- Handle `RATE_LIMIT_EXCEEDED` explicitly — back off by `retryAfterSeconds`
  instead of hammering login/OTP/refresh endpoints.
- Audit events are tamper-evident and append-only; record security-relevant
  state changes (`ROLE_CHANGED`, `MFA_ENABLED`, `SESSION_REVOKED`, ...) via
  `runtime.audit.log`, not ad-hoc log lines.

## Observability

- Correlate with `requestId`: propagate it through logs, errors, and outbound
  request headers (`X-Request-Id`) so one identifier spans the whole flow.
- Default to structured logs at `info`; use `debug` during development and
  `PEZHWAN_LOG_LEVEL=debug` when tracing a flow.
- Health-check readiness (`/health/ready`) reports Mongo/Redis/OTP-provider
  state — wire it into orchestrator readiness probes and alert on the
  `degraded`/`unavailable` states.
- Export metrics via `MetricsRegistry` (and `PEZHWAN_OTEL_ENDPOINT` when wired)
  for request volume, latency, auth failures, and rate-limit triggers.

## Performance

- **Reuse the runtime singleton.** `createPezhwan()` builds a service graph
  (keystore, token/session/account-state services and their caches). Construct
  it once at startup and share it; a new runtime per request defeats all
  caching and key-memoization.
- **Redis as a cache, Mongo as the source of truth.** Session liveness,
  account state, OTP attempts, and rate limits are short-circuited in Redis
  (or the in-memory fallback); do not re-implement caching layers on top.
- Verify access tokens statelessly: JWT signature + `kid` locally, then a
  single cheap account-state read. This is what makes the hot path
  horizontally scalable behind a load balancer (`trust proxy = 1`).
- Batch admin writes (role assignment, user provisioning) and paginate list
  calls with `limit`/`offset` rather than pulling full collections.

## SDK usage patterns

- Prefer the framework SDK for the host you are on: `@pezhwan/express`
  middleware + routers for servers, `@pezhwan/react`/`@pezhwan/angular`/
  `@pezhwan/vue` providers + guards for browsers, the zero-dependency
  Python/Go/Java/.NET clients for non-Node languages.
- Configure `baseUrl`, `tenantId`/`applicationId`, and the issuer exactly once;
  keep `otpDelivery` callbacks side-effect-free (fire an email/SMS, never store
  or log the code).
- Run the backstop suites (`npm run test:root`, `npm run test:security`,
  `npm run test:integration`) after touching auth-related code — they encode
  the invariants above as executable tests.