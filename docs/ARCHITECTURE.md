# PEZHWAN — Architecture & Design Reference

*One Identity. Every Application.* A universal Identity & Access Management
(IAM) SDK. This document explains the architecture, the data flow, the
functional surface, the security model, and the operational properties
(optimization, reliability, scalability) of the SDK.

---

## 1. High-level architecture

Pezhwan is a **monorepo of layered npm packages**. The dependency direction is
strictly one-way: lower layer knowledge never leaks upward.

```
┌────────────────────────────────────────────────────────────┐
│  @pezhwan/identity-server   Reference server (Express)      │
│  @pezhwan/react             Browser SDK (Provider, hooks)   │
│  @pezhwan/node              Node.js SDK facade              │
│  @pezhwan/express           Express middleware + routers    │
├────────────────────────────────────────────────────────────┤
│  @pezhwan/core              Domain models + auth engine     │
│                             + services (sessions, RBAC, MFA,│
│                             OTP, audit, rate-limit, API key)│
├────────────────────────────────────────────────────────────┤
│  @pezhwan/crypto            Argon2id, RS256/ES256/EdDSA,    │
│                             JWKS, key rotation, OTP/TOTP    │
│  @pezhwan/shared            Types, constants, error classes │
└────────────────────────────────────────────────────────────┘
```

### Layer responsibilities

| Layer | Responsibilities |
|-------|------------------|
| `@pezhwan/shared` | Framework-independent contracts: types, `AUDIT_EVENT`, default TTL / rate-limit / lockout / OTP policy, `DEFAULT_COOKIE`, error classes (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `SessionError`, `SecurityEventError`). |
| `@pezhwan/crypto` | Cryptographic primitives: `hashPassword`/`verifyPassword` (Argon2id), JWT sign/verify + JWKS, key generation/rotation, `generateOtp`/`hashOtp`/`verifyOtp`, TOTP (RFC 6238). Secrets handled here, never above. |
| `@pezhwan/core` | The domain. `KeyStore`, `TokenService`, `SessionService`, `AuthEngine`, `OtpService`, `MfaService`, `AuthorizationService`, `AccountStateService`, `AuditService`, `RateLimitService`, `ApiKeyService`, Mongoose models, `PezhwanLogger`, `MetricsRegistry`. Exposes `createPezhwan()` → `PezhwanRuntime`. |
| `@pezhwan/oauth` | OAuth 2.1 / OIDC engine backed by core services. |
| `@pezhwan/express` | `authenticate()`, `requireAuth()`, `requireRole()`, `requirePermission()`, `corsAllowlist()`, `csrfProtection()`, `securityHeaders()`, `requestContext()`, pre-built routers (auth / sessions / oauth / mfa / verification), API-key auth, JWKS handler. |
| `@pezhwan/react` | React provider + hooks + route guards wrapping the browser HTTP client (auto-attaches `Authorization` and `X-CSRF-Token`). |
| `@pezhwan/node` | Convenience facade over core for non-HTTP Node services. |
| `@pezhwan/identity-server` | Reference host: wires the runtime + middlewares into a runnable Express server with OIDC discovery and a browser demo. |

### Runtime object graph (`createPezhwan` → `PezhwanRuntime`)

```
createPezhwan(config)
   ├─ KeyStore (RS256 keys) ── KeyStoreService (ensure signing key)
   ├─ RedisCache (or in-memory fallback)
   ├─ TokenService { store, cache }        # sign/verify access+refresh JWTs
   ├─ SessionService { tokens, cache }     # rotating refresh-token families
   ├─ AccountStateService { cache }        # tokenVersion / status check
   ├─ AuthorizationService { audit }       # roles+permissions → IdentityContext
   ├─ AuditService                         # tamper-evident log
   ├─ MfaService, OtpService, VerificationTokenService
   ├─ OAuthService, ApiKeyService, RateLimitService
   ├─ AuthEngine( d={tokens,sessions,cache,otp,accountState,
   │                authorization,audit,mfa,verificationTokens},
   │              opts={tenantId,applicationId,issuer,audience,policy} )
   └─ PezhwanLogger, MetricsRegistry
```

The `AuthEngine` is the orchestration core. Controllers (Express routes or SDK
callers) invoke engine methods; the engine composes password hashing, OTP,
sessions, tokens, account state and audit.

---

## 2. Functional surface (what the SDK does)

### Authentication
- **Register** — password (email) or phone + OTP passwordless.
- **Login** — password, OTP (email/phone), magic-link, OAuth/OIDC.
- **MFA gateway** — when TOTP is enabled, valid password does **not** mint
  tokens until a TOTP/backup-code challenge passes.
- **Refresh / logout** — rotating refresh tokens, single-use rotation,
  reuse detection.

### Session management
- Rotating refresh-token **families** (a chain of replaced sessions).
- Reuse of an already-rotated token ⇒ the **whole family** is revoked.
- Session list / revoke / revoke-all, per-user+application active caps.

### Authorization (RBAC)
- Roles / permissions scoped to tenant+application.
- `requireRole`, `requirePermission` gate middleware.
- Identity is **always** derived from the verified access token, never from
  client-supplied body fields.

### MFA / OTP
- TOTP (RFC 6238) setup/enable/verify/disable.
- Hashed, single-use backup codes.
- OTP send/verify with rate-limit, cooldown, attempt caps.

### Password & account
- Password change/reset with policy enforcement and `tokenVersion` bump (which
  invalidates all outstanding access tokens).
- Email/phone verification; magic links; verification tokens.
- Enumeration-safe flows (unknown accounts burn a decoy token / OTP).

### OAuth 2.1 / OIDC
- Authorization-code + PKCE S256, client registration, refresh grant,
  client_credentials, JWKS + OpenID discovery.

### Developer/dev ops
- API keys (only hashes stored), audit log, structured logging, metrics,
  request-id correlation.

---

## 3. Core flows (sequence)

### 3.1 Registration (password)

```
Browser ── POST /v1/auth/register { email, password }
  1. requestContext        assign requestId/correlationId, X-Response-Time
  2. securityHeaders       CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy
  3. corsAllowlist         origin must be allowlisted (echo, never wildcard)
  4. createAuthenticate    optional: attach req.pezhwan if a token is present
  5. csrfProtection        non-safe method ⇒ cookie must match X-CSRF-Token
  6. router.post /register
       AuthEngine.register:
         a. validate identity handle (email/phone) present
         b. evaluatePassword against policy
         c. hashPassword (Argon2id)
         d. UserModel.create(...)                    # <-- 500 bug (ObjectId cast)
         e. SessionService.create(...)               # new session + refresh family
         f. memoize IdentityContext (roles/permissions)
         g. signAccessToken (RS256, kid, exp)
         h. audit USER_REGISTERED
  7. respond 201 { user, accessToken, refreshToken }
```

### 3.2 Login (password, no MFA)

```
POST /v1/auth/login { email, password }
  findUser → verify Argon2id hash
  lockout check (failedLoginAttempts / loginLockUntil)
  account active check
  MFA gateway: if TOTP enabled → 200 { mfaRequired:true, userId }
  else completeLogin:
     SessionService.create          # new refresh family
     buildIdentity → sign access JWT
     audit LOGIN_SUCCESS
  → { user, accessToken, refreshToken }
```

### 3.3 Refresh (rotating, single-use)

```
POST /v1/auth/refresh { refreshToken }
  hash = SHA-256(refreshToken)
  find session by currentRefreshTokenHash
  if session.status != 'active'  → refresh-reuse ⇒ revokeFamily + throw
  else:
     mint new refresh pair
     SessionModel.create(child, same familyId)
     update parent: status='replaced', replacedBySessionId=child
  → { accessToken, refreshToken }
```

### 3.4 Authenticated request (any API)

```
Request with `Authorization: Bearer <access>`
  createAuthenticate:
    extract token → verifyAccessToken (RS256, kid rotation, exp)
    AccountState.validate(userId, tokenVersion)   # fail-closed
    attach req.pezhwan = { userId, roles, permissions, ... }
  requireAuth: reject 401 if no identity
  requireRole / requirePermission: reject 403 if missing
```

---

## 4. Security model

### 4.1 Cryptographic posture
- **Argon2id** for password hashing (mem-hard, OWASP recommended).
- **Asymmetric JWT** (`RS256`, also `ES256`/`EdDSA`) with `kid` + **key
  rotation**; public keys published via **JWKS**.
- **Short-lived access tokens** (default 15 min) + **long-lived but rotating,
  one-time-use refresh tokens**.
- Only **SHA-256 hashes** of refresh tokens, OTP codes, verification tokens,
  API keys, OAuth client secrets, and authorization codes are stored.

### 4.2 Session/theft defense
- Refresh token **reuse detection** — a replayed already-rotated token revokes
  the entire family.
- `tokenVersion` invalidates all outstanding access tokens on password
  change/reset (account state is checked on every authenticated request).
- Per-user+application active-session cap (LRU eviction by `lastActiveAt`).

### 4.3 Authorization (never trust the client)
- Roles/permissions come only from the verified `IdentityContext` (inside the
  signed JWT / derived server-side), never from `req.body.role` etc.
- Every authorization decision is scoped by `tenantId` (+ `applicationId`).

### 4.4 Transport & browser hardening
- `securityHeaders`: CSP, HSTS (+subdomains), `nosniff`, `X-Frame-Options`,
  Referrer-Policy, Permissions-Policy.
- `corsAllowlist`: **exact** origin allowlist; never `Access-Control-Allow-Origin: *`
  with credentials; public safe reads echo origin only.
- `csrfProtection`: same-site double-submit cookie (`pezhwan_csrf`) echoed as
  `X-CSRF-Token`; issues the cookie on safe requests; lax by default.
- `requestContext`: requestId/correlationId propagation + `X-Response-Time`.

### 4.5 Abuse / brute-force
- Per-endpoint **rate limiting** (login, register, OTP, refresh, API).
- Account **lockout** after N failed attempts (15-min window).
- OTP **cooldown**, **attempt caps**, short TTL.
- **Enumeration-safe** flows: unknown emails still burn a token-shaped decoy.

### 4.6 Audit & observability
- **Tamper-evident** audit log (append-only `prevHash` chain).
- **Never log** passwords, tokens, OTP codes, client secrets (`[REDACTED]`).
- Structured logger with child `requestId` context; metrics registry.

### 4.7 Fail-closed default
- Security-critical dependency failure (e.g. account state cannot be verified)
  results in **no identity** being attached → 401/503, never silent allow.

### 4.8 Known gaps / notes (see `problems.md`)
- **Persistence type mismatch (unfixed):** Mongoose models type
  `tenantId`/`applicationId` as **ObjectID** while the SDK config, JWTs and
  domain types use **strings**. Any real persistence (`UserModel.create`,
  `SessionModel.create`, ...) throws a cast error. This must be reconciled
  before production data flows (see `problems.md` #3).
- Cross-site cookie deployment (different host between app and IdP) requires
  HTTPS + `SameSite=None; Secure`.

---

## 5. Optimization

- **Redis layering:** session liveness (`cacheLiveness`), account state, OTP
  attempts, and rate limits are cached; MongoDB is the source of truth, Redis
  short-circuits hot reads.
- **Indexed queries:** unique sparse indexes on `(tenantId,email)` /
  `(tenantId,phone)`; session + audit + role lookups indexed by tenant/application.
- **Key store caching:** JWKS served with `Cache-Control: public, max-age=300`.
- **Cheap liveness:** `isSessionActive` uses the cached marker first, falling
  back to a single indexed `findById(...).select('status expiresAt')`.
- **Deliberate decoys:** enumeration-resistant flows avoid extra DB round trips
  on unknown accounts while keeping timing uniform.
- **Async, non-blocking** service design throughout (Mongoose, ioredis, Node).

---

## 6. Reliability

- **Fail-closed** authentication: a drained Redis or an unverifiable account
  state never *grants* access.
- **Rotating tokens** bound token lifetime and detect replay/theft early.
- **External sink isolation:** audit sink failures are swallowed so a broken
  analytics pipeline cannot break authentication.
- **Startup bootstrap:** keystore signing key is ensured at startup so the
  server is immediately usable (`createPezhwan` seeds ≥1 key).
- **Traceability:** a `requestId` on every request propagates through logs and
  error responses for diagnosis.
- **Deterministic test posture:** backstop security/integration suites assert
  invariants (no wildcard CORS, CSRF rejection, fail-closed auth, no-logging).

---

## 7. Scalability

Because authorization is largely **stateless** (signed access tokens with
encapsulated `IdentityContext`), the hot path scales horizontally:
- Multiple IdP instances can share MongoDB + Redis; access-token verification
  needs only the JWKS, not a shared session store.
- **Stateless verification:** `authenticate` verifies the JWT signature + kid
  locally; the account-state check is a fast Redis read.
- Refresh/session state lives in MongoDB (source of truth) with Redis as a
  performance cache — suitable for horizontal read scaling.
- **Multi-tenant isolation** keeps every query and authorization decision
  tenant-scoped, letting the data layer be sharded/partitioned by `tenantId`.
- Rate limiting, lockout, and OTP state are Redis-backed, so counters survive
  vertical scale-out without being per-process.

### Horizontal scaling recommendations
- Run the IdP behind an LB; keep `trust proxy = 1` (already set) so `req.ip`
  is the real client IP (correct audit + rate-limiting).
- Use the optional `redis` client for distributed rate/cache state across
  nodes; the in-memory fallback is single-process only.
- Persist the signing keystore via a `FileKeyStoreAdapter` (or KMS) so restarts
  keep the same `kid` family and valid JWTs remain verifiable.

---

## 8. Start-up / integration cheat sheet

```bash
npm install
npm run build                     # build all workspaces
npm run dev -w @pezhwan/identity-server   # identity server on :4011
```

```ts
import { createPezhwan } from '@pezhwan/core';
import { buildRouters, securityHeaders, corsAllowlist } from '@pezhwan/express';

const runtime = createPezhwan({
  tenantId: '...', applicationId: '...',
  issuer: 'https://id.example.com', audience: 'pezhwan.clients',
  otpDelivery: { sendEmail: async (to, code) => { /* send */ } },
});
```

> **Remember:** after editing any package in `packages/*`, rebuild it before
> running the server (`npm run build -w <pkg>`), because the server consumes
> the compiled `dist/` output.
