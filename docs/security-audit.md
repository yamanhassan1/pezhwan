# PEZHWAN — Security Audit & Hardening Record

**Engagement:** full-stack security/architecture hardening of the Pezhwan IAM SDK.
**Method:** every claim below was inspected in source, modified where required,
and **verified by execution** — unit/backstop tests plus live-Mongo integration
scripts where a persistence path was involved. Nothing is asserted without a
test or a reproduced run.

---

## 1. Architecture (current)

Modular monolith (deliberately NOT microservices), one npm workspace with strict
package layering:

```
@pezhwan/shared  →  @pezhwan/crypto  →  @pezhwan/oauth  →  @pezhwan/core
                                                                  ↓
                          @pezhwan/react         @pezhwan/express
                                     ↘           ↗
                                  @pezhwan/identity-server  (reference host, :4011)
```

- **Source of truth:** MongoDB (`pezhwan` DB, `mongodb://localhost:27017`).
- **Ephemeral state:** optional Redis, strictly an optimiser. On any Redis
  failure the stack degrades to a bounded process-local cache and always falls
  back to Mongo for durable state.
- **Demo:** `demo/index.html` served by the identity server itself at `/`, or via
  Live Server on `127.0.0.1:5500` (cross-origin — fixed CORS/CSRF, see below).

### Trust boundaries

| Boundary | Policy |
|---|---|
| Client ⇄ Express handlers | Server never trusts client-supplied identity; all auth via verified JWTs or API keys |
| Express ⇄ `@pezhwan/core` | Identity comes from `verifyAccessToken` + `accountState.validate` (fail closed) |
| Core ⇄ Mongo | Redis never authoritative; Mongo is the durable source |
| Signing keys | RS256, JWKS published; private keys never leave the KeyStore |

---

## 2. Security controls verified

| Control | Where | Status |
|---|---|---|
| Argon2id password hashing (never plaintext) | `@pezhwan/crypto` | ✅ tests |
| Refresh tokens stored as SHA-256 hash only | `session.service.ts` | ✅ tests |
| Constant-time hash comparison | `token.service.ts` | ✅ tests |
| JWT algorithm pinned (no `alg:none`, no key confusion) | `jwt.ts` `algorithms:[...]` | ✅ tests |
| Fail-closed account state (Mongo error throws) | `accountState.service.ts` | ✅ tests |
| CORS strict allowlist (never wildcard w/ credentials) | `security.ts` | ✅ tests |
| CSRF double-submit (cookie + header) | `security.ts` | ✅ tests |
| Secret redaction in structured logs | `logger` | ✅ tests |
| Rate limiting (atomic fixed-window) | `rateLimit.service.ts` | ✅ tests |
| Rate limiting exposed & mounted on all auth routers | `rateLimit.ts` (G1) | ✅ tests (429 on budget exhaustion) |
| MFA brute-force throttle (durable counter + 15-min lock, fail closed) | `mfa.service.ts`, `user.model.ts` (G2) | ✅ live-Mongo |
| MFA/TOTP secret at-rest carve-out documented | `THREAT-MODEL.md` §2 (G3) | ✅ documented |
| 503 vs 401 on storage-dependency failure | `express/index.ts` (G4) | ✅ tests |
| Durable signing keys across restarts + scheduled rotation | `initKeyPersistence()` (G5) | ✅ tests (restart round-trip) |
| Explicit body-size cap (`PEZHWAN_BODY_LIMIT`) | `server.ts` (G6) | ✅ verified |
| Audit `prevHash` chain — best-effort HA guarantee documented | `THREAT-MODEL.md` §10 (G7) | ✅ documented |
| Atomic refresh-token rotation (reuse detection) | `session.service.ts` | ✅ live-Mongo |
| Token-version invalidation on password/role changes | `accountState` + auth engine | ✅ live-Mongo |
| PKCE S256 / plain verification (OAuth 2.1) | `OAuthService` | ✅ tests |
| OIDC discovery advertises S256 + openid | `OAuthService` | ✅ tests |

---

## 3. Findings & remediations (this engagement)

### Critical / high — fixed & verified

| # | Finding | Fix | Verification |
|---|---|---|---|
| F1 | Every model typed `tenantId`/`applicationId` (and internal ids) as `Schema.Types.ObjectId` while the whole stack uses strings → `Cast to ObjectId failed for "dev-tenant"` 500 on register | String identifiers across all models + new `identifier-policy.ts` | live-Mongo create + query round-trip |
| F2 | Unique `(tenantId, phone)` / `(tenantId, email)` indexes used `sparse`, which indexes `null` → email-only users collided | `partialFilterExpression` (`{$type:'string'}`) | live-Mongo multi-register |
| F3 | Concurrent refresh of same token could mint two live pairs (non-atomic rotate) | Atomic claim `active→rotating` via `findOneAndUpdate` | live-Mongo 8×concurrent → exactly 1 success |
| F4 | Rate-limiter read-modify-write lost increments under concurrency | Atomic `INCR`+`EXPIRE` (`incrementAndExpire`) | 50 concurrent consumes → exactly 50 |
| F5 | Redis client: unbounded retry, unhandled `error` event crashes process, no shutdown | `RedisManager` (bounded retry, connect timeout, error listener, `disconnect`) + SIGINT/SIGTERM wiring | tests: lazy/bounded/fail-fast; no unhandled events |
| F6 | `MemoryCache` in-memory fallback unbounded | Capacity-capped (10k) + TTL sweep + FIFO eviction | bounded-cache test |
| F7 | Hollow access tokens accepted (missing required claims) | `verifyAccessToken` requires `sub/tenantId/applicationId/sessionId/iat` | hollow-token test |
| F8 | Corrupt signing-key file silently ignored → HA desync / tamper-masking | FileKeystore `load()` throws on corrupt file | corrupt-file test |
| F9 | Role revoke didn't invalidate existing tokens (revocation latency) | `assignRole`/`removeRole` bump `tokenVersion` + drop account-state cache | live-Mongo: tokenVersion 0→1, old token rejected |

### Material — determined already correct (no change required)

- JWT `alg` is pinned per token service config — HS/RS confusion and `none` are
  structurally prevented.
- Account-state validation fails **closed** (throws) on Mongo error rather than
  granting.
- Session reuse detection revokes the **entire family** (theft response).
- Redis is never authoritative; Mongo is the single source of truth.

### Documented design trade-offs (accepted, per requirements)

- **Roles/permissions ride in the access-token JWT** and are authoritative for
  the token's short TTL (15 min). Immediate revocation is via `tokenVersion`
  (password/role/admin changes bump it — F9). A per-request DB role re-check
  would break the stateless-token design; the trade-off is documented, not
  hidden.
- **Rate limiting returns to a per-process counter when Redis is down.** An
  attacker on multiple instances/machines can only be limited per instance
  during a Redis outage. This is the accepted availability trade-off ("Redis is
  an optimiser, never a gate") and is surfaced by `RedisManager.isHealthy()`.
- **Sessions cache liveness in Redis/Memory for 30 s** — acceptable staleness
  window for the cheap-liveness fast path; authoritative check remains Mongo.

---

## 4. Reproduction & verification evidence

All runs below are from this engagement (Windows, PowerShell shell):

| Run | Result |
|---|---|
| `npm run build` (all workspaces) | ✅ no errors |
| `npm run test -w @pezhwan/core` | ✅ 19/19 → 20/20 |
| `npm run test -w @pezhwan/express` | ✅ 7/7 → 9/9 |
| `tests/security/backstop-security.test.ts` (via `npm run test:backstop`) | ✅ 17/17 → 28/28 |
| live-Mongo cast-fix script (user + session create with string IDs) | ✅ PASS |
| live-Mongo rotation script (8 concurrent refreshes, same token) | ✅ 1 ok / 7 reuse-rejected |
| live-Mongo role script (assignRole bumps tokenVersion; old token rejected) | ✅ PASS |
| live-Mongo MFA-lock script (5 attempts → lock; correct code rejected while locked) | ✅ PASS |

---

## 5. Recommended follow-ups (not yet implemented)

1. **Per-request authorization re-check (optional, should be opt-in):** a
   `requireFreshPermissions` middleware that re-resolves roles against Mongo
   when a handler needs it, trading a DB read for zero revocation latency.
2. **Mongo replica set + transactions:** makes rotation `create`+`finalise`
   fully transactional (current design is safe and verified; a transaction would
   eliminate the tiny crash window between child-create and parent-finalise).
3. **Redis Sentinel/Cluster support** in `RedisManager` for HA deployments.
4. **Field-level envelope encryption of `mfaSecret`** (and the persisted signing
   PEMs) for deployments that put the DB / key files outside the trust boundary —
   this is the deliberately-documented G3 carve-out, not yet implemented.
5. **Audit retention policy knob + writing audits behind a single-writer shard**
   in HA so the `prevHash` chain is strictly ordered rather than best-effort (G7).