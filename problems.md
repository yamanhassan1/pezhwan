# PEZHWAN — Known Problems and Fixes

This file records problems encountered while bringing up the SDK, the reference identity server, and the demo frontend. Each entry documents the symptom, root cause, reproduction notes, and final status.

The project intentionally documents both historical failures and current dev-only caveats so future contributors understand what was fixed and why.

---

## 1. Frontend demo leaked sensitive auth material

**Status:** ✅ FIXED

**Symptom:** The browser demo rendered raw tokens, refresh tokens, and user identity details in the UI and request logs.

**Root cause:** The demo page stored access/refresh tokens in browser state and displayed them directly for debugging convenience. That is acceptable in a local UI only, but not in a production browser app because any XSS or browser inspection can expose the token.

**Fix applied:**
- masked token previews instead of printing raw values
- limited user profile output to non-sensitive metadata
- sanitized API log output to remove token-like strings and JWTs
- documented that the demo is a development-only reference and should never be treated as production token handling

**Production guidance:** keep tokens in secure, HttpOnly cookies whenever possible; never render bearer tokens or refresh tokens in browser UI code.

---

## 2. CORS preflight blocked (`No 'Access-Control-Allow-Origin' header`)

**Status:** ✅ FIXED

**Symptom:** browser requests from `http://127.0.0.1:5500` or other demo origins were rejected with a CORS error before the API even processed the request.

**Root cause:** the identity server allowlist was built from configured origins and did not include the actual demo origin. The local dev server also loaded environment variables inconsistently when started from a different working directory.

**Fix applied:**
- expanded the default allowlist to include local demo hosts
- loaded environment variables explicitly from the identity server directory
- aligned the demo client to the expected local API host

---

## 3. CSRF mismatch on state-changing requests

**Status:** ✅ FIXED

**Symptom:** POST requests such as register/login failed with `403 CSRF token mismatch`.

**Root cause:** the middleware validated a double-submit cookie and header pair, but the browser never received a cookie unless a safe request created it first.

**Fix applied:**
- issued the `pezhwan_csrf` cookie on safe requests when absent
- exposed `GET /v1/auth/csrf` so the browser can prime the cookie
- updated the browser demo to send `X-CSRF-Token` on state-changing requests

---

## 4. Registration `500 Internal Server Error` due to ObjectId/string mismatch

**Status:** ✅ FIXED

**Symptom:** registration failed with a cast error when the app used string tenant IDs like `dev-tenant`.

**Root cause:** the runtime consistently used string-based tenant/application IDs, but the Mongo models stored them as `ObjectId` references. That caused validation failures on create/update flows.

**Fix applied:**
- aligned all affected Mongo models to string-based identifiers
- enforced identifier policy consistency across the runtime
- added partial index guards to avoid duplicate email/phone collisions under one tenant

---

## 5. Demo served cross-origin from Live Server

**Status:** ✅ MITIGATED

**Symptom:** the browser demo worked from the identity server itself but broke when served from a separate editor preview host.

**Root cause:** same-origin cookies and strict CORS rules were being challenged by a cross-origin UI served from a different port/host.

**Fix applied:**
- document the preferred same-origin server-hosted demo flow
- allow local dev origins explicitly
- keep cookie and CSRF setup consistent for cross-origin local use

---

## 6. Refresh-token rotation race under concurrency

**Status:** ✅ FIXED

**Symptom:** concurrent refresh requests using the same refresh token could both succeed and create duplicate session states.

**Root cause:** both requests read the same active session and both attempted a refresh without an atomic claim step.

**Fix applied:** refresh now atomically marks a parent session as `rotating` before issuing a new child session. Only one caller wins, while duplicates are rejected as token reuse.

---

## 7. Rate-limiter lost increments under concurrency

**Status:** ✅ FIXED

**Symptom:** multiple concurrent requests could bypass the expected rate limit because increments were overwritten or dropped.

**Root cause:** the limiter used a read-modify-write pattern that was not atomic under contention.

**Fix applied:** moved to atomic counter semantics with bounded in-memory fallback behavior and stronger enforcement.

---

## 8. Redis lifecycle issues and unbounded cache growth

**Status:** ✅ FIXED

**Symptom:** Redis connection failures could surface as noisy unhandled errors, and in-memory fallback caches could grow without bounds.

**Root cause:** the Redis manager lacked bounded retries and shutdown cleanup; the memory cache had no capacity limits.

**Fix applied:**
- added bounded retry strategy and graceful shutdown
- added health checks and error listeners
- capped memory cache capacity and TTL eviction

---

## 9. Hollow access tokens accepted during verification

**Status:** ✅ FIXED

**Symptom:** a correctly signed token that lacked required claims could still be treated as valid.

**Root cause:** validation accepted tokens that were structurally valid but semantically incomplete.

**Fix applied:** verification now rejects tokens missing required claims and timestamp data.

---

## 10. Signing-key persistence could brick startup

**Status:** ✅ FIXED

**Symptom:** partially written or zero-byte signing key files could prevent the server from booting cleanly.

**Root cause:** direct writes and atomicity issues around temp files and rotation intervals were causing startup instability.

**Fix applied:**
- write temp files and rename atomically
- self-heal orphaned `.tmp` and zero-byte files
- clamp rotation interval values to Node-safe limits

---

## 11. Minor dev-only console noise

**Status:** ℹ️ COSMETIC

Examples:
- Babel in-browser warning in the demo page
- favicon 404 when no icon is shipped
- React DevTools suggestion in development builds

These are not security issues by themselves; they are simply non-blocking warnings in local development.

---

## Reproduction and local troubleshooting

Use the identity server for correct local runs:

```bash
npm install
cp .env.example .env
npm run build
npm run dev -w @pezhwan/identity-server
```

Common checks:

- verify `http://localhost:4011/.well-known/openid-configuration`
- verify `http://localhost:4011/.well-known/jwks.json`
- verify `http://localhost:4011/v1/auth/csrf`
- verify the browser is calling the server on the same allowed host/origin configuration

Notes:

- the browser demo is a development reference and should be considered unsafe to copy into production
- do not store tokens in browser-local state outside of a local debugging environment

---

# Current production-readiness assessment

**Assessment date:** 2026-09-02
**Current rating:** **7.4/10**
**Decision:** **NO-GO**

The SDK has materially improved security controls, but it does not yet have
enough live infrastructure and operational evidence to meet the requested
9.9/10 production target. This rating is based on implemented controls plus
verified evidence, not documentation alone.

## Release-blocking problems

1. No repeatable live MongoDB/Redis integration suite runs in CI.
2. No executed Mongo backup/restore drill with measured RPO/RTO and
   post-restore authentication verification.
3. Mongo replica-set transactions, Redis Sentinel/Cluster, multi-instance
   behavior, and JWKS consistency are not proven.
4. Refresh rotation is not transactionally atomic across child creation and
   finalization; the current atomic claim and replay checks reduce, but do not
   eliminate, failure-window risk.
5. The audit hash chain is best-effort under concurrent HA writers and has no
   strict single-writer ordering or retention control.
6. Existing base64 MFA records require a migration to the new AES-GCM envelope
   format before upgrading an existing deployment.
7. The reference server has development console OTP adapters; production fails
   closed rather than sending, but no real email/SMS provider integration exists.
8. Redis outages reduce distributed rate limiting to bounded process-local
   limits, which is insufficient for strong multi-instance abuse protection.

## Important unverified or incomplete controls

- No dedicated load-test suite or measured throughput/latency baseline.
- No systematic failure-injection suite for Mongo, Redis, JWKS, key storage,
  provider timeouts, and recovery.
- CI has no lint job, coverage threshold, dependency-review policy, license
  review, or container vulnerability scan.
- Compose syntax and image build are checked, but container smoke testing has
  not been completed.
- MongoDB/Redis authentication, TLS, and ACL hardening are not demonstrated by
  the development Compose stack.
- External OAuth/OIDC interoperability tests with a real provider are absent.
- Alert thresholds and dashboard behavior are documented, not tested.
- Frontend bundle inspection proving private secrets cannot enter browser
  artifacts is not recorded.
- No migration command exists for identifier, MFA, index, or persisted-key
  changes.

## Evidence-based scorecard

| Category | Score |
|---|---:|
| Security and secrets | 8.5 |
| Cryptography and JWT | 8.5 |
| Authentication and MFA/OTP | 7.0 |
| Authorization and tenancy | 8.0 |
| Session security | 8.0 |
| OAuth/OIDC | 7.5 |
| MongoDB and data integrity | 6.5 |
| Redis and distributed limits | 6.5 |
| Reliability and scalability | 6.0 |
| Observability and operations | 7.0 |
| Disaster recovery | 4.0 |
| Testing and failure verification | 6.0 |
| CI/CD and supply chain | 7.0 |
| Documentation and developer experience | 8.0 |

**Overall:** **7.4/10**. Per the production prompt, any score below 9.9
requires a **NO-GO** decision.

## Required path to production approval

1. Add real MongoDB/Redis integration tests and run them in CI.
2. Add Mongo replica-set transaction coverage and Redis HA coverage.
3. Execute backup/restore and signing-key recovery drills.
4. Add MFA legacy-secret migration with rollback and verification.
5. Add load, failure-injection, OAuth interoperability, and cross-tenant
   attack suites.
6. Add lint, coverage, dependency review, license review, and container scan
   gates, then attach release evidence and alert-test results.

## Dependency branch maintenance status

The repository dependency branches have been reconciled. All verified, safe
updates were merged and their branches deleted; high-risk major updates are
retained as open PRs with a documented reason.

- **Merged (branches deleted):** Argon2 0.45.1 (already on main, including the
  `HashOptions` type fix), GitHub Actions (`checkout`/`setup-node`/
  `upload-artifact` v4→v7, `gitleaks` v2→v3), dotenv 17.4.2, @types/node
  26.4.0, @types/react 19.2.18. All pass build, typecheck, and workspace tests.
- **Held open (blocked):** Mongoose 9.9.4 and ioredis 6.0.0 remain unmerged
  because runtime integration tests against real MongoDB and Redis are not yet
  available, and Mongoose 9/TypeScript 7 currently fail build/typecheck.
  TypeScript 7.0.2 is a major toolchain change that fails on `baseUrl` removal
  and is a maintenance/performance upgrade rather than a production-readiness
  blocker. See `docs/dependency-maintenance.md`.
