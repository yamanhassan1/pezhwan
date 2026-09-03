# PEZHWAN — Phase A: Build Record & Architecture

Status: **COMPLETE AND VERIFIED**. All 7 packages build cleanly, `tsc` typecheck
is clean, and 18/18 unit tests pass. This document records what was built in
Phase A and how the architecture fits together.

Complements `README.md` (quick start + security promises). This file is the
record of *what was done* and the reference for the architecture.

---

## 1. Phase A status

| Check | Result |
|-------|--------|
| `npm install` | OK — 146 packages, 0 vulnerabilities |
| `npm run build` | OK — shared, crypto, core, node, express, react, identity-server |
| `npm run typecheck` | OK — clean across all workspaces |
| `npm test` | OK — 18/18 pass (shared 3, crypto 4, core 4, node 3, express 4, react 1) |

Runtime tooling: Node v24.19.0, npm 11.17.0. npm workspaces; all workspace
dependencies use `"*"` (npm does not support the `workspace:` protocol).

`argon2@0.40.3` has an install script (node-gyp-build) that was explicitly
approved via `npm approve-scripts argon2`.

---

## 2. Monorepo layout

| Package | Responsibilities |
|---------|------------------|
| `@pezhwan/shared` | Framework-independent types, `AUDIT_EVENT` constants, error classes (`PezhwanError` + subclasses) |
| `@pezhwan/crypto` | Argon2id hashing, RS256 JWT sign/verify, `KeyStore` + JWKS + rotation, OTP gen/hash/verify |
| `@pezhwan/core` | Mongoose models, auth engine, sessions, OTP, RBAC, rate limiting, audit, account state, keystore persistence |
| `@pezhwan/node` | `Pezhwan(config)` facade over core + error re-exports |
| `@pezhwan/express` | Middleware (`authenticate`/`requireAuth`/`requireRole`/`requirePermission`), pre-built auth+session routers, JWKS handler |
| `@pezhwan/react` | `PezzhwanProvider`, `useAuth`/`useSession`/`useAuthorization`, route guards |
| `@pezhwan/identity-server` | Dev reference Express server using core directly |

Build order in the root `build` script follows the dependency chain:
shared → crypto → core → node → express → react → identity-server.

---

## 3. Core architecture

`createPezhwan(config)` (`packages/core/src/pezhwan.ts`) is the single
entry-point. It validates config, then wires the full stack:

```
config
  → KeyStore(jwtAlgorithm ?? 'RS256')          asymmetric signing keys
  → KeyStoreService(MemoryKeyStoreAdapter)     persistence seam
  → keyStoreService.ensureKey()                 seed ≥1 signing key at startup
  → createRedisCache(redis ?? null)             Redis wrapper (never throws)
  → TokenService                                access tokens + refresh-pair primitives
  → SessionService                              rotating refresh-token families
  → AccountStateService                         per-request account liveness
  → AuditService                                tamper-evident event log
  → AuthorizationService                        RBAC (roles/permissions)
  → OtpService                                  purpose-scoped OTP lifecycle
  → AuthEngine                                  orchestration of all auth flows
  → RateLimitService                            sliding-window limiter
```

The returned `PezhwanRuntime` exposes `config`, `store`, `cache`, `tokens`,
`sessions`, `accountState`, `authorization`, `audit`, `rateLimiter`, `auth`.

### Defaults (overridable via config)

| Setting | Default |
|---------|---------|
| Access token TTL | 15 min |
| Refresh token TTL | 30 days |
| Key TTL / RSA size | 30 days / 2048-bit |
| Max active sessions per user+app | 5 (LRU revoked when exceeded) |
| OTP | 6 digits, 5 min TTL, 5 attempts, 30 s resend cooldown, 15 min attempts window |
| Rate limits | login/register 10/15 min, otp 5/10 min, refresh 30/15 min, api 100/15 min |
| Session cache TTL / account-state cache TTL | 30 s |
| Password policy | 8–128 chars, ≤72 UTF-8 bytes, mix case + digit, no 4+ repeated runs |

---

## 4. Auth flows (`AuthEngine`)

All flows are server-side orchestrated; applications never implement auth
logic. Errors are typed `PezhwanError` subclasses with machine-readable codes.

| Method | Behavior |
|--------|----------|
| `register` | Validates identity handle + password policy; Argon2id-hashes; creates user; opens session; returns user + tokens |
| `loginPassword` | Lookup by email/phone; checks lockout; requires Argon2id hash; 5 failures → 15-min lock; returns user + tokens |
| `requestOtp` | Generates + delivers a code (email/SMS) for a purpose; enumeration-safe; returns `retryAfterSeconds` when throttled |
| `verifyOtp` | Purpose-agnostic OTP check (used by the standalone `/otp/verify` endpoint) |
| `loginOtp` | Verifies a `login` OTP then completes login |
| `refreshSession` | Rotates the refresh token; re-resolves roles/permissions for the new access token |
| `changePassword` | Requires current password; bumps `tokenVersion` (invalidates outstanding access tokens); clears account-state cache |
| `resetPassword` | OTP-gated; bumps `tokenVersion`; revokes all sessions; issues fresh session + tokens |
| `verifyEmail` | OTP-gated; sets `emailVerified` |

Access tokens carry `sub`, `tenantId`, `applicationId`, `sessionId`, `roles`,
`permissions`, `authMethod`, `kid`, `iss`, `aud`, `iat`, `exp`, `jti`.

### Pre-built Express endpoints

Auth router: `POST /register`, `/login`, `/logout`, `/refresh`, `/otp/send`,
`/otp/verify`, `/password/change`, `/password/reset`, `/email/verify`.

Sessions router (auth required): `GET /`, `POST /:id/revoke`, `POST /all/revoke`.

Responses use a consistent `{ success, data, error: { code, message } }`
envelope. Public JWKS: `GET /.well-known/jwks.json`.

---

## 5. Security design

- **Passwords** — Argon2id (OWASP-recommended), 64 MiB / 3 iterations.
  `verifyPassword` never throws on a malformed hash; the engine rejects
  non-Argon2 hashes (`isArgon2Hash`), so legacy bcrypt cannot slip through.
- **Tokens** — RS256 asymmetric. Private key never leaves the server; public
  keys published via JWKS so any consumer can verify without a shared secret.
  Rotation keeps a new signer while old keys verify until expiry.
- **Refresh tokens** — rotating and one-time-use. Only SHA-256 hashes are
  stored. Presenting an already-replaced token triggers **whole-family
  revocation** (`REFRESH_TOKEN_REUSE`) — rotation/reuse protocol per OAuth
  BCP (RFC 9700 family guidance subset).
- **OTP** — At most one live code per `(tenant, app, purpose, channel, target)`
  enforced by a unique compound index + conservative upsert. Cumulative
  failed-attempt budget (never reset on resend); attempts exhausted blocks
  both verify and generate. Enumeration-safe: unknown targets still burn the
  cooldown and verify returns a generic `expired`, keeping payloads and
  timing indistinguishable.
- **Authorization** — RBAC resolved server-side from the verified token
  identity + DB role/permission lookups. Never from client input. Express
  `requireRole` / `requirePermission` gate routes.
- **Multi-tenancy** — every user/session/role/permission/OAuth-client query is
  scoped by `tenantId` + `applicationId`.
- **Fail closed** — `AccountStateService` throws a 503-class
  `SecurityDependencyError` if Mongo is unreachable; it never grants access on
  an unverifiable account state. Audit and rate-limit failures degrade instead.
- **Redis is an optimizer, never a gate** — `RedisCache` never throws: on an
  unready client or mid-command error it falls back to an in-memory cache
  (per-process). Mongo remains the source of truth.
- **Audit** — append-oriented Mongo log with a SHA-256 `prevHash` chain for
  tamper evidence; an optional external `sink` forwards events. Logging is
  best-effort and swallows errors. Passwords, raw tokens, OTP codes, and
  client secrets are never written.
- **Keystore persistence** — `FileKeyStoreAdapter` writes PEM files with
  0o600 perms in a 0o700 directory; the default is in-memory
  (`MemoryKeyStoreAdapter`).

---

## 6. Services (`packages/core/src/services/`)

| Service | Role |
|---------|------|
| `token.service.ts` | Signs/verifies access tokens; creates & hashes refresh pairs |
| `session.service.ts` | Session create/rotate/revoke/revokeAll/listActive/liveness; reuse detection; per-user+app session cap |
| `otp.service.ts` | One-live-code guarantee, cooldown + attempt budget, enumeration-safe verify |
| `password.service.ts` | Password policy evaluation (+ default policy) |
| `rateLimit.service.ts` | Sliding-window limiter; Redis SORTED-state via cache; in-memory per-process fallback |
| `accountState.service.ts` | Cached exists/active/tokenVersion match; fails closed on Mongo read failure |
| `authorization.service.ts` | `assignRole`/`removeRole`/`hasRole`/`hasPermission`/`can`/`buildIdentityContext` |
| `audit.service.ts` | prevHash-chained event log + optional external sink |
| `apiKey.service.ts` | Server-to-server keys (`pk_live_...`); only SHA-256 hashes stored |
| `redisCache.ts` | `RedisLike` structural type, memory fallback, never-throw wrapper |
| `keyStore.service.ts` | Persist adapters + `ensureKey`/`init`/`rotate` |

### Models (`packages/core/src/models/`, 8 Mongoose models)

`user`, `tenant`, `application`, `session`, `role`, `otp`, `apiKey`,
`auditLog`. Cross-model references use `Types.ObjectId`; uniqueness is
enforced by compound indexes (e.g. per-tenant email, OTP signer tuple,
`currentRefreshTokenHash`).

---

## 7. Framework adapters

### Express (`@pezhwan/express`)
- `createAuthenticate(runtime)` — verifies bearer/cookie access token, attaches
  `req.pezhwan` (never throws; optional-auth routes proceed unauthenticated).
- `requireAuth()` — 401 when no identity.
- `requireRole()` / `requirePermission()` — RBAC route gates.
- `jwksHandler(runtime)` — serves the public key set.
- `buildRouters(runtime)` — pre-wired `auth` + `sessions` routers.

Supports Express ^4.19 || ^5. Express 5 typed `req.params.id` as
`string | string[]`, so route handlers guard against arrays.

### React (`@pezhwan/react`)
`PezzhwanProvider` (config: baseUrl/cookie domain), `useAuth`,
`useSession`, `useAuthorization`, `ProtectedRoute`, `RequireRole`,
`RequirePermission`. Reads an httpOnly refresh cookie and performs silent
rotation via `/v1/auth/refresh`; sends `X-CSRF-Token` from the `pezhwan_csrf`
cookie on state-changing calls. Frontend gates are documented as UX-only.

### Identity server (`apps/identity-server`)
Dev reference host. Reads env
(`PEZHWAN_ISSUER`, `PEZHWAN_TENANT_ID`, `PEZHWAN_APPLICATION_ID`,
`PEZHWAN_MONGODB_URI`, `PEZHWAN_REDIS_URL`, `PEZHWAN_PORT`), mounts
`/v1/auth`, `/v1/sessions`, `/.well-known/jwks.json`, and logs OTP codes to
stdout. Optional ioredis client typed as `RedisLike`.

---

## 8. Config reference (`PezzhwanConfig`)

Required: `tenantId`, `applicationId`, `issuer`, `audience`, `otpDelivery`.

| Field | Notes |
|-------|-------|
| `mongoose` | Optional connection (defaults to a shared default connection) |
| `redis` | Optional ioredis-like client; structural `RedisLike | null` |
| `accessTokenTtlMs` / `jwtAlgorithm` | Token knobs (default RS256, 15 min) |
| `passwordPolicy` | Optional policy override |
| `otp` | `codeLength`, `ttlMs`, `maxAttempts`, `resendCooldownMs`, `attemptsWindowMs` |
| `otpDelivery` | Required `sendEmail` + optional `sendSms` callbacks |
| `lookupUser` | Custom user-lookup hook |
| `maxActiveSessions` | Default 5 |
| `debug` | Optional |

`Pezzhwan(config)` (from `@pezhwan/node`) delegates to `createPezhwan`.

---

## 9. Build work & fixes applied (the "what we did" record)

Phase A was verified from a fresh install. The following fixes were required to
make a cold `npm install → build → test` pass:

1. **Workspaces** — npm's `workspace:` protocol is unsupported; all inter-workspace deps changed to `"*"`.
2. **TypeScript + ESM** — `tsconfig.base.json` enables `allowImportingTsExtensions`
   + `rewriteRelativeImportExtensions` (source imports use `.ts` suffixes,
   tsc rewrites to `.js` in dist). Dropped a `paths` mapping that masked
   resolution problems.
3. **CJS interop** — mongoose (`models`, `Schema` are getters) and
   `jsonwebtoken` default-import + destructure patterns across all 8 models
   and `crypto/src/jwt.ts`.
4. **Algorithm typing** — `signJwt`/`verifyJwt` cast `JwtAlgorithm` →
   `jwt.Algorithm`; token-service sign/verify use the same cast.
5. **Mongoose doc typing** — model refs typed `Types.ObjectId`; `UserDoc` /
   `SessionDoc` include `_id`; `prefix?` made optional on API keys; duplicate
   `currentRefreshTokenHash` index warning removed (unique now via
   `schema.index`).
6. **Redis typing** — `PezzhwanConfig.redis: RedisLike | null`; ioredis
   clients satisfy the structural interface.
7. **Keystore seeding** — `KeyStoreService.ensureKey()` adds a signing key
   synchronously at startup so JWKS/sign work immediately.
8. **Auth engine** — added public `AuthEngine.verifyOtp`; the `/otp/verify`
   Express route now calls it.
9. **Express 5 params** — session id guarded for `string | string[]`.
10. **Tests** — `node --test` (default discovery) as the test script;
    fixed `ConfigurationError` unit assertion and the express test import of
    `createPezhwan`.
11. **identity-server** — uses `createPezhwan`, added `ioredis` dep, aligned
    `@types/express` to `^5.0.0`, typed redis as `RedisLike | null`.
12. **argon2** — install script approved (`npm approve-scripts argon2`).

---

## 10. Known limitations & deferred phases

Phase A covers the SDK scaffold + core auth stack. Deliberately out of scope
until reassessed (Phases B–N of the roadmap):

- OAuth 2.0 / OIDC providers, MFA/TOTP, passkeys, magic links
- Tenant/application bootstrap + admin console
- Full client-secret lifecycle and redirect-URI management
- Integration test suites against live MongoDB + Redis (current tests are
  unit-level/backstop; the runtime has not yet been exercised end-to-end with
  real databases)

Note: the reference server now mounts the tenant-scoped `users` router
(`GET /v1/users/me`) that the React SDK reads at bootstrap. A tenant-scoped
API-key endpoint wiring pattern is established under `/v1/services/ping`.

The transport-app project was NOT migrated to Pezhwan — that is a later,
explicitly requested phase. It continues to run its own HS256/bcrypt auth.