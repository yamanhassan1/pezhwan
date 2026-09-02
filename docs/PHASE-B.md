# PEZHWAN — Phase B: Build Record (OAuth/OIDC, MFA, Verification, Observability, Infra & Docs)

Status: **COMPLETE AND VERIFIED**. All 7 packages build and `tsc` typecheck
clean; 39 unit tests pass. This document records the Phase B surface on top of
`PHASE-A.md` and cross-links the threat model and OpenAPI spec.

Complements:
- `README.md` — quick start + security promises (extended in Phase B)
- `docs/THREAT-MODEL.md` — STRIDE threats mapped to source-verified mitigations
- `docs/OPENAPI.yaml` — OpenAPI 3.0.3 description of the full HTTP surface

---

## 1. Phase B status

| Check | Result |
|-------|--------|
| `npm run build` | OK — all workspaces (clean dist rebuilt) |
| `npm run typecheck` | OK — clean across all workspaces |
| `npm run test` | OK — **39/39 pass** (up from 18 in Phase A) |
| `docker compose config` | OK — compose v5.3.1 validates (`identity-server` service added) |
| Docker image build | BLOCKED — Docker Desktop daemon not running; Dockerfile validated syntactically only |

The test delta vs Phase A is +21 explicit security/observability regressions:
`createAuthenticate` fail-closed on unverifiable account state, War-of-the-Worlds
(DNS) TOTP replay, TOTP/time-window boundary, base32 lossless round-trip,
crypto rng shape, logger redaction of camelCase secret keys, and broader core
auth/edge assertions.

---

## 2. New packages / adapters

Phase B adds the OAuth/OIDC client and reference-server containerization:

| Package | Added in Phase B |
|---------|------------------|
| `@pezhwan/oauth` | Authorization-code + PKCE S256 engine, token endpoint (code exchange, refresh, client_credentials), OIDC discovery + JWKS. Built between `@pezhwan/crypto` and `@pezhwan/core` in the dependency chain. |
| `apps/identity-server` | `Dockerfile` (multi-stage, non-root `pezhwan` user, HEALTHCHECK) + `.dockerignore`. |
| `identity-server` compose service | `infrastructure/docker/docker-compose.yml` — wires Mongo/Redis + identity-server. |

---

## 3. Security & observability hardening (Phase B)

1. **Fail-closed account-state check wired into HTTP**: `createAuthenticate`
   now calls `accountState.validate(identity.userId, identity.tokenVersion ?? 0)`
   before attaching an identity — `packages/express/src/index.ts:66-75`. Deleted,
   disabled, or tokenVersion-rotated accounts (and Mongo-down) are denied. A new
   express regression test asserts the no-identity-fail-closed behavior.
2. **Request context** (`packages/express/src/security.ts`): `requestContext`
   propagates requestId/correlationId, threads a requestId-scoped child logger
   on `req.log`, and injects `X-Response-Time` on `res('finish')`.
3. **Logger redaction fix** (`packages/core/src/services/logger.service.ts`):
   redact keys are lowercased in the constructor so camelCase secret keys
   (`accessToken`, `clientSecret`, `mfaSecret`) are reliably masked. A core
   regression test locks this in.
4. **Crypto round-trip fix** (`packages/crypto/src/totp.ts`): `encodeBase32`
   zero-pads the tail to a full 5-bit group so 32-byte secrets round-trip
   losslessly — verified: 52 base32 chars, 32 bytes recovered.
5. **OAuth PKCE + code hygiene** (`packages/core/src/services/oauth.service.ts`):
   `code_challenge` required for all clients (S256 for public, S256+plain for
   confidential); constant-time S256 verify; single-use atomic code redemption;
   PKCE failure revokes the bound session; OAuth codes/client secrets stored
   SHA-256 hashed.

---

## 4. Phase B API surface (see `docs/OPENAPI.yaml`)

All endpoints use the `{ success, data, error: { code, message, requestId } }`
envelope except OAuth/OIDC, which use RFC 6749 `{ error, error_description }`.

Routers (`packages/express/src/`):

| Area | Endpoints |
|------|-----------|
| Auth (`routes.ts`) | `POST /register /login /logout /refresh /otp/send /otp/verify /otp/login /password/change /password/reset /password/forgot /email/verify` |
| Extra (`routes.extra.ts`) | `POST /v1/mfa/setup/enable/verify/disable/login`, `/v1/password/forgot`, `/v1/password/reset/confirm`, `/v1/email/verify-token`, `/v1/magic/send/redeem` |
| Sessions | `GET /v1/sessions`, `POST /v1/sessions/all/revoke`, `POST /v1/sessions/:id/revoke` |
| OAuth (`routes.oauth.ts`) | `GET /v1/oauth/authorize`, `POST /v1/oauth/token`, `POST /v1/oauth/clients` |
| Well-known | `GET /.well-known/jwks.json`, `GET /.well-known/openid-configuration` |
| Admin / services | `GET /v1/admin/health` (ADMIN role), `GET /v1/services/ping` (API key) |

OIDC discovery (`oauth.service.ts:514-529`): `issuer`,
`authorization_endpoint`, `token_endpoint`, `jwks_uri`,
`response_types_supported: ['code']`, `grant_types_supported:
['authorization_code','refresh_token','client_credentials']`, scopes
`openid profile email`, claims `sub iss aud exp iat nonce`.
`/.well-known/openid-configuration` advertises `code_challenge_methods_supported:
['S256']`.

OAuth `exchange()` returns `{ accessToken, refreshToken?, idToken?, expiresIn,
scope }`.

---

## 5. Auth-flows matrix (AuthEngine additions)

Phase B completes the verification and MFA flows alongside the Phase A
password/OTP flow:

| Method | Behavior |
|--------|----------|
| `loginOtp` | Passwordless OTP login; respects MFA (returns `mfaRequired` challenge) |
| `changePassword` | Requires current password; bumps `tokenVersion` (invalidates outstanding access tokens); clears account-state cache |
| `resetPassword` (OTP) / (token) | Token- or OTP-gated; bumps `tokenVersion`; revokes sessions; issues fresh session + tokens |
| `verifyEmail` | Sets `emailVerified` (OTP- or token-gated) |
| MFA (`mfa.service.ts`) | TOTP setup/enable/verify/disable + backup codes; login gating (`mfaRequired`) until `verifyMfaLogin` |
| Magic links / verification tokens | `verificationToken.service.ts` token hashing + tenant-scoped redeem |

Password change/reset call `accountState.invalidate` so cached account state is
purged — `auth/auth.engine.ts:624-630,671-683,765-777`.

---

## 6. Security promises (extended)

Additions to `README.md` Phase A list:

- **OAuth 2.1 / OIDC** — authorization-code + PKCE S256, asymmetric JWKS, proper
  `{error, error_description}` wire format
- **MFA/TOTP (RFC 6238)** — HMAC-SHA1, 30s step, ±1 skew, backup codes (hashed,
  single-use); disabled only with a valid current code
- **Verification tokens + magic links** — SHA-256 stored, purpose-scoped,
  tenant-scoped redeem
- **OAuth codes & client secrets** — stored SHA-256 hashed; single-use codes
- **API keys** — `pk_live_...`, only hashes stored, scoped, revocable
- **Full security middleware** — security headers (CSP/HSTS/nosniff/DPP),
  exact-origin CORS (never wildcard; credential-free `/.well-known/*` reads are
  open so the browser demo and health probes work cross-origin), CSRF
  double-submit, fail-closed auth

See `docs/THREAT-MODEL.md` §10 for the residual gaps (rate-limit wiring, MFA
throttle, TOTP-at-rest, 503 vs 401, key persistence, body-cap, HA audit chain)
tracked as the next phase.

---

## 7. Infrastructure

`apps/identity-server/Dockerfile` — multi-stage:
- Stage 1: install + build all workspaces (shared→crypto→oauth→core→node→express→react→identity-server).
- Stage 2: non-root `pezhwan` user, copies workspace dist + `demo/`, HEALTHCHECK
  on `/.well-known/jwks.json`, CMD `node dist/server.js`.

`infrastructure/docker/docker-compose.yml` (compose v5.3.1 semantics, `version:`
removed) — services: `mongo`, `redis`, `identity-server` (builds from repo root
`../..`, `dockerfile apps/identity-server/Dockerfile`, depends on healthy
Mongo/Redis, env `PEZHWAN_ISSUER_REPLACEMENT`/`PEZHWAN_ALLOWED_ORIGINS`,
`mongodb://mongodb:27017/pezhwan`, `redis://redis:6379`).

---

## 8. Resolved prior limitations

From `PHASE-A.md` §10 "deferred phases," this phase has landed:

- ✅ OAuth 2.0 / OIDC providers, MFA/TOTP, magic links, verification tokens
- ✅ Tenant-scoped API-key + services endpoint, admin health endpoint
- ✅ Dockerfile + compose for the reference server

Still deferred (tracked in the threat model): live-Mongo integration suites
(`tests/{unit,integration,security}` backstop dirs exist; unit-level only until
a DB is reachable), client-secret lifecycle management endpoints, admin
console, and the transport-app migration.

---

## 9. Build & runtime notes

- Rebuilt all workspace `dist` from clean (removed stale `packages/core/dist`
  that exhibited phantom `TS1005/TS1128` errors — corruption, not source).
- Tests import from compiled `@pezhwan/*` dist; rebuild after `src/` changes.
- `mongodb-memory-server` is not resolvable from workspace test dirs; tests
  avoid live Mongo and use the fail-closed/in-memory path.
- Runtime Node v24.19.0; Docker v29.6.2 / Compose v5.3.1; Docker daemon not run
  during this phase, so the image build remains unexecuted.