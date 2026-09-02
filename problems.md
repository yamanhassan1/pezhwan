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
