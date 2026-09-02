# PEZHWAN Threat Model

Scope: the `@pezhwan/*` identity & access management stack and the reference
`identity-server` (`apps/identity-server`). Methodology: STRIDE-per-component
with mitigations mapped to source-verified controls. The threat model is a
living document; update it when controls change.

Trust boundaries and assumptions:

- The MongoDB and Redis stores are trusted infrastructure (network-isolated).
  Clients do not reach them directly.
- The system must **fail closed**: any uncertainty about an identity's
  validity resolves to "not authenticated," never to "authenticated."
- High-entropy secrets are never stored or logged in plaintext (SHA-256 at
  rest; Argon2id for low-entropy passwords).
- TLS is terminated upstream (proxy) or by the identity server; all endpoints
  are intended to be served over HTTPS in production.

Legend:

- `[Verified]` = control is enforced in code (file:line given).
- `[Partial]` = control present but has a documented gap.
- `[Gap]` = control desired but not implemented.

---

## 1. Credentials & Passwords

| Threat | STRIDE | Mitigation |
|---|---|---|
| Offline password cracking | Information Disclosure / Tampering | Argon2id (`timeCost 3`, `memoryCost 64 MiB`, `parallelism 1`) — `packages/crypto/src/password.ts:23-28`. Only `passwordHash` stored — `packages/core/src/models/user.model.ts:59`. Login rejects non-Argon2 hashes — `auth/auth.engine.ts:287-292`. Input-size guard (72-byte) — `services/password.service.ts:20-29`. |
| Password stuffing / brute force | Tampering | 5 failed logins → `loginLockUntil` 15 min, returns `retryAfterMs` — `auth/auth.engine.ts:280-286,535-557`. |
| Password re-use rotation attack | Tampering | Accepting an already-used current password is rejected at change — `auth/auth.engine.ts:624`. |
| Weak password accepted regardless of policy | Tampering | `password.service.ts` validates strength + repeat rules. |

---

## 2. High-Entropy Secrets (tokens, codes, keys)

| Threat | STRIDE | Mitigation |
|---|---|---|
| DB leak exposes usable secrets | Information Disclosure | All high-entropy secrets stored SHA-256 hashed: refresh token (`token.service.ts:204-206`), OAuth code (`oauth.service.ts:75-77`), client secret (`oauth.service.ts:138`), API key (`apiKey.service.ts:40-42`), OTP (`packages/crypto/src/otp.ts:22-24`), verification token (`verificationToken.service.ts:44-57`), MFA backup code (`mfa.service.ts:41-49`). Constant-time compare (`timingSafeEqual`) everywhere. |
| Timing side-channel on secret compare | Information Disclosure | `timingSafeEqual` used in token.service.ts:209-218, oauth.service.ts:79-88, otp.ts:30-41. |
| Token replay | Spoofing | Refresh tokens are one-time-use, rotated to a child session in the same `familyId` — `session.service.ts:115-182`. |
| Refresh-token reuse escalates attacker control | Elevation of Privilege | Presenting a replaced token triggers `revokeFamily(familyId)` → kills the session family, throws `REFRESH_TOKEN_REUSE` — `session.service.ts:134-140,208-217`. Unique `currentRefreshTokenHash` index — `models/session.model.ts:51-52`. |
| OAuth authorization-code replay | Spoofing | Single-use atomic redeem (`findOneAndUpdate` on `consumedAt: null`) + unique `codeHash` prevents replay — `oauth.service.ts:319-331`. |
| Raw secrets written to logs | Information Disclosure | Logger redacts nested keys incl. `password, accessToken, refreshToken, clientSecret, otp, code, totp, mfaSecret, codeVerifier…` — `services/logger.service.ts:19-37`. Audit service never logs raw secrets — `audit.service.ts:4-6`. |

---

## 3. OAuth / OIDC

| Threat | STRIDE | Mitigation |
|---|---|---|
| Authorization-code interception | Spoofing / Info Disclosure | PKCE `code_challenge` **required for all clients** — `oauth.service.ts:218-221`; public clients S256-only — `oauth.service.ts:141`; constant-time S256 verify — `oauth.service.ts:500-512`. On PKCE failure the bound session is revoked — `oauth.service.ts:349-359`. |
| Client-secret theft/mixed-mode downgrade | Spoofing | Client secret stored hashed — `oauth.service.ts:177`. No enforcement of "confidential must use secret" flag noted — minor gap below. |
| Redirect-URI tampering | Tampering | (not separately verified here; relies on exact registered `redirect_uris` match at authorize) — see `oauth.service.ts`. |
| Unified error differences enable client probing | Info Disclosure | OAuth errors share standard RFC 6749 `{error, error_description}` shape. |
| Token confusion between audiences | Elevation of Privilege | Access tokens carry `tenantId` + `kid`, verified per request — `token.service.ts:78,84,184`; verification pins `algorithms:[RS256]` — `jwt.ts:202-205`. |
| Reuse of ID token as access token | Spoofing | (verify in runtime; ID token has `nonce`/`aud` distinct shaping) — `oauth.service.ts` discovery lists scopes `openid profile email`. |

---

## 4. MFA / TOTP

| Threat | STRIDE | Mitigation |
|---|---|---|
| TOTP brute force | Spoofing / Tampering | Constant-time compare — `packages/crypto/src/totp.ts:126`. RFC 6238, 30s step, ±1 skew, 6 digits. |
| Backup-code theft | Spoofing / Info Disclosure | Backup codes stored SHA-256 hashed, single-use unique `codeHash` — `mfa.service.ts:79-88`, `models/backupCode.model.ts:33-34`. |
| MFA bypass via disable | Tampering | Disable requires a currently-valid code/backup code — `mfa.service.ts:194-211`. |
| Session issued without MFA when enabled | Elevation of Privilege | Password/OTP success with MFA enabled returns `mfaRequired:true` and **no tokens** until `verifyMfaLogin` — `auth/auth.engine.ts:311-321,409-419,437-502`. |
| TOTP secret leak at rest | Info Disclosure `[Documented]` | **Accepted carve-out**: `mfaSecret` stored base64 (unhashed — the plaintext secret is required for TOTP verification), hidden with `select:false` — `models/user.model.ts:64`. Documented exception; deployments that put the DB outside the trust boundary should enable field-level envelope encryption (see `security-audit.md` §5.4). |
| MFA brute-force throttling | Tampering | Durable per-user TOTP/backup-code attempt counter + 15-min lock on the user document; fail closed while locked — `mfa.service.ts`, `models/user.model.ts` (G2). |

---

## 5. OTP (one-time passwords)

| Threat | STRIDE | Mitigation |
|---|---|---|
| OTP brute force | Spoofing / Tampering | One live code per key (unique index) — `otp.model.ts:61-64`. Cumulative failed-attempt budget via Redis + durable Mongo `$inc` — `otp.service.ts:87-94,159-163,187-197`. Exhaustion blocks verify AND regenerate. |
| OTP regen/cooldown abuse | Tampering / DoS | Resend cooldown returns `retryAfterSeconds` — `otp.service.ts:76-85`; defaults: ttl 5 min, maxAttempts 5, cooldown 30s — `pezhwan.ts:165-176`. |
| Account enumeration via OTP errors | Info Disclosure | Unknown targets burn cooldown and return generic `'expired'` — `otp.service.ts:124-130,173-176`. |
| OTP theft at rest | Info Disclosure | Stored SHA-256 hashed — `packages/crypto/src/otp.ts:22-24`. |

---

## 6. Sessions & Account State

| Threat | STRIDE | Mitigation |
|---|---|---|
| Stolen CORS/wildcard allowed to read tokens | Info Disclosure | `corsAllowlist`: exact-origin allowlist, **never wildcard**, never credentials on public paths — `express/src/security.ts`. Disallowed origin on credentialed endpoints → 403 `ORIGIN_REJECTED`. Credential-free public discovery (`/.well-known/*`) echoes the requester origin for safe GET/HEAD/OPTIONS so browsers/health probes can read it cross-origin — `server.ts`. |
| Deleted/disabled/rotated account keeps using tokens | Elevation of Privilege | `createAuthenticate` fails closed: no identity attached unless `accountState.validate(userId, tokenVersion)` passes — `express/src/index.ts:66-75`. Backed by 30s Redis cache, in-memory fallback — `services/accountState.service.ts:21,50-70`. |
| Password change/reset stale-token reuse | Elevation of Privilege | Change/reset bumps `tokenVersion` and invalidates cached state — `auth/auth.engine.ts:624-630,671-683,765-777`. Tokens embed `tokenVersion` — `token.service.ts:92`. |
| Logout/revoke fails to invalidate | Tampering | Session revoke sets `status:'revoked'` + evicts Redis liveness — `session.service.ts:208-217`; `/v1/sessions/all/revoke`, `/v1/sessions/:id/revoke`. |
| Storage outage grants access | Spoofing | Fail-closed holds (no identity); `SecurityDependencyError` surfaces as **503** (not a misleading 401) — `express/index.ts`, G4. |

---

## 7. Tenant Isolation

| Threat | STRIDE | Mitigation |
|---|---|---|
| Cross-tenant data access | Elevation of Privilege / Info Disclosure | Identities `{tenantId,email}`/`{tenantId,phone}` unique — `user.model.ts:75-78`. All auth lookups embed `tenantId` — `auth/auth.engine.ts:96-105,987-1000`. OTP keyed by tenant+app — `otp.model.ts:61-64`. Roles/permissions tenant-scoped — `role.model.ts:46-49,94-97,131-134`. Sessions tenant-scoped — `session.model.ts:39`. Access-token `tenantId` verified per request — `token.service.ts:78,184`. |
| Tenant-injection via API key | Elevation of Privilege | API keys are globally-unique unguessable hashes; lookup not tenant-filtered but finds exactly one row whose tenant is *assigned*, never caller-supplied — `apiKey.service.ts:51-58`. |
| Tenant-injection via OAuth client | Elevation of Privilege | `clientId` globally unique — `oauthClient.model.ts:71`; found row assigns tenant. Services constructed with fixed tenant never accept caller tenant — `pezhwan.ts:158-206`. |

---

## 8. JWKS / Token Signing

| Threat | STRIDE | Mitigation |
|---|---|---|
| Weak/guessable signing key | Spoofing | RSA-2048, RS256 — `packages/crypto/src/jwt.ts:48-57,99`. Verify pins `algorithms:[RS256]` — `jwt.ts:202-205`. |
| Algorithm-confusion downgrade (alg=none / HS256) | Spoofing | Signing enforces configured algorithm — `jwt.ts:177-189`; verification restrictively pins algorithm list — `jwt.ts:202-205`. |
| Key rotation leaves stale keys signing | Spoofing / Info Disclosure | Keys expire (30-day TTL), pruned — `jwt.ts:129,163-170`; `KeyStoreService.rotate()` generates+persists — `keyStore.service.ts:105-108`. JWKS served from `runtime.store.jwks()` — `express/index.ts:136-141`. |
| Unknown `kid` accepted | Spoofing | Verify looks up by `kid` w/ fallback to current; unknown → `UNKNOWN_KEY` — `token.service.ts:158-163`. |
| Key persistence across restarts | Availability | `initKeyPersistence()` wires `FileKeyStoreAdapter` + scheduled rotation into identity-server bootstrap **before** serving — `pezhwan.ts`, `server.ts`; keys survive restarts and rotations are verified by a restart round-trip test (G5). |

---

## 9. API / Transport Layer Defense

| Threat | STRIDE | Mitigation |
|---|---|---|
| Volumetric / request flooding (login, register, otp, refresh) | Denial of Service | Atomic fixed-window `RateLimitService.consume()` active at the HTTP layer via `rateLimit()` middleware on auth/session/oauth/mfa/verification routers (login 10/15m, otp 5/10m, api 100/15m) — `rateLimit.ts`, `rateLimit.service.ts`. 429 + `Retry-After` + `X-RateLimit-*`; limiter failure degrades open (availability over strictness) (G1). |
| Reflection/Timing side channels on identity checks | Info Disclosure | Fail-closed middleware and constant-time compares (§2, §5). |
| Browser-side attacks (clickjacking, MIME sniffing, script eval) | Tampering / Info Disclosure | `securityHeaders()`: X-Frame-Options DENY — `security.ts:71,78`; CSP — `security.ts:32-38`; X-Content-Type-Options nosniff — `security.ts:74`; Referrer-Policy strict-origin — `security.ts:75`; Permissions-Policy camera/mic/geolocation off — `security.ts:70,76`; HSTS — `security.ts:66-67,79-83`. |
| CSRF on state-changing auth endpoints | Tampering | Double-submit cookie `pezhwan_csrf` vs `x-csrf-token` on non-safe methods — `security.ts:132-159`; mounted on `/v1/auth`,`/v1/mfa`,`/v1/verify` — `server.ts:119-121`. |
| Oversized body / parser abuse | DoS | Explicit `express.json({ limit: config.server.bodyLimit })` (default `100kb`, `PEZHWAN_BODY_LIMIT` env) — `server.ts` (G6). |
| Correlation/obfuscation of requests | Auditability | `requestContext()` threads requestId/correlationId + child logger — `security.ts:92-125`; `X-Response-Time` on finish. Audit chain-of-custody via `prevHash` SHA-256 chain — `audit.service.ts:52-59`. |

---

## 10. Observability & Non-Repudiation

| Threat | STRIDE | Mitigation |
|---|---|---|
| Security events not recorded | Repudiation | Audit service writes events; failure never blocks auth — `audit.service.ts:38-40,75-77`. |
| Tampered audit trail | Tampering `[Documented]` | `prevHash` hash chain best-effort in HA (concurrent writers may fork the chain) — `audit.service.ts:42-49`. Best-effort guarantee documented explicitly; deployments needing strict ordering should serialize to a single-writer audit shard (G7). |

---

## Control Inventory \& Gaps (Action Items)

| # | Area | Status | Action / Resolution |
|---|---|---|---|
| G1 | HTTP rate limiting | `[Verified]` | `rateLimit()` middleware (`packages/express/src/rateLimit.ts`) mounted on auth/session/oauth/mfa/verification routers; fixed-window atomic counter (Redis or in-memory), `429 + Retry-After + X-RateLimit-*`, degrades open on limiter failure. Verified: express 9/9, live 429 on budget exhaustion. |
| G2 | MFA brute-force throttle | `[Verified]` | Durable per-user attempt counter + 15-min lock on the user doc; `verifyMfa`/`disable` fail closed while locked; per-IP limiter on `/v1/mfa/*`. Verified against live Mongo. |
| G3 | TOTP secret at rest | `[Documented]` | Accepted carve-out documented (§2): `mfaSecret` base64 + `select:false`; field-level envelope encryption documented as a deployment knob for DB-out-of-trust-boundary setups. |
| G4 | 503 vs 401 on dependency failure | `[Verified]` | `createAuthenticate` surfaces `SecurityDependencyError` as 503 (instead of collapsing to 401); invalid tokens remain 401. Verified: express 9/9. |
| G5 | Key persistence | `[Verified]` | `initKeyPersistence()` wires `FileKeyStoreAdapter` + scheduled `rotate()` into identity-server bootstrap; keys persist across restarts and rotate on `PEZHWAN_SIGNING_KEY_ROTATION_MS`. Verified: core 20/20 restart round-trip. |
| G6 | Body-size cap | `[Verified]` | Explicit `express.json({ limit })` driven by `PEZHWAN_BODY_LIMIT` (default `100kb`); env rate-limit budgets wired through `config.rateLimit.rules`. Verified: build + express 9/9. |
| G7 | Audit chain in HA | `[Documented]` | Best-effort `prevHash` chain accepted and documented explicitly; deployments requiring strict ordering serialize audit writes to a single-writer shard (follow-up). |

All G1–G7 items closed in `PHASE-C.md` (verified or explicitly documented).