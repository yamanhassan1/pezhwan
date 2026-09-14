# PEZHWAN Authentication Data Flows

This document walks every authentication flow end-to-end. It is grounded in
`../ARCHITECTURE.md` (the concise design reference) and `../THREAT-MODEL.md`
(the STRIDE model with source-verified controls). Services referenced live in
`packages/core/src/{auth,services}/`.

Every flow follows the same middleware pipeline at the HTTP layer
(`apps/identity-server/src/server.ts`):

```
requestContext (requestId/correlationId/X-Response-Time)
→ securityHeaders (CSP, HSTS, nosniff, frame/referrer/permissions policy)
→ corsAllowlist (exact origins; never wildcard with credentials)
→ createAuthenticate (optional: attach req.pezhwan when a token is present)
→ csrfProtection (double-submit cookie on non-safe methods under /v1/auth /v1/mfa /v1/verify)
→ rateLimit (login/register/otp/refresh/api/mfa budget by IP or user)
→ route handler → error handler (envelope { success, data | error })
```

## 1. Register

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Express routes
    participant E as AuthEngine
    participant S as SessionService
    participant T as TokenService
    participant M as MongoDB
    participant A as AuditService

    C->>R: POST /v1/auth/register { email, phone?, password, metadata? }
    R->>E: register({ tenantId, applicationId, device })
    E->>E: evaluate password policy → Argon2id hash
    E->>M: UserModel.create (per-tenant unique {tenantId, email})
    E->>S: create({ userId, tenantId, applicationId, device })
    S->>M: SessionModel.create (status 'active', new familyId)
    S->>M: cache liveness key (Redis 30s)
    E->>T: signAccessToken (RS256, kid, exp, tokenVersion, tenantId)
    E->>A: USER_REGISTERED
    R-->>C: 201 { user, accessToken, refreshToken }
```

Enumeration safety: a duplicate email returns a 400 validation envelope without
distinguishing "exists" from other policy failures.

## 2. Login (password + MFA gate)

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Express routes
    participant E as AuthEngine
    participant S as SessionService
    participant U as UserModel
    participant T as TokenService

    C->>R: POST /v1/auth/login { email|phone, password }
    R->>E: loginPassword({ applicationId, device })
    E->>U: findOne({ tenantId, email })  [every lookup is tenant-scoped]
    E->>E: verify Argon2id hash (rejects non-Argon2 hashes)
    E->>E: lockout check — 5 failed → loginLockUntil 15m (ACCOUNT_LOCKED)
    E->>E: account active check
    E->>E: MFA enabled?
    alt MFA enabled
        R-->>C: 200 { mfaRequired: true, userId }   (no tokens yet)
        C->>E: POST /v1/mfa/login { userId, code }
        E->>E: verifyMfaLogin → TOTP/backup code, constant-time
    end
    E->>S: create() → new refresh family
    E->>T: buildIdentity → sign access JWT
    E->>E: AUDIT LOGIN_SUCCESS
    R-->>C: 200 { user, accessToken, refreshToken }
```

The MFA gate means a valid password never mints tokens while TOTP is enabled
(`auth/auth.engine.ts`). Disabling MFA itself requires a currently-valid
code/backup code.

## 3. OTP login (passwordless)

```
POST /v1/auth/otp/send { channel, target, purpose }
  → validate channel/target/purpose (OTP_PARAMS_REQUIRED otherwise)
  → OtpService.request: one live code per key (unique index),
    resend cooldown 30s → { retryAfterSeconds }, OTP TTL 5m, 6 digits
  → delivered via email/SMS provider (ProviderError on failure → 502)

POST /v1/auth/otp/verify { channel, target, purpose, code }
  → constant-time verify of SHA-256(code) against stored hash
  → ≤5 attempts; exhaustion blocks verify AND regenerate
  → unknown targets burn the cooldown and return a generic 'expired'

POST /v1/auth/otp/login { channel, target, code }
  → same verification, then completes login (MFA-gated when enabled)
  → 200 { user, accessToken, refreshToken } or { mfaRequired, userId }
```

OTP state is keyed by tenant+application and hashed at rest
(`packages/crypto/src/otp.ts`).

## 4. Refresh rotation (active → rotating → replaced; reuse → family revoke)

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Express routes
    participant S as SessionService
    participant M as MongoDB
    participant Re as Redis

    C->>R: POST /v1/auth/refresh { refreshToken }
    R->>S: rotate(refreshToken, { tenantId?, applicationId? })
    S->>S: hash = SHA-256(refreshToken)
    S->>M: findOneAndUpdate({ hash, status:'active' } → 'rotating')  [atomic claim]
    alt claim failed (session already consumed)
        S->>M: find by hash — settled ('replaced'/'revoked'/'expired')?
        alt settled
            S->>M: revokeFamily(familyId)  [the whole chain]
            S-->>R: SessionError REFRESH_TOKEN_REUSE (401)
        else in-flight 'rotating'
            S-->>R: fail closed (loser gets no token - winner completes)
        end
    else claim succeeded
        S->>M: create child session (same familyId, new hash)  [tx]
        S->>M: update parent → status 'replaced', replacedBySessionId
        Re->>Re: liveness cache refreshed for parent + child
        R-->>C: 200 { accessToken, refreshToken }
    end
```

Child creation and parent finalization are wrapped in a MongoDB transaction
when the topology supports it; the atomic `active → rotating` claim serializes
concurrent presentations of the same token to exactly one winner. Only SHA-256
hash values of refresh tokens are stored (`session.model.ts:51`).

## 5. Logout / revoke

```
POST /v1/auth/logout                       → revoke(current sessionId)
POST /v1/sessions/all/revoke               → revokeAll(userId, applicationId)
POST /v1/sessions/:id/revoke               → ownership-checked single revoke

SessionService.revoke:
  SessionModel.updateOne({ _id } { status:'revoked', revokedAt })
  cache.del(`session:<id>`)                → Redis liveness evicted

revokeFamily(familyId):                    → used by reuse detection, mass logout
  updateMany({ familyId } → 'revoked') + evict every cached marker
```

Revocation invalidates both the token path (session status) and the Redis
liveness path used by `isSessionActive`.

## 6. Authenticated request with account-state validation

```mermaid
sequenceDiagram
    participant C as Client
    participant Mw as createAuthenticate
    participant T as TokenService
    participant AS as AccountStateService
    participant Re as Redis
    participant U as UserModel

    C->>Mw: GET/POST with Authorization: Bearer <access>
    Mw->>T: verifyAccessToken (RS256 + kid, exp, iss, aud, tenantId pinned)
    Mw->>AS: validate(userId, tokenVersion)
    AS->>Re: get accountState:<userId>
    alt cache hit (≤30s old)
        AS-->>Mw: { exists, isActive, tokenVersionMatch }
    else cache miss
        AS->>U: UserModel.findById(userId).select('isActive tokenVersion')
        AS->>Re: set accountState:<userId> TTL 30s
    end
    alt valid
        Mw-->>C: req.pezhwan attached { roles, permissions, ... }
    else Mongo unavailable
        Mw-->>C: SecurityDependencyError → 503 (fail closed, never silent-allow)
    else inactive / version mismatch
        Mw-->>C: no identity → requireAuth rejects 401
    end
```

Password change/reset bumps `tokenVersion` and calls `accountState.invalidate`,
so outstanding access tokens stop verifying within the 30s cache TTL
(`auth/auth.engine.ts`). Machine identities (`client_credentials`, API keys)
carry no user account behind the token; their validity is the signature plus a
live key lookup.

## 7. OAuth authorization-code + PKCE (OAuth 2.1)

```
GET /v1/oauth/authorize?client_id&redirect_uri&response_type=code&scope=openid
                      &state&nonce&code_challenge&code_challenge_method=S256    [Bearer]
  → client lookup (registered client, exact redirect_uris match)
  → PKCE: public clients REQUIRE code_challenge S256 (PKCE_REQUIRED otherwise)
  → scope containment (INVALID_SCOPE when not granted)
  → 302 Location: redirect_uri#code=...&state=...

POST /v1/oauth/token  grant_type=authorization_code&code&code_verifier
                      &client_id(&client_secret)&redirect_uri
  → atomic single-use redeem (findOneAndUpdate on consumedAt:null, unique codeHash)
  → constant-time S256 verification of code_verifier
  → PKCE failure → INVALID_GRANT + the bound session is revoked (security event)
  → 200 { access_token, token_type, expires_in, refresh_token, id_token, scope }

Other grants: refresh_token (rotating refresh within the session family),
client_credentials (service identity, `sub = client:<clientId>`).
```

Tokens are audience-scoped (`pezhwan.clients`), carry `tenantId` + `kid`, and
receive `nonce`/`aud` shaping for the ID token.

## 8. Magic-link / verification-token flow

```
POST /v1/verify/magic/send { email, redirectUri }
  → VerificationTokenService.issue (single-purpose, expiring, SHA-256 hashed)
  → { expiresIn }  (enumeration-safe: unknown accounts burn a decoy-style token)

User opens: <redirectUri>?magic=<token>  (signed link, constant-time compare)

POST /v1/verify/magic/redeem { token }
  → redeem(): lookup by hash, single-use consume, expiry + purpose check
  → session created (MFA-gated when enabled)
  → 200 { user, accessToken, refreshToken, redirectUri }
```

The same token service backs password-reset tokens
(`/v1/verify/password/forgot` → `/v1/verify/password/reset/confirm`) with a
15-minute lifetime and email-verification tokens (`/v1/verify/email/verify-token`,
24-hour lifetime), per `DEFAULT_TTL`.
